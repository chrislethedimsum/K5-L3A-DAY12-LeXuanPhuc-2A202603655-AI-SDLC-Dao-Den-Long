# Đảo Đèn Lồng — AI Agent Harness (Phase 2 · Contract v1.1)

- Use Node 22+ and `npm ci` (lockfile is committed).
- `npm run verify` runs `npm test` (headless build + Vitest) and `npm run build` (`tsc --noEmit && vite build && npm run build:headless`).
- `node scripts/collect-proof.mjs` runs full tests, builds, smoke checks, byte-identical determinism across Nights 1–3, Contract v1.1 scenario coverage, and Night 3 `21,600`-tick headless benchmark (`<= 30s`).

## Architecture & Test Contract v1.1 Invariants
- `game.contract.json` (`contract_version: "1.1"`) is the single source of truth for standardized tuning and commands.
- `src/core/` (`maps.ts`, `simulation.ts`, `validators.ts`, `types.ts`, `contract.ts`, `rng.ts`) must stay 100% DOM/WebGL-free, deterministic (Mulberry32 seeded PRNG, integer tick counters, no `Date.now` or `Math.random`), running at 60 Hz (`dt = 1/60`).
- Follow the exact 12-step tick order in Ticket-02:
  1. `pause` input (when paused, `tick` advances, `sim_tick`/timers/spawns/TTLs freeze, snapshot `state: "paused"`).
  2. Decrement timers (time, cooldowns, invuln, stun/recoil, charm, dropped mote TTL, charm respawn, wind, fall respawn).
  3. Move player (run, jump `7.0/-20`, dash `14 m/s * 12 ticks`, launch pads, Night 3 wind) + fall (`y < -10` once, ignoring invuln).
  4. Pickup motes (`XZ <= 1.0`, `|ΔY| <= 1.5`, **no score on pickup**) & charms (`600` ticks).
  5. Deposit into nearest unlit lantern (`XZ <= 2.0`, tie smaller `id`; `+10` per mote deposited, `+100` per lit).
  6. Safe zones (`6 m` around lit lanterns; shades inside when lit push out in `<= 30` ticks with no damage).
  7. Pulse (`3` motes, 3D `<= 5 m` from `y+0.8`, stun `120` ticks, 15-tick `4 m` push, `+5` score per shade, also hits Drifters).
  8. Move Shades (`spawning`, `wander`, `chase`, `recoil`, `stunned`) and Drifters (`idle`, `chase`, `flee`).
  9. Contact: Drifters steal first (`XZ <= 1.2`, `min(3, carried)`), then Shades hit (ascending `id`, max 1 flame/tick, `recoil` 60 ticks).
  10. Scheduled spawns (`createdSimTick = simTick`, active next tick).
  11. Terminal check (`no_flames` > `all_lit` > `dawn`).
  12. Snapshot/events/end JSONL (3 decimals output only).
- Visuals (`src/client/`) must follow the Ticket-02 standard HEX palette (`±10%`), ambient light `0.15 + 0.55*(lit/total)`, persisted settings, Web Audio, and maintain `>= 30 FPS` at `1280x720`.
- Reject invalid flags, malformed JSON, or contract violations with exit code `2` and stderr message.
- Never fabricate test results, FPS metrics, or browser observations.
