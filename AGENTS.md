# Đảo Đèn Lồng — AI Agent Harness

- Use Node 22+ and `npm ci` (lockfile is committed).
- `npm run verify` runs `npm test` (headless build + Vitest) and `npm run build` (`tsc --noEmit && vite build && npm run build:headless`).
- `node scripts/collect-proof.mjs` runs full tests, builds, smoke checks, byte-identical determinism check, and Test Contract v1.0 scenario runs into `docs/proof/`.

## Architecture & Test Contract v1.0 Invariants
- `game.contract.json` at repo root is the single source of truth for `tuning` and commands.
- `src/core/` must stay 100% DOM/WebGL-free, deterministic (Mulberry32 seeded PRNG, no `Date.now` or `Math.random`), and run at fixed 60 Hz (`dt = 1/60`).
- All radii and collisions in `tuning` use horizontal XZ distance (`hypot(dx, dz) <= r`).
- Exact `inputs.frames` sticky input semantics and rising-edge triggers (`jump`, `interact`, `pulse`).
- Exact `cam_yaw_deg` world-space rotation: `x' = x*cosθ + z*sinθ`, `z' = -x*sinθ + z*cosθ`.
- Scenario initialization must emit zero events and award zero score; `lanterns` patches `L1..L5` by `id`.
- Output JSONL records: `snapshot` (default `--snapshot-every 10`), `event` (`{type, tick, name, data}`), and final `end` (`{type:"end", ticks, state, score}`). Round serialized numbers to 3 decimals only on output.
- Reject malformed flags, invalid JSON, or contract violations with exit code `2` and stderr message.
- Never fabricate test results, screenshots, or browser behavior without actually running them.
