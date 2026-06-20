(() => {
  const callbacks = new Map()
  const listeners = new Map()
  let nextId = 1

  const now = Date.now()
  const defaultState = {
    version: 3,
    projects: [
      {
        id: 'p-browser',
        path: '/tmp/browser-smoke',
        name: 'Browser Smoke',
        color: '#f97316',
        addedAt: now,
        activeWorktreePath: null,
        archived: false,
        archivedAt: null
      }
    ],
    sessions: [],
    activeProjectId: null,
    settings: {
      appThemeId: 'ground-control-dark',
      terminalThemeId: 'ember-dark',
      uiHeadingFontFamily: 'unbounded',
      uiHeadingFontSize: 18,
      uiBodyFontFamily: 'system-ui',
      uiBodyFontSize: 13,
      terminalFontFamily: 'jetbrains-mono',
      terminalFontSize: 13,
      terminalBackgroundColor: null,
      terminalBackgroundImage: null,
      terminalBackgroundOpacity: 33,
      worktreeDirectory: '~/.groundcontrol/worktrees',
      terminalPanelHeightPct: 30,
      gitDiffFileListWidth: 260
    },
    shellTerminals: [],
    shellTerminalSeq: {}
  }

  function transformCallback(callback, once = false) {
    const id = nextId++
    callbacks.set(id, (payload) => {
      if (once) callbacks.delete(id)
      return callback?.(payload)
    })
    return id
  }

  function unregisterCallback(id) {
    callbacks.delete(id)
  }

  function runCallback(id, payload) {
    return callbacks.get(id)?.(payload)
  }

  function addListener(event, handlerId) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(handlerId)
    return handlerId
  }

  function removeListener(event, handlerId) {
    listeners.get(event)?.delete(handlerId)
  }

  async function invoke(cmd, args = {}) {
    window.__GC_BROWSER_SMOKE__ ??= { commands: [] }
    window.__GC_BROWSER_SMOKE__.commands.push({ cmd, args })

    switch (cmd) {
      case 'store_load':
        return defaultState
      case 'store_save':
        return null
      case 'system_agents':
        return {
          claude: { found: false, path: null, version: null },
          codex: { found: false, path: null, version: null },
          opencode: { found: false, path: null, version: null },
          cursor: { found: false, path: null, version: null }
        }
      case 'system_home_dir':
        return '/tmp'
      case 'git_info':
        return {
          isRepository: false,
          root: null,
          worktrees: [],
          branches: [],
          error: 'browser smoke mock'
        }
      case 'git_status':
        return {
          isRepository: false,
          filesChanged: 0,
          insertions: 0,
          deletions: 0
        }
      case 'git_diff_files':
        return { files: [] }
      case 'git_file_diff':
        return { hunks: [], binary: false, tooLarge: false, error: null }
      case 'dialog_pick_directory':
        return null
      case 'dialog_confirm_delete':
      case 'dialog_confirm_trash_terminal':
      case 'dialog_confirm_trash_terminals':
        return false
      case 'terminal_bg_copy_upload':
        return { ok: false, error: 'browser smoke mock' }
      case 'terminal_bg_delete':
        return { ok: true }
      case 'transcript_derive_title':
        return null
      case 'plugin:event|listen':
        return addListener(args.event, args.handler)
      case 'plugin:event|unlisten':
        removeListener(args.event, args.eventId)
        return null
      default:
        return null
    }
  }

  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback,
    unregisterCallback,
    runCallback,
    callbacks,
    convertFileSrc: (filePath, protocol = 'asset') => `${protocol}://localhost/${filePath}`,
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' }
    }
  }
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: removeListener
  }
})()
