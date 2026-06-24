use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::agents::{agent_bin, plan_spawn, IdWatch};
use crate::discover::{self, Tool};
use crate::env::{capture_login_env, login_shell, resolve_bin, shell_quote};
use crate::model::{DataEvent, ExitEvent, IdEvent, ShellSpawnOptions, SpawnOptions, SpawnResult};

// Coalesce PTY output before crossing the IPC boundary (port of pty.ts §4).
const FLUSH_MS: u64 = 6;

#[derive(Clone, Copy)]
enum Kind {
    Session,
    Terminal,
}

impl Kind {
    fn data(self) -> &'static str {
        match self {
            Kind::Session => "session-data",
            Kind::Terminal => "terminal-data",
        }
    }
    fn exit(self) -> &'static str {
        match self {
            Kind::Session => "session-exit",
            Kind::Terminal => "terminal-exit",
        }
    }
}

struct SessionHandle {
    gen: u64,
    // Behind its own lock so a blocking write to a child that stopped draining
    // its PTY doesn't hold the global `sessions` lock that resize/kill/finish/
    // spawn all contend on.
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

pub struct PtyManager {
    sessions: Mutex<HashMap<String, SessionHandle>>,
    // Monotonic per-id spawn counter, bumped by every spawn and kill. Shared
    // with the reader/flusher/discover threads so a superseded PTY stops
    // emitting instead of clobbering whatever now owns the id.
    // When both locks are needed, take `gen` before `sessions`.
    gen: Arc<Mutex<HashMap<String, u64>>>,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            gen: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn bump_gen(&self, id: &str) -> u64 {
        let mut g = self.gen.lock().unwrap();
        let next = g.get(id).copied().unwrap_or(0) + 1;
        g.insert(id.to_string(), next);
        next
    }

    fn current_gen(&self, id: &str) -> u64 {
        self.gen.lock().unwrap().get(id).copied().unwrap_or(0)
    }

    pub fn write(&self, id: &str, data: &str) {
        // Take only a clone of the per-session writer handle under the brief
        // `sessions` lock, then write without holding it — a full PTY buffer must
        // not stall resize/kill/finish/spawn app-wide.
        let writer = match self.sessions.lock().unwrap().get(id) {
            Some(h) => h.writer.clone(),
            None => return,
        };
        let mut w = writer.lock().unwrap();
        let _ = w.write_all(data.as_bytes());
        let _ = w.flush();
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) {
        if let Some(h) = self.sessions.lock().unwrap().get(id) {
            let _ = h.master.resize(PtySize {
                rows: rows.max(1),
                cols: cols.max(2),
                pixel_width: 0,
                pixel_height: 0,
            });
        }
    }

    pub fn kill(&self, id: &str) {
        let handle = {
            let mut gen = self.gen.lock().unwrap();
            let next = gen.get(id).copied().unwrap_or(0) + 1;
            gen.insert(id.to_string(), next);
            self.sessions.lock().unwrap().remove(id)
        };
        // Supersede any in-flight spawn so it aborts instead of installing.
        if let Some(mut h) = handle {
            let _ = h.killer.kill();
        }
    }

    pub fn kill_all(&self) {
        let ids: Vec<String> = self.sessions.lock().unwrap().keys().cloned().collect();
        for id in ids {
            self.kill(&id);
        }
    }

    /// Remove a handle only if it's still the given generation (natural exit
    /// cleanup; must not disturb a newer spawn that already replaced the id).
    fn finish(&self, id: &str, gen: u64) {
        let mut s = self.sessions.lock().unwrap();
        if s.get(id).map(|h| h.gen) == Some(gen) {
            s.remove(id);
        }
    }

    pub fn spawn_agent(&self, app: &AppHandle, opts: SpawnOptions) -> SpawnResult {
        self.kill(&opts.id);
        let my_gen = self.bump_gen(&opts.id);

        let Some(bin) = agent_bin(&opts.agent) else {
            return SpawnResult::err(format!("Unknown agent: {}", opts.agent));
        };
        let env = capture_login_env();
        let shell = login_shell(&env);
        let Some(bin_path) = resolve_bin(bin) else {
            return SpawnResult::err(format!(
                "Could not find the `{bin}` CLI on your PATH. Install it, then restart the app."
            ));
        };

        // A newer spawn or a kill raced ahead while we captured env/resolved.
        if self.current_gen(&opts.id) != my_gen {
            return SpawnResult::err("superseded");
        }

        let plan = plan_spawn(
            &opts.agent,
            &opts.mode,
            opts.agent_session_id.as_deref(),
            &bin_path,
        );
        if self.current_gen(&opts.id) != my_gen {
            return SpawnResult::err("superseded");
        }

        // exec through the login shell so the agent owns the PTY's pid/session
        // directly — Ink TUIs bail on the terminal-ownership check otherwise.
        let args = plan
            .argv
            .iter()
            .map(|a| shell_quote(a))
            .collect::<Vec<_>>()
            .join(" ");
        let command = format!("exec {} {}", shell_quote(&bin_path), args)
            .trim_end()
            .to_string();

        let res = self.launch(
            app,
            Kind::Session,
            &opts.id,
            &opts.cwd,
            opts.cols,
            opts.rows,
            &shell,
            &["-lc", &command],
            &env,
            my_gen,
        );
        if res.ok {
            // precreate (cursor): id known now → persist immediately.
            if let Some(id) = plan.emit_id {
                self.emit_id(app, &opts.id, &id, my_gen);
            }
            // discover (codex/opencode): watch only while this PTY stays live.
            let tool = match plan.watch {
                IdWatch::Codex => Some(Tool::Codex),
                IdWatch::Opencode => Some(Tool::Opencode),
                IdWatch::None => None,
            };
            if let Some(tool) = tool {
                self.spawn_discover(app, &opts.id, &opts.cwd, my_gen, tool);
            }
        }
        res
    }

    pub fn spawn_shell(&self, app: &AppHandle, opts: ShellSpawnOptions) -> SpawnResult {
        self.kill(&opts.id);
        let my_gen = self.bump_gen(&opts.id);
        let env = capture_login_env();
        let shell = login_shell(&env);
        if self.current_gen(&opts.id) != my_gen {
            return SpawnResult::err("superseded");
        }
        // Plain interactive login shell in the worktree (P007 ADR-002).
        self.launch(
            app,
            Kind::Terminal,
            &opts.id,
            &opts.cwd,
            opts.cols,
            opts.rows,
            &shell,
            &["-il"],
            &env,
            my_gen,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn launch(
        &self,
        app: &AppHandle,
        kind: Kind,
        id: &str,
        cwd: &str,
        cols: u16,
        rows: u16,
        shell: &str,
        shell_args: &[&str],
        env: &HashMap<String, String>,
        my_gen: u64,
    ) -> SpawnResult {
        let pair = match native_pty_system().openpty(PtySize {
            rows: rows.max(1),
            cols: cols.max(2),
            pixel_width: 0,
            pixel_height: 0,
        }) {
            Ok(p) => p,
            Err(e) => return SpawnResult::err(e.to_string()),
        };

        let mut cmd = CommandBuilder::new(shell);
        for a in shell_args {
            cmd.arg(a);
        }
        cmd.cwd(cwd);
        for (k, v) in env {
            cmd.env(k, v);
        }
        cmd.env("TERM", "xterm-256color");

        let child = match pair.slave.spawn_command(cmd) {
            Ok(c) => c,
            Err(e) => return SpawnResult::err(e.to_string()),
        };
        drop(pair.slave); // master reader sees EOF when the child exits

        let reader = match pair.master.try_clone_reader() {
            Ok(r) => r,
            Err(e) => return SpawnResult::err(e.to_string()),
        };
        let writer = match pair.master.take_writer() {
            Ok(w) => w,
            Err(e) => return SpawnResult::err(e.to_string()),
        };
        let killer = child.clone_killer();

        // Install the handle only if our generation is still current. Keep the
        // gen check and session insertion serialized with kill; otherwise a kill
        // that raced in during openpty/spawn_command could find nothing to remove
        // and this child would leak as an orphan whose flusher exits on the gen
        // mismatch (no exit event, no cleanup).
        let mut stale_killer = Some(killer);
        let installed = {
            let gen = self.gen.lock().unwrap();
            if gen.get(id).copied().unwrap_or(0) == my_gen {
                let mut sessions = self.sessions.lock().unwrap();
                sessions.insert(
                    id.to_string(),
                    SessionHandle {
                        gen: my_gen,
                        writer: Arc::new(Mutex::new(writer)),
                        master: pair.master,
                        killer: stale_killer.take().unwrap(),
                    },
                );
                true
            } else {
                false
            }
        };
        if !installed {
            // Superseded mid-spawn: kill what we just made rather than
            // installing a stale handle.
            let mut killer = stale_killer.unwrap();
            let _ = killer.kill();
            let mut child = child;
            let _ = child.wait(); // reap so the killed child isn't left a zombie
            return SpawnResult::err("superseded");
        }

        // Shared output accumulator + exit channel between reader and flusher.
        let buf = Arc::new(Mutex::new(Vec::<u8>::new()));
        let exited = Arc::new(AtomicBool::new(false));
        let exit_info = Arc::new(Mutex::new((0i32, None::<i32>)));

        // Reader thread: fill the buffer; on EOF, reap the child for its code.
        {
            let buf = buf.clone();
            let exited = exited.clone();
            let exit_info = exit_info.clone();
            let mut reader = reader;
            let mut child = child;
            thread::spawn(move || {
                let mut chunk = [0u8; 65536];
                loop {
                    match reader.read(&mut chunk) {
                        Ok(0) => break,
                        Ok(n) => buf.lock().unwrap().extend_from_slice(&chunk[..n]),
                        Err(_) => break,
                    }
                }
                let code = child.wait().map(|s| s.exit_code() as i32).unwrap_or(-1);
                *exit_info.lock().unwrap() = (code, None);
                exited.store(true, Ordering::SeqCst);
            });
        }

        // Flusher thread: coalesce on a 6ms tick, emit data, then exit. Sole
        // emitter for this PTY → ordered output. Stops if superseded.
        {
            let app = app.clone();
            let gen = self.gen.clone();
            let id = id.to_string();
            let buf = buf.clone();
            let exited = exited.clone();
            let exit_info = exit_info.clone();
            thread::spawn(move || {
                let is_current = || gen.lock().unwrap().get(&id).copied().unwrap_or(0) == my_gen;
                let mut pending: Vec<u8> = Vec::new();
                loop {
                    thread::sleep(Duration::from_millis(FLUSH_MS));
                    if !is_current() {
                        return; // a newer spawn replaced this id
                    }
                    let done = exited.load(Ordering::SeqCst);
                    {
                        let mut b = buf.lock().unwrap();
                        pending.append(&mut b);
                    }
                    if !pending.is_empty() {
                        let valid = match std::str::from_utf8(&pending) {
                            Ok(s) => s.len(),
                            Err(e) => e.valid_up_to(),
                        };
                        if valid > 0 {
                            let s = String::from_utf8_lossy(&pending[..valid]).into_owned();
                            let _ = app.emit(
                                kind.data(),
                                DataEvent {
                                    id: id.clone(),
                                    data: s,
                                },
                            );
                            pending.drain(..valid);
                        }
                    }
                    if done {
                        // Final flush of any trailing (even incomplete) bytes.
                        if !pending.is_empty() {
                            let s = String::from_utf8_lossy(&pending).into_owned();
                            let _ = app.emit(
                                kind.data(),
                                DataEvent {
                                    id: id.clone(),
                                    data: s,
                                },
                            );
                            pending.clear();
                        }
                        let (code, signal) = *exit_info.lock().unwrap();
                        app.state::<PtyManager>().finish(&id, my_gen);
                        let _ = app.emit(
                            kind.exit(),
                            ExitEvent {
                                id: id.clone(),
                                exit_code: code,
                                signal,
                            },
                        );
                        return;
                    }
                }
            });
        }

        SpawnResult::ok()
    }

    fn emit_id(&self, app: &AppHandle, id: &str, agent_session_id: &str, my_gen: u64) {
        if self.current_gen(id) != my_gen {
            return;
        }
        let _ = app.emit(
            "session-id",
            IdEvent {
                id: id.to_string(),
                agent_session_id: agent_session_id.to_string(),
            },
        );
    }

    fn spawn_discover(&self, app: &AppHandle, id: &str, cwd: &str, my_gen: u64, tool: Tool) {
        let app = app.clone();
        let gen = self.gen.clone();
        let id = id.to_string();
        let cwd = cwd.to_string();
        let spawned_at = now_ms();
        thread::spawn(move || {
            let is_alive = || gen.lock().unwrap().get(&id).copied().unwrap_or(0) == my_gen;
            if let Some(sid) = discover::watch(tool, &cwd, spawned_at, &is_alive) {
                if is_alive() {
                    let _ = app.emit(
                        "session-id",
                        IdEvent {
                            id: id.clone(),
                            agent_session_id: sid,
                        },
                    );
                }
            }
        });
    }
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}

// --- Commands ----------------------------------------------------------------

#[tauri::command]
pub async fn session_spawn(app: AppHandle, opts: SpawnOptions) -> SpawnResult {
    tauri::async_runtime::spawn_blocking(move || app.state::<PtyManager>().spawn_agent(&app, opts))
        .await
        .unwrap_or_else(|_| SpawnResult::err("spawn task failed"))
}

#[tauri::command]
pub async fn terminal_spawn(app: AppHandle, opts: ShellSpawnOptions) -> SpawnResult {
    eprintln!("[GC-DBG] terminal_spawn id={} {}x{}", opts.id, opts.cols, opts.rows);
    tauri::async_runtime::spawn_blocking(move || app.state::<PtyManager>().spawn_shell(&app, opts))
        .await
        .unwrap_or_else(|_| SpawnResult::err("spawn task failed"))
}

#[tauri::command]
pub fn session_write(state: State<'_, PtyManager>, id: String, data: String) {
    state.write(&id, &data);
}

#[tauri::command]
pub fn session_resize(state: State<'_, PtyManager>, id: String, cols: u16, rows: u16) {
    state.resize(&id, cols, rows);
}

#[tauri::command]
pub fn session_kill(state: State<'_, PtyManager>, id: String) {
    state.kill(&id);
}

#[tauri::command]
pub fn terminal_write(state: State<'_, PtyManager>, id: String, data: String) {
    state.write(&id, &data);
}

#[tauri::command]
pub fn terminal_resize(state: State<'_, PtyManager>, id: String, cols: u16, rows: u16) {
    eprintln!("[GC-DBG] terminal_resize id={id} {cols}x{rows}");
    state.resize(&id, cols, rows);
}

#[tauri::command]
pub fn terminal_kill(state: State<'_, PtyManager>, id: String) {
    eprintln!("[GC-DBG] terminal_kill id={id}");
    state.kill(&id);
}
