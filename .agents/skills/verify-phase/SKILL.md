---
name: verify-phase
description: Verify Phase 4 release build against Test Contract v1.3, Ticket-04 DoD (bench, soak, leaderboard, accessibility, packaging), and collect reproducible proof.
---

Read `AGENTS.md`, `game.contract.json`, `docs/notes/phase-4.md`, and `docs/notes/retro.md`.
Use Node 22+. Run:
1. `npm run verify` — confirm all 6 test files (84+ tests), `tsc --noEmit`, `vite build`, and `build:headless` pass.
2. `node scripts/collect-proof.mjs` — confirm all 36 checks pass (Phases 1–3 regression, byte-identical determinism across Nights 1–3, all 17 Contract events, Night 3 `18,000`-tick perf `<= 30s`, 10-night soak thresholds, and `--export-leaderboard`).
3. `npm run soak` -> inspect `soak.json`: `crashes === 0`, `nights === 10`, `mem_end_mb <= 1.2 * mem_start_mb`.
4. `npm run bench` -> inspect `bench.json`: `contract_version === "1.3"`, `avg_fps >= 60`, `p1_low_fps >= 30`, `load_ms <= 10000`, `renderer`, `os`, `peak_mem_mb`.
5. `npm run package` -> confirm `release/dao-den-long-v1.0.0-web.tar.gz` builds cleanly.
6. Launch `npm start` and verify in Chrome at `1280x720`:
   - 0 console/WebGL/network errors (0 favicon 404).
   - Settings: all 9 keybinds, conflict detection warning, `"Khôi phục mặc định"`, Reduced Motion, Colorblind, and Large Text (`x1.25`) with `>= 18px` base UI font size.
   - Gameplay: visual subtitles (`shade_spawned` + `#shade-arrow`, wind, final 10s, low-fuel `< 30`).
   - Leaderboard: submission validation, persistence across reload, and `--export-leaderboard out.json`.
Update `docs/proof/phase-4.md` before tagging `phase-4` and creating Release `v1.0.0`.
