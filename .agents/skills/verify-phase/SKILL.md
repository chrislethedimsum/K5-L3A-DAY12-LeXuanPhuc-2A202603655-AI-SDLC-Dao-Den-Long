---
name: verify-phase
description: Verify Phase 2 game against Test Contract v1.1, Ticket-02 DoD, and collect reproducible proof.
---

Read `AGENTS.md`, `game.contract.json`, and `docs/notes/phase-2.md`.
Use Node 22+. Run `npm run verify` and `node scripts/collect-proof.mjs`.
Confirm:
- Night 1, 2, 3 traces are byte-identical across repeated runs with identical seed/scenario/inputs.
- All Phase 1 regression tests (with standardized Ticket-02 tuning) pass alongside all Phase 2 feature scenarios (`dash`, `fall`, `launchpad`, `night3-terrain`, `drifter`, `charm`, `pause`, `safe-push`).
- Night 3 full `21,600`-tick headless run completes well under `30s`.
- All 5 Shade states (`spawning`, `wander`, `chase`, `recoil`, `stunned`) and all Contract v1.0 + v1.1 events + `end` records are verified.
- Invalid flags, malformed JSON, and bad ticks exit with code `2`.

Open the built 3D client (`npm run preview`) in Chrome at `1280x720`:
- Confirm zero WebGL/JS console errors and average FPS `>= 30`.
- Verify Main Menu, persisted Settings across reload, Night 1/2/3 maps & palette, Pause (`Esc`/`P`), full HUD (10-slot mote bar, blinking `<= 30s` timer, dash/pulse cooldowns, deposit hint, off-screen arrow), and replay/Dawn flow.
Update `docs/proof/phase-2.md` and `docs/notes/phase-2.md` with observed results before tagging `phase-2`.
