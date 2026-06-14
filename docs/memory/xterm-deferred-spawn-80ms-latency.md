# useXterm deferred spawn adds ~80ms to first terminal spawn

`src/terminal/useXterm.ts` defers the PTY spawn through an 80ms stability timer
(`queueSpawnWhenReady`) so a hidden/collapsed/animating panel doesn't spawn at
xterm's default 80×24. The single-path state machine routes the happy path
through the same timer, so an immediately-measurable, stable container now
spawns ~80ms after mount instead of synchronously.

Reviewed 2026-06-14 and left as-is: the latency is imperceptible (browser smoke
recorded spawn at 161×6 with a clean console) and the simpler single-path logic
is easier to reason about than branching at mount. If it ever shows up as input
lag on a cold mount, call `spawnWhenReady()` directly at mount when dimensions
are already non-zero — the stability check still gates the hidden/animation
cases.
