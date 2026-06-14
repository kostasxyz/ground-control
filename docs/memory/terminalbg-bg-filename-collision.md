# Terminal-background upload filename is not collision-proof (won't-fix)

`src-tauri/src/terminalbg.rs` (`terminal_bg_copy_upload`) names the stored image
`bg-{now_ms}-{rand:08x}{ext}`, where `rand` is a `DefaultHasher` over
`(now_ms, process::id(), bytes.len())` — deterministic despite the "unique
suffix" comment. Two different images of equal byte length written by the same
process in the same millisecond collide, and the second `fs::write` overwrites
the first.

Reviewed 2026-06-14 and left as-is: not reachable for a single interactive user.
If uploads ever become scripted/multi-source, replace the hash with real entropy
(a UUID suffix or an atomic counter).
