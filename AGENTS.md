# Đảo Đèn Lồng — AI Agent Harness (v1.0.0 · Contract v1.3)

- Use Node 22+ and `npm ci`. Run `npm run verify` (`npm test` + `tsc --noEmit && vite build && npm run build:headless`) and `node scripts/collect-proof.mjs` before finishing any task.
- Contract single source of truth: `game.contract.json` (`contract_version: "1.3"`, declaring `build_cmd`, `run_cmd`, `headless_cmd`, `bench_cmd`, `soak_cmd`).
- Commands: `npm start` (`node scripts/run.mjs`), `npm run bench` (`bench_cmd`), `npm run soak` (`soak_cmd`), `npm run package` (`release/dao-den-long-v1.0.0-web.tar.gz`).

## Architecture & Invariants (Contracts v1.0–v1.3)
- `src/core/` (`simulation.ts`, `maps.ts`, `validators.ts`, `contract.ts`, `rng.ts`, `leaderboard.ts`, `keybinds.ts`) MUST stay 100% DOM/WebGL/FS-free, using Mulberry32 and integer 60 Hz ticks / `fuel60`.
- Client-side creative visuals (dawn sky, rising embers, camera shake/flash, pentatonic audio, stats chips) stay strictly in `src/client/` and are **disabled** when `benchMode` (`?bench=1`) or `reducedMotion` is active.
- `scene.ts` renders Motes and Shades via `THREE.InstancedMesh` so 200+ Shades + 100 Motes run above `60 FPS` without draw-call spikes.
- `soak_cmd` uses deterministic low-memory V8 flags (`--jitless --max-semi-space-size=1 --no-lazy --optimize-for-size --expose-gc`) and hot-path zero-allocation code so `mem_end_mb <= 1.2 * mem_start_mb` across 10 nights.
- `scripts/run.mjs` serves `dist/` (or `web/`), persists top-10 leaderboard to `~/.dao-den-long/leaderboard.json` (override with `DAO_DEN_LONG_DATA_DIR`), and exports via `--export-leaderboard <path>`.
- Accessibility: every visible HUD/modal font MUST stay `>= 18px` at `1280x720`, scale cleanly by `x1.25` when `body.large-text` is set, support 9 conflict-checked keybinds, Reduced Motion, Colorblind mode, and 4 simultaneous visual subtitles.
- Never silently skip failing tests or fabricate logs/benchmarks.
