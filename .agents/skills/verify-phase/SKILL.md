---
name: verify-phase
description: Verify Phase 1 game against Test Contract v1.0 and collect reproducible proof.
---

Read `AGENTS.md`, `game.contract.json`, and `docs/notes/phase-1.md`.
Use Node 22+. Run `npm run verify` and `node scripts/collect-proof.mjs`.
Ensure `seed42-a.jsonl` and `seed42-b.jsonl` are byte-identical, all 7 Test Contract v1.0 event types and `end` records appear across fixtures, and invalid flags/JSON/ticks exit with code `2`.
Verify the built 3D client (`npm run preview`) in a WebGL-capable browser (start, movement/yaw, jump, pause/resume, HUD, win/loss/replay).
Update `docs/proof/phase-1.md` with observed results before tagging `phase-1`.
