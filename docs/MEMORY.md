# Memory

Index of long-lived notes and known issues for ground-control that aren't obvious
from the code. One note per file under `docs/memory/`.

- 2026-06-14 — [useXterm deferred spawn adds ~80ms to first terminal spawn](memory/xterm-deferred-spawn-80ms-latency.md) — single-path 80ms stability timer routes happy path through it too; imperceptible, simpler than branching
- 2026-06-14 — [Terminal-background upload filename is not collision-proof](memory/terminalbg-bg-filename-collision.md) — deterministic "rand" suffix (not random); reviewed won't-fix, near-impossible single-user
