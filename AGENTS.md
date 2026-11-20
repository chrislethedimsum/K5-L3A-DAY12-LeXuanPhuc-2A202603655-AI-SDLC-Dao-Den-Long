# Đảo Đèn Lồng — AI Agent Harness (Phase 3 · Contract v1.2)

- Use Node 22+ and `npm ci`.
- `npm run verify` runs `npm test` (headless build + Vitest) and `npm run build` (`tsc --noEmit && vite build && npm run build:headless`).
- `node scripts/collect-proof.mjs` runs full tests, builds, smoke checks, byte-identical determinism across Nights 1–3, Contract v1.2 scenario coverage (17 events), and Night 3 `18,000`-tick headless benchmark (`<= 30s`).

## Architecture & Test Contract v1.2 Invariants
- `game.contract.json` (`contract_version: "1.2"`) is the single source of truth for tuning (`night1/2/3_duration_s: 240/270/300`, `fuel_max: 100`, `fuel_decay_per_s: 1.0`, `fuel_per_mote: 10`, `relight_cost: 5`, `win_ratio: 0.6`, `drain_per_s: 5`, `low_fuel_threshold: 30`, `capacity_max: 20`).
- `src/core/` stays 100% DOM/WebGL-free, deterministic (Mulberry32, integer ticks, integer `fuel60` 0..6000), running at 60 Hz.
- Lantern fuel uses integer `fuel60` (`1/60` fuel units): subtract `1` per tick when lit, plus `5` per draining Shade (`fuel_drain` every `60` drain ticks). Extinguish immediately after Step 2 if `fuel60 <= 0` (`lantern_out`, `deposited = 0`, `ever_lit = true`).
- Only lit lanterns with `fuel60 >= 1800` (`fuel >= 30`) project a `6 m` safe zone. Refueling past `30` pushes inside Shades out within `<= 30` ticks with no damage.
- `interact` selects eligible lanterns (`!lit`, or `lit && fuel60 < 6000`), skipping full lanterns (`fuel60 === 6000`). Relight cost is `5` when `ever_lit === true` else `10`. Score: `+5` per mote deposited/refueled, `+100` first light, `+40` relight, `+15` pulse on `drain` Shade (`+5` otherwise).
- No early win on `all_lit`; win reason is `dawn_survived` when alive at dawn with `litCount >= ceil(0.6 * totalLanterns)`. `no_flames` always overrides at dawn tick.
- `successful_lights` raises capacity `min(20, 10 + 2 * successful_lights)` per night; scenario pre-lit lanterns do not increment it.
- Colorblind mode (`#00B3FF` shades, `#FFFFFF` + `⚠` danger UI) and color-independent squashed/torn unlit lanterns + 1 Hz low-fuel blink must work in `src/client/`.
- Never silently skip failing old tests; update them with explicit Ticket-03 reasons.
