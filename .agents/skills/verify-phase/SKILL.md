---
name: verify-phase
description: Verify Phase 3 game against Test Contract v1.2, Ticket-03 DoD, and collect reproducible proof.
---

Read `AGENTS.md`, `game.contract.json`, `docs/adr/001-lantern-fuel-and-dawn-survival.md`, and `docs/notes/phase-3.md`.
Use Node 22+. Run `npm run verify` and `node scripts/collect-proof.mjs`.
Confirm:
- Night 1, 2, 3 traces are byte-identical across repeated runs.
- All non-replaced Phase 1–2 tests pass, and replaced tests document explicit Ticket-03 reasons (never skipped).
- All 17 Contract v1.2 event types and `refuel` / `lantern-out-relight` / `shade-drain` / `dawn-survived` / `capacity-growth` scenarios pass.
- Night 3 full `18,000`-tick headless run completes well under `30s`.

Open the built 3D client (`npm run preview`) in Chrome at `1280x720`:
- Confirm zero WebGL/JS console errors and average FPS `>= 30`.
- Verify Colorblind mode toggle persists across reload (`dao_den_long_settings_v1`), unlit lanterns appear squashed/torn, fuel bars & 1 Hz low-fuel blink render, and Night 1/2/3 HUD shows `lit/total (need ceil(0.6*total))` and dynamic `carried/capacity`.
Update `docs/proof/phase-3.md` and `docs/notes/phase-3.md` before tagging `phase-3`.
