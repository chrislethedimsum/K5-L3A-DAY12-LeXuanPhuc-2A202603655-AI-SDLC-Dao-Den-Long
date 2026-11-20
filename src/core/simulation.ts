import { WORLD_CONFIG } from './config';
import contract from './contract';
import { getGroundHeight, isBlockedAtHeight, isInsideShadeMap, NIGHT_MAPS } from './maps';
import { mulberry32 } from './rng';
import { number, validateInputFrame, validateScenario } from './validators';
import type {
  DrifterState,
  EndRecord,
  GameEvent,
  GameEventPayload,
  GameOverReason,
  GameState,
  HudState,
  InputFrame,
  MoteKind,
  NightNumber,
  Pos3,
  Scenario,
  ShadeState,
  Snapshot
} from './types';

export type { EndRecord, GameEvent, HudState, InputFrame, NightNumber, Scenario, Snapshot } from './types';

const t = contract.tuning;
const cfg = WORLD_CONFIG;
const dt = 1 / cfg.tick_hz;

const FUEL_MAX_60 = Math.round(t.fuel_max * cfg.tick_hz);
const LOW_FUEL_60 = Math.round(t.low_fuel_threshold * cfg.tick_hz);
const FUEL_PER_MOTE_60 = Math.round(t.fuel_per_mote * cfg.tick_hz);
const DECAY_PER_TICK_60 = Math.round(t.fuel_decay_per_s);
const DRAIN_PER_TICK_60 = Math.round(t.drain_per_s);

interface InternalLantern {
  id: string;
  pos: Pos3;
  deposited: number;
  lit: boolean;
  fuel60: number;
  everLit: boolean;
  relitCount: number;
}

interface InternalMote {
  id: string;
  pos: Pos3;
  kind: MoteKind;
  ttlTicks: number | null;
  createdSimTick: number;
}

interface InternalShade {
  id: string;
  pos: Pos3;
  state: ShadeState;
  stateTicksLeft: number;
  stunPushTicksLeft: number;
  stunPushDir: [number, number];
  recoilDir: [number, number];
  safePushTicksLeft: number;
  targetLanternId: string | null;
  drainTicks: number;
  wanderAngle: number;
  createdSimTick: number;
}

interface InternalDrifter {
  id: string;
  pos: Pos3;
  state: DrifterState;
  stolen: number;
  hasStolen: boolean;
  fleeTicksLeft: number;
  idleAngle: number;
  createdSimTick: number;
}

interface InternalCharm {
  id: string;
  pos: Pos3;
  available: boolean;
  respawnTicks: number;
}

const distXZ = (a: Pos3, b: Pos3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist3D = (a: Pos3, b: Pos3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const round = (n: number): number => Math.round(n * 1000) / 1000 || 0;
const round1 = (n: number): number => Math.round(n * 10) / 10 || 0;
const roundPos = (p: Pos3): Pos3 => [round(p[0]), round(p[1]), round(p[2])];
const pushEvent = (events: GameEvent[], tick: number, payload: GameEventPayload): void => {
  events.push({ type: 'event', tick, ...payload } as GameEvent);
};

export class GameWorld {
  private tick = 0;
  private simTick = 0;
  private night: NightNumber;
  private initialDurationS: number;
  private remainingSimTicks: number;
  private score = 0;
  private state: GameState = 'playing';
  private reason: GameOverReason | null = null;
  private nightStarted = false;

  private playerPos: Pos3;
  private playerVel: Pos3 = [0, 0, 0];
  private grounded = true;
  private facing: [number, number];
  private flames: number;
  private carried: number;
  private successfulLights: number;
  private invulnTicks = 0;
  private dashTicksLeft = 0;
  private dashCdTicks = 0;
  private dashDir: [number, number] = [0, 1];
  private pulseCdTicks = 0;
  private charmTicks = 0;
  private launchActive = false;
  private launchVx = 0;
  private launchVz = 0;
  private falling = false;
  private respawnTicks = 0;

  private lastJump = false;
  private lastDash = false;
  private lastInteract = false;
  private lastPulse = false;
  private lastPause = false;

  private lanterns: InternalLantern[];
  private motes: InternalMote[] = [];
  private shades: InternalShade[] = [];
  private drifters: InternalDrifter[] = [];
  private charms: InternalCharm[] = [];

  private rng: () => number;
  private randomMotes: boolean;
  private randomShades: boolean;
  private randomDrifters: boolean;
  private windEnabled: boolean;
  private windActive = false;
  private windWarning = false;
  private windDirDeg = 0;
  private benchMode = false;
  private safeLightsBuf: InternalLantern[] = [];

  private idCounters: Record<string, number> = {};
  private ids = new Set<string>();

  constructor(options: { seed?: number; night?: number; scenario?: Scenario; benchMode?: boolean } = {}) {
    const s = options.scenario ?? {};
    const nightNum = (options.night ?? s.night ?? 1) as NightNumber;
    number(nightNum, 'night', 1, 3, true);
    validateScenario(s, nightNum);

    const seed = options.seed ?? s.seed ?? 42;
    number(seed, 'seed', 0, 4294967295, true);

    this.night = options.benchMode ? 1 : nightNum;
    const map = NIGHT_MAPS[this.night];
    this.rng = mulberry32(seed);
    this.initialDurationS = s.time_left_s ?? map.durationS;
    this.remainingSimTicks = Math.max(1, Math.round(this.initialDurationS * cfg.tick_hz));
    this.randomMotes = options.benchMode ? false : (s.random_motes ?? true);
    this.randomShades = options.benchMode ? false : (s.random_shades ?? true);
    this.randomDrifters = options.benchMode ? false : (s.random_drifters ?? map.driftersEnabled);
    this.windEnabled = options.benchMode ? false : (s.wind_enabled ?? map.windEnabled);
    this.benchMode = !!options.benchMode;

    if (this.benchMode) {
      this.playerPos = [0, 0, 0];
      this.facing = [...map.spawnFacing];
      this.grounded = true;
      this.flames = t.flames;
      this.successfulLights = 0;
      this.carried = 0;
      this.lanterns = map.lanterns.map((l, idx) => {
        const lit = idx < 3;
        return {
          id: l.id,
          pos: [...l.pos],
          deposited: lit ? t.lantern_cost : 0,
          lit,
          fuel60: lit ? FUEL_MAX_60 : 0,
          everLit: lit,
          relitCount: 0
        };
      });
      for (const l of this.lanterns) this.ids.add(l.id);

      const litLanterns = this.lanterns.slice(0, 3);
      for (let i = 0; i < 200; i++) {
        let px = 0;
        let pz = 0;
        for (let attempt = 0; attempt < 32; attempt++) {
          const r = Math.sqrt(this.rng()) * 38.5;
          const theta = this.rng() * Math.PI * 2;
          px = Math.cos(theta) * r;
          pz = Math.sin(theta) * r;
          if (litLanterns.every((l) => Math.hypot(px - l.pos[0], pz - l.pos[2]) >= t.safe_radius + 0.5)) {
            break;
          }
        }
        this.shades.push({
          id: this.id('S'),
          pos: [px, 0.8, pz],
          state: 'wander',
          stateTicksLeft: 0,
          stunPushTicksLeft: 0,
          stunPushDir: [1, 0],
          recoilDir: [1, 0],
          safePushTicksLeft: 0,
          targetLanternId: null,
          drainTicks: 0,
          wanderAngle: this.rng() * Math.PI * 2,
          createdSimTick: -1
        });
      }

      for (let i = 0; i < 100; i++) {
        const r = Math.sqrt(this.rng()) * 38.5;
        const theta = this.rng() * Math.PI * 2;
        this.motes.push({
          id: this.id('M'),
          pos: [Math.cos(theta) * r, 0, Math.sin(theta) * r],
          kind: 'random',
          ttlTicks: null,
          createdSimTick: -1
        });
      }
      return;
    }

    this.playerPos = s.player?.pos ? [...s.player.pos] : [...map.spawnPos];
    this.facing = [...map.spawnFacing];
    const groundAtStart = getGroundHeight(this.night, this.playerPos[0], this.playerPos[2]);
    this.grounded =
      groundAtStart !== null && Number.isFinite(groundAtStart) && Math.abs(this.playerPos[1] - groundAtStart) <= 1e-4;
    this.flames = s.player?.flames ?? t.flames;
    this.successfulLights = s.player?.successful_lights ?? 0;
    this.carried = s.player?.carried ?? 0;
    this.invulnTicks =
      s.player?.invuln_ticks ??
      (s.player?.invuln_left_s !== undefined ? Math.round(s.player.invuln_left_s * cfg.tick_hz) : 0);
    this.dashCdTicks = s.player?.dash_cd_ticks ?? 0;
    this.pulseCdTicks =
      s.player?.pulse_cd_ticks ??
      (s.player?.pulse_cooldown_left_s !== undefined ? Math.round(s.player.pulse_cooldown_left_s * cfg.tick_hz) : 0);
    this.charmTicks = s.player?.charm_ticks ?? 0;

    this.lanterns = map.lanterns.map((l) => ({
      id: l.id,
      pos: [...l.pos],
      deposited: 0,
      lit: false,
      fuel60: 0,
      everLit: false,
      relitCount: 0
    }));

    if (s.lanterns) {
      for (const patch of s.lanterns) {
        const target = this.lanterns.find((l) => l.id === patch.id)!;
        if (patch.pos) target.pos = [...patch.pos];
        if (patch.ever_lit !== undefined) target.everLit = patch.ever_lit;

        if (patch.lit === true || (patch.lit === undefined && patch.deposited === t.lantern_cost)) {
          target.lit = true;
          target.everLit = true;
          target.fuel60 = patch.fuel !== undefined ? Math.round(patch.fuel * cfg.tick_hz) : FUEL_MAX_60;
          target.deposited = patch.deposited ?? t.lantern_cost;
        } else {
          target.lit = false;
          target.fuel60 = 0;
          if (patch.deposited !== undefined) target.deposited = patch.deposited;
        }
      }
    }

    for (const l of this.lanterns) this.ids.add(l.id);
    if (s.motes) {
      for (const m of s.motes) {
        if (!Array.isArray(m) && m.id) this.ids.add(m.id);
      }
    }
    if (s.shades) {
      for (const sh of s.shades) {
        if (sh.id) this.ids.add(sh.id);
      }
    }
    if (s.drifters) {
      for (const d of s.drifters) {
        if (d.id) this.ids.add(d.id);
      }
    }
    if (s.charms) {
      for (const c of s.charms) {
        if (c.id) this.ids.add(c.id);
      }
    }

    if (s.motes !== undefined) {
      for (const m of s.motes) {
        if (Array.isArray(m)) {
          this.motes.push({ id: this.id('M'), pos: [...m], kind: 'random', ttlTicks: null, createdSimTick: -1 });
        } else {
          const kind: MoteKind = m.kind ?? 'random';
          this.motes.push({
            id: m.id ?? this.id('M'),
            pos: [...m.pos],
            kind,
            ttlTicks: m.ttl_ticks !== undefined ? m.ttl_ticks : kind === 'dropped' ? cfg.dropped_mote_ttl_ticks : null,
            createdSimTick: -1
          });
        }
      }
    } else if (this.randomMotes) {
      this.spawnInitialMotes();
    }

    if (s.shades !== undefined) {
      for (const sh of s.shades) {
        let state: ShadeState =
          sh.state ?? (distXZ(sh.pos, this.playerPos) <= cfg.shade_detect_radius ? 'chase' : 'wander');
        let ticksLeft = sh.state_ticks_left ?? 0;
        if (sh.stun_left_s !== undefined && sh.stun_left_s > 0) {
          state = 'stunned';
          ticksLeft = Math.round(sh.stun_left_s * cfg.tick_hz);
        }
        let targetLanternId: string | null = sh.target_lantern_id ?? null;
        if (state === 'drain' && !targetLanternId) {
          const low = this.findNearestLowFuelLantern(sh.pos);
          targetLanternId = low?.id ?? this.lanterns.find((l) => l.lit)?.id ?? null;
        }
        this.shades.push({
          id: sh.id ?? this.id('S'),
          pos: [...sh.pos],
          state,
          stateTicksLeft: ticksLeft,
          stunPushTicksLeft: 0,
          stunPushDir: [1, 0],
          recoilDir: [1, 0],
          safePushTicksLeft: 0,
          targetLanternId,
          drainTicks: 0,
          wanderAngle: this.rng() * Math.PI * 2,
          createdSimTick: -1
        });
      }
    }

    if (s.drifters !== undefined) {
      for (const d of s.drifters) {
        const state: DrifterState = d.state ?? 'idle';
        const stolen = d.stolen ?? 0;
        this.drifters.push({
          id: d.id ?? this.id('D'),
          pos: [...d.pos],
          state,
          stolen,
          hasStolen: state === 'flee' || stolen > 0,
          fleeTicksLeft: d.flee_ticks_left ?? (state === 'flee' ? cfg.drifter_flee_ticks : 0),
          idleAngle: this.rng() * Math.PI * 2,
          createdSimTick: -1
        });
      }
    }

    if (s.charms !== undefined) {
      for (const c of s.charms) {
        this.charms.push({
          id: c.id ?? this.id('C'),
          pos: [...c.pos],
          available: c.available ?? true,
          respawnTicks: c.respawn_ticks ?? 0
        });
      }
    } else {
      for (const c of map.charms) {
        this.charms.push({ id: c.id, pos: [...c.pos], available: true, respawnTicks: 0 });
      }
    }
  }

  private getPlayerCapacity(): number {
    return Math.min(t.capacity_max, t.carry_capacity + 2 * this.successfulLights);
  }

  private id(prefix: string): string {
    let generated: string;
    do {
      this.idCounters[prefix] = (this.idCounters[prefix] ?? 0) + 1;
      generated = `${prefix}${this.idCounters[prefix]}`;
    } while (this.ids.has(generated));
    this.ids.add(generated);
    return generated;
  }

  private spawnInitialMotes(): void {
    const pool = [...NIGHT_MAPS[this.night].moteSpawns];
    const count = Math.min(cfg.initial_motes, pool.length);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(this.rng() * pool.length);
      const pt = pool.splice(idx, 1)[0];
      this.motes.push({ id: this.id('M'), pos: [...pt], kind: 'random', ttlTicks: null, createdSimTick: -1 });
    }
  }

  // Only lit lanterns with fuel >= 30 (fuel60 >= 1800) project a 6m safe zone
  private safeLanterns(out: InternalLantern[] = []): InternalLantern[] {
    out.length = 0;
    for (let i = 0; i < this.lanterns.length; i++) {
      const l = this.lanterns[i];
      if (l.lit && l.fuel60 >= LOW_FUEL_60) out.push(l);
    }
    return out;
  }

  private isProtectedByLitLantern(pos: Pos3, safeLights: InternalLantern[] = this.safeLanterns()): boolean {
    for (let i = 0; i < safeLights.length; i++) {
      if (distXZ(pos, safeLights[i].pos) <= t.safe_radius) return true;
    }
    return false;
  }

  private findNearestLowFuelLantern(from: Pos3): InternalLantern | null {
    let best: InternalLantern | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.lanterns.length; i++) {
      const l = this.lanterns[i];
      if (!l.lit || l.fuel60 >= LOW_FUEL_60) continue;
      const d = distXZ(l.pos, from);
      if (best === null || (Math.abs(d - bestD) > 1e-9 ? d < bestD : l.id.localeCompare(best.id) < 0)) {
        best = l;
        bestD = d;
      }
    }
    return best;
  }

  private findNearestUnlitLantern(from: Pos3): InternalLantern | null {
    let best: InternalLantern | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.lanterns.length; i++) {
      const l = this.lanterns[i];
      if (l.lit) continue;
      const d = distXZ(l.pos, from);
      if (best === null || (Math.abs(d - bestD) > 1e-9 ? d < bestD : l.id.localeCompare(best.id) < 0)) {
        best = l;
        bestD = d;
      }
    }
    return best;
  }

  private findSafeZoneEscapeTarget(p: Pos3, lights: InternalLantern[] = this.safeLanterns()): Pos3 | null {
    const valid = (v: Pos3) =>
      isInsideShadeMap(this.night, v[0], v[2]) &&
      lights.every((l) => distXZ(v, l.pos) >= t.safe_radius - 1e-6);

    if (valid(p)) return [p[0], p[1], p[2]];

    const candidates: Pos3[] = [];
    for (const l of lights) {
      const d = distXZ(p, l.pos);
      const dx = d > 1e-9 ? (p[0] - l.pos[0]) / d : 1;
      const dz = d > 1e-9 ? (p[2] - l.pos[2]) / d : 0;
      candidates.push([l.pos[0] + dx * (t.safe_radius + 1e-4), p[1], l.pos[2] + dz * (t.safe_radius + 1e-4)]);
      for (let k = 0; k < 16; k++) {
        const a = (k * Math.PI * 2) / 16;
        candidates.push([
          l.pos[0] + Math.cos(a) * (t.safe_radius + 1e-4),
          p[1],
          l.pos[2] + Math.sin(a) * (t.safe_radius + 1e-4)
        ]);
      }
    }
    for (let i = 0; i < lights.length; i++) {
      for (let j = i + 1; j < lights.length; j++) {
        const a = lights[i].pos;
        const b = lights[j].pos;
        const d = distXZ(a, b);
        if (d < 1e-10 || d > t.safe_radius * 2) continue;
        const along = d / 2;
        const h = Math.sqrt(Math.max(0, t.safe_radius * t.safe_radius - along * along));
        const dx = (b[0] - a[0]) / d;
        const dz = (b[2] - a[2]) / d;
        for (const sign of [-1, 1]) {
          candidates.push([a[0] + along * dx - sign * h * dz, p[1], a[2] + along * dz + sign * h * dx]);
        }
      }
    }
    return candidates.filter(valid).sort((a, b) => distXZ(a, p) - distXZ(b, p))[0] ?? null;
  }

  private movePlayerHorizontal(dx: number, dz: number): void {
    const nx = this.playerPos[0] + dx;
    const nz = this.playerPos[2] + dz;
    if (!isBlockedAtHeight(this.night, nx, nz, this.playerPos[1], cfg.step_up_max)) {
      this.playerPos[0] = nx;
      this.playerPos[2] = nz;
      return;
    }
    if (!isBlockedAtHeight(this.night, nx, this.playerPos[2], this.playerPos[1], cfg.step_up_max)) {
      this.playerPos[0] = nx;
      return;
    }
    if (!isBlockedAtHeight(this.night, this.playerPos[0], nz, this.playerPos[1], cfg.step_up_max)) {
      this.playerPos[2] = nz;
    }
  }

  private tryShadePos(s: InternalShade, tx: number, tz: number, lights: InternalLantern[] | null): boolean {
    const gh = getGroundHeight(this.night, tx, tz);
    if (gh === null || !Number.isFinite(gh)) return false;
    if (gh > s.pos[1] + cfg.step_up_max + 0.8) return false;
    if (lights) {
      for (let i = 0; i < lights.length; i++) {
        const l = lights[i];
        if (Math.hypot(tx - l.pos[0], tz - l.pos[2]) < t.safe_radius - 1e-6) return false;
      }
    }
    s.pos[0] = tx;
    s.pos[2] = tz;
    s.pos[1] = Math.max(gh, s.pos[1] - 0.8 >= gh ? gh + 0.8 : gh);
    return true;
  }

  private moveShadeStep(
    s: InternalShade,
    dx: number,
    dz: number,
    respectSafeZone: boolean,
    safeLights?: InternalLantern[]
  ): boolean {
    const lights = respectSafeZone ? (safeLights ?? this.safeLanterns(this.safeLightsBuf)) : null;
    if (this.tryShadePos(s, s.pos[0] + dx, s.pos[2] + dz, lights)) return true;
    if (Math.abs(dx) > 1e-9 && this.tryShadePos(s, s.pos[0] + dx, s.pos[2], lights)) return true;
    if (Math.abs(dz) > 1e-9 && this.tryShadePos(s, s.pos[0], s.pos[2] + dz, lights)) return true;
    return false;
  }

  snapshot(): Snapshot {
    const timeLeft = Math.max(0, this.remainingSimTicks / cfg.tick_hz);
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.state,
      time_left_s: round(timeLeft),
      score: this.score,
      wind: {
        active: this.windActive,
        dir_deg: round(this.windDirDeg)
      },
      player: {
        pos: roundPos(this.playerPos),
        vel: roundPos(this.playerVel),
        grounded: this.grounded,
        flames: this.flames,
        carried: this.carried,
        capacity: this.getPlayerCapacity(),
        invuln: this.invulnTicks > 0,
        dash_cd_s: round(this.dashCdTicks / cfg.tick_hz),
        pulse_cd_s: round(this.pulseCdTicks / cfg.tick_hz),
        charm_s: round(this.charmTicks / cfg.tick_hz)
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: roundPos(l.pos),
        lit: l.lit,
        deposited: l.deposited,
        fuel: l.lit ? round1(Math.max(0, l.fuel60) / cfg.tick_hz) : 0,
        ever_lit: l.everLit,
        relit_count: l.relitCount
      })),
      shades: this.shades.map((s) => ({
        id: s.id,
        pos: roundPos(s.pos),
        state: s.state
      })),
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: roundPos(m.pos),
        kind: m.kind,
        ttl_s: m.ttlTicks === null ? null : round(m.ttlTicks / cfg.tick_hz)
      })),
      motes_active: this.motes.length,
      drifters: this.drifters.map((d) => ({
        id: d.id,
        pos: roundPos(d.pos),
        state: d.state,
        stolen: d.stolen
      })),
      charms: this.charms.map((c) => ({
        id: c.id,
        pos: roundPos(c.pos),
        available: c.available,
        respawn_s: round(c.respawnTicks / cfg.tick_hz)
      }))
    };
  }

  getState(): GameState {
    return this.state;
  }

  hudState(): HudState {
    return {
      invuln_left_s: round(this.invulnTicks / cfg.tick_hz),
      dash_cd_s: round(this.dashCdTicks / cfg.tick_hz),
      pulse_cd_s: round(this.pulseCdTicks / cfg.tick_hz),
      charm_s: round(this.charmTicks / cfg.tick_hz),
      wind_warning: this.windWarning,
      wind_active: this.windActive,
      wind_dir_deg: round(this.windDirDeg),
      reason: this.reason,
      respawning: this.respawnTicks > 0
    };
  }

  endRecord(): EndRecord {
    return {
      type: 'end',
      ticks: this.tick,
      state: this.state,
      score: this.score
    };
  }

  step(input: Partial<InputFrame> = {}): GameEvent[] {
    if (this.state === 'won' || this.state === 'lost') return [];
    validateInputFrame(input);
    if (input.tick !== undefined && input.tick !== this.tick) {
      throw new Error('input.tick must equal current tick');
    }

    if (this.benchMode) {
      this.tick++;
      this.simTick++;
      const benchMap = NIGHT_MAPS[this.night];
      const safeLights = this.safeLanterns(this.safeLightsBuf);
      const stepM = benchMap.shadeSpeed * 0.5 * dt;
      for (let i = 0; i < this.shades.length; i++) {
        const s = this.shades[i];
        if (!this.moveShadeStep(s, Math.cos(s.wanderAngle) * stepM, Math.sin(s.wanderAngle) * stepM, true, safeLights)) {
          s.wanderAngle += Math.PI * 0.75;
        }
      }
      return [];
    }

    const events: GameEvent[] = [];

    // Step 1: Read input & handle pause first
    const pausePressed = !!input.pause && !this.lastPause;
    this.lastPause = !!input.pause;
    if (this.state === 'playing' && pausePressed) {
      this.state = 'paused';
      this.tick++;
      pushEvent(events, this.tick, { name: 'paused', data: {} });
      return events;
    }
    if (this.state === 'paused') {
      if (pausePressed) {
        this.state = 'playing';
        pushEvent(events, this.tick + 1, { name: 'resumed', data: {} });
      } else {
        this.tick++;
        return [];
      }
    }

    this.tick++;
    this.simTick++;
    const stepTick = this.tick;

    if (!this.nightStarted) {
      this.nightStarted = true;
      pushEvent(events, stepTick, { name: 'night_start', data: { night: this.night } });
    }

    const map = NIGHT_MAPS[this.night];

    // Step 2: Decrement timers + lantern fuel decay & drain
    this.remainingSimTicks = Math.max(0, this.remainingSimTicks - 1);
    if (this.dashCdTicks > 0) this.dashCdTicks--;
    if (this.dashTicksLeft > 0) this.dashTicksLeft--;
    if (this.pulseCdTicks > 0) this.pulseCdTicks--;
    if (this.invulnTicks > 0) this.invulnTicks--;
    if (this.charmTicks > 0) this.charmTicks--;

    if (this.respawnTicks > 0) {
      this.respawnTicks--;
      if (this.respawnTicks === 0) {
        this.playerPos = [...map.spawnPos];
        this.playerVel = [0, 0, 0];
        this.grounded = true;
        this.facing = [...map.spawnFacing];
        this.falling = false;
        this.launchActive = false;
        this.dashTicksLeft = 0;
        this.invulnTicks = cfg.invuln_ticks;
      }
    }

    {
      let writeIdx = 0;
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i];
        if (m.ttlTicks === null) {
          this.motes[writeIdx++] = m;
        } else {
          m.ttlTicks--;
          if (m.ttlTicks > 0) this.motes[writeIdx++] = m;
        }
      }
      this.motes.length = writeIdx;
    }

    for (const c of this.charms) {
      if (!c.available && c.respawnTicks > 0) {
        c.respawnTicks--;
        if (c.respawnTicks === 0) c.available = true;
      }
    }

    for (const s of this.shades) {
      if (s.stateTicksLeft > 0) {
        s.stateTicksLeft--;
        if (s.stateTicksLeft === 0 && (s.state === 'spawning' || s.state === 'stunned' || s.state === 'recoil')) {
          s.state =
            s.state === 'stunned'
              ? 'wander'
              : distXZ(s.pos, this.playerPos) <= cfg.shade_detect_radius
                ? 'chase'
                : 'wander';
        }
      }
      if (s.safePushTicksLeft > 0) s.safePushTicksLeft--;
    }

    if (this.drifters.length > 0) {
      let writeIdx = 0;
      for (let i = 0; i < this.drifters.length; i++) {
        const d = this.drifters[i];
        if (d.state === 'flee') {
          d.fleeTicksLeft--;
          if (d.fleeTicksLeft > 0) this.drifters[writeIdx++] = d;
        } else {
          this.drifters[writeIdx++] = d;
        }
      }
      this.drifters.length = writeIdx;
    }

    if (this.windEnabled) {
      const cycleTick = this.simTick % cfg.wind_interval_ticks;
      if (this.simTick >= cfg.wind_interval_ticks - cfg.wind_warn_ticks) {
        if (cycleTick === cfg.wind_interval_ticks - cfg.wind_warn_ticks) {
          this.windDirDeg = Math.floor(this.rng() * 360);
        }
        this.windWarning = cycleTick >= cfg.wind_interval_ticks - cfg.wind_warn_ticks;
        this.windActive = this.simTick >= cfg.wind_interval_ticks && cycleTick < cfg.wind_duration_ticks;
      } else {
        this.windWarning = false;
        this.windActive = false;
      }
    } else {
      this.windWarning = false;
      this.windActive = false;
    }

    // Lantern fuel natural decay (1/60 per tick) + Shade drain (5/60 per tick)
    for (const l of this.lanterns) {
      if (l.lit) l.fuel60 -= DECAY_PER_TICK_60;
    }
    if (this.shades.length > 0 && this.shades.some((s) => s.state === 'drain' && s.targetLanternId)) {
      const drainingShades = this.shades
        .filter((s) => s.state === 'drain' && s.targetLanternId)
        .sort((a, b) => a.id.localeCompare(b.id));
      for (const s of drainingShades) {
        const l = this.lanterns.find((x) => x.id === s.targetLanternId);
        if (l && l.lit) {
          l.fuel60 -= DRAIN_PER_TICK_60;
          s.drainTicks++;
          if (s.drainTicks % cfg.tick_hz === 0) {
            pushEvent(events, stepTick, {
              name: 'fuel_drain',
              data: { lantern_id: l.id, shade_id: s.id, fuel: round1(Math.max(0, l.fuel60) / cfg.tick_hz) }
            });
          }
        }
      }
    }
    // Immediately extinguish any lit lantern with fuel60 <= 0
    for (const l of this.lanterns) {
      if (l.lit && l.fuel60 <= 0) {
        l.lit = false;
        l.fuel60 = 0;
        l.deposited = 0;
        l.everLit = true;
        pushEvent(events, stepTick, { name: 'lantern_out', data: { lantern_id: l.id } });
        for (const s of this.shades) {
          if (s.state === 'drain' && s.targetLanternId === l.id) {
            s.state = 'wander';
            s.targetLanternId = null;
            s.drainTicks = 0;
          }
        }
      }
    }

    // Step 3: Move Mây (jump, dash, launch pads, wind) and fall check
    const rawMove = input.move ?? [0, 0];
    const moveLen = Math.max(1, Math.hypot(rawMove[0], rawMove[1]));
    const mx = rawMove[0] / moveLen;
    const mz = rawMove[1] / moveLen;
    const yawRad = (((input.cam_yaw_deg ?? 0) % 360) * Math.PI) / 180;
    const cosY = Math.cos(yawRad);
    const sinY = Math.sin(yawRad);
    const wx = mx * cosY + mz * sinY;
    const wz = -mx * sinY + mz * cosY;
    const wLen = Math.hypot(wx, wz);

    const dashPressed = !!input.dash && !this.lastDash;
    const jumpPressed = !!input.jump && !this.lastJump;
    this.lastDash = !!input.dash;
    this.lastJump = !!input.jump;

    if (this.respawnTicks === 0 && !this.falling) {
      if (wLen > 1e-6) {
        this.facing = [wx / wLen, wz / wLen];
      }

      if (dashPressed && this.dashTicksLeft === 0 && (this.dashCdTicks === 0 || this.charmTicks > 0)) {
        this.dashTicksLeft = cfg.dash_ticks;
        this.dashCdTicks = this.charmTicks > 0 ? 0 : cfg.dash_cooldown_ticks;
        this.dashDir = wLen > 1e-6 ? [wx / wLen, wz / wLen] : [...this.facing];
        this.launchActive = false;
        this.playerVel[1] = 0;
        pushEvent(events, stepTick, { name: 'dash', data: {} });
      }

      let vx = 0;
      let vz = 0;
      if (this.dashTicksLeft > 0) {
        vx = this.dashDir[0] * t.dash_speed;
        vz = this.dashDir[1] * t.dash_speed;
      } else if (this.launchActive) {
        vx = this.launchVx;
        vz = this.launchVz;
      } else {
        const speed = this.charmTicks > 0 ? cfg.charm_speed : t.player_speed;
        vx = wx * speed;
        vz = wz * speed;
      }

      if (this.windActive) {
        const wr = (this.windDirDeg * Math.PI) / 180;
        vx += Math.cos(wr) * cfg.wind_push_speed;
        vz += Math.sin(wr) * cfg.wind_push_speed;
      }

      if (jumpPressed && this.grounded && this.dashTicksLeft === 0) {
        this.playerVel[1] = cfg.jump_speed;
        this.grounded = false;
      }

      this.playerVel[0] = vx;
      this.playerVel[2] = vz;
      this.movePlayerHorizontal(vx * dt, vz * dt);

      if (this.dashTicksLeft > 0) {
        this.playerVel[1] = 0;
      } else {
        const gH = getGroundHeight(this.night, this.playerPos[0], this.playerPos[2]);
        if (this.grounded && gH !== null && Number.isFinite(gH) && Math.abs(gH - this.playerPos[1]) <= cfg.step_up_max) {
          this.playerPos[1] = gH;
          this.playerVel[1] = 0;
          this.grounded = true;
        } else {
          this.grounded = false;
          this.playerVel[1] += cfg.gravity * dt;
          const nextY = this.playerPos[1] + this.playerVel[1] * dt;
          if (
            this.playerVel[1] <= 0 &&
            gH !== null &&
            Number.isFinite(gH) &&
            this.playerPos[1] >= gH - cfg.step_up_max &&
            nextY <= gH
          ) {
            this.playerPos[1] = gH;
            this.playerVel[1] = 0;
            this.grounded = true;
            this.launchActive = false;
          } else {
            this.playerPos[1] = nextY;
            this.grounded = false;
          }
        }
      }

      if (this.dashTicksLeft === 0 && !this.launchActive) {
        for (const pad of map.launchPads) {
          if (distXZ(this.playerPos, pad.pos) <= pad.radius && Math.abs(this.playerPos[1] - pad.pos[1]) <= 0.6) {
            this.launchActive = true;
            this.launchVx = pad.vx;
            this.launchVz = pad.vz;
            this.playerVel = [pad.vx, pad.vy, pad.vz];
            this.grounded = false;
            break;
          }
        }
      }

      if (t.fall_enabled && this.playerPos[1] < cfg.fall_y_threshold && !this.falling) {
        this.falling = true;
        this.flames = Math.max(0, this.flames - 1);
        const lost = this.carried;
        this.carried = 0;
        this.playerPos[1] = cfg.fall_y_threshold;
        this.playerVel = [0, 0, 0];
        this.launchActive = false;
        this.dashTicksLeft = 0;
        if (this.flames > 0) this.respawnTicks = cfg.respawn_wait_ticks;
        pushEvent(events, stepTick, { name: 'player_hit', data: { by: 'fall', flames: this.flames, dropped: 0, lost } });
      }
    }

    // Step 4: Pickup motes (up to dynamic capacity) and charms
    if (this.respawnTicks === 0 && !this.falling) {
      const cap = this.getPlayerCapacity();
      let writeIdx = 0;
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i];
        if (
          m.createdSimTick < this.simTick &&
          this.carried < cap &&
          distXZ(this.playerPos, m.pos) <= t.pickup_radius &&
          Math.abs(this.playerPos[1] - m.pos[1]) <= 1.5
        ) {
          this.carried++;
          pushEvent(events, stepTick, { name: 'mote_picked', data: { carried: this.carried } });
        } else {
          this.motes[writeIdx++] = m;
        }
      }
      this.motes.length = writeIdx;

      for (const c of this.charms) {
        if (
          c.available &&
          distXZ(this.playerPos, c.pos) <= t.pickup_radius &&
          Math.abs(this.playerPos[1] - c.pos[1]) <= 1.5
        ) {
          c.available = false;
          c.respawnTicks = cfg.charm_respawn_ticks;
          this.charmTicks = cfg.charm_duration_ticks;
          this.dashCdTicks = 0;
          pushEvent(events, stepTick, { name: 'charm_picked', data: { charm_id: c.id, charm_ticks: cfg.charm_duration_ticks } });
        }
      }
    }

    // Step 5: Interact with eligible lantern (unlit OR lit with fuel < 100)
    const interactPressed = !!input.interact && !this.lastInteract;
    this.lastInteract = !!input.interact;
    if (interactPressed && this.respawnTicks === 0 && !this.falling && this.carried > 0) {
      const target = this.lanterns
        .filter(
          (l) =>
            (!l.lit || l.fuel60 < FUEL_MAX_60) &&
            distXZ(l.pos, this.playerPos) <= t.interact_radius &&
            Math.abs(l.pos[1] - this.playerPos[1]) <= 2.0
        )
        .sort((a, b) => {
          const da = distXZ(a.pos, this.playerPos);
          const db = distXZ(b.pos, this.playerPos);
          return Math.abs(da - db) > 1e-9 ? da - db : a.id.localeCompare(b.id);
        })[0];

      if (target) {
        if (!target.lit) {
          const cost = target.everLit ? t.relight_cost : t.lantern_cost;
          const amount = Math.min(this.carried, cost - target.deposited);
          if (amount > 0) {
            target.deposited += amount;
            this.carried -= amount;
            this.score += amount * t.score.per_mote;
            pushEvent(events, stepTick, {
              name: 'deposit',
              data: { lantern_id: target.id, amount, deposited: target.deposited }
            });
            if (target.deposited >= cost) {
              const relight = target.everLit;
              target.lit = true;
              target.fuel60 = FUEL_MAX_60;
              target.everLit = true;
              if (relight) target.relitCount++;
              this.successfulLights++;
              this.score += relight ? 40 : t.score.per_lantern;
              pushEvent(events, stepTick, { name: 'lantern_lit', data: { lantern_id: target.id, relight } });
              for (const s of this.shades) {
                if (distXZ(s.pos, target.pos) < t.safe_radius) {
                  s.safePushTicksLeft = Math.max(s.safePushTicksLeft, cfg.safe_push_max_ticks);
                }
              }
            }
          }
        } else {
          // Refuel lit lantern (only when fuel < 100)
          const neededFuel60 = FUEL_MAX_60 - target.fuel60;
          const used = Math.min(this.carried, Math.ceil(neededFuel60 / FUEL_PER_MOTE_60));
          if (used > 0) {
            const wasLow = target.fuel60 < LOW_FUEL_60;
            target.fuel60 = Math.min(FUEL_MAX_60, target.fuel60 + used * FUEL_PER_MOTE_60);
            this.carried -= used;
            this.score += used * t.score.per_mote;
            pushEvent(events, stepTick, {
              name: 'refuel',
              data: { lantern_id: target.id, amount: used, fuel: round1(target.fuel60 / cfg.tick_hz) }
            });
            if (wasLow && target.fuel60 >= LOW_FUEL_60) {
              for (const s of this.shades) {
                if (s.state === 'drain' && s.targetLanternId === target.id) {
                  s.state = 'wander';
                  s.targetLanternId = null;
                  s.drainTicks = 0;
                }
                if (distXZ(s.pos, target.pos) < t.safe_radius) {
                  s.safePushTicksLeft = Math.max(s.safePushTicksLeft, cfg.safe_push_max_ticks);
                }
              }
            }
          }
        }
      }
    }

    // Step 6: Update safe zones (lit && fuel >= 30)
    const safeLights = this.safeLanterns(this.safeLightsBuf);
    if (safeLights.length > 0 && this.shades.length > 0) {
      for (const s of this.shades) {
        if (this.isProtectedByLitLantern(s.pos, safeLights)) {
          const target = this.findSafeZoneEscapeTarget(s.pos, safeLights);
          if (target) {
            if (s.safePushTicksLeft > 0) {
              const dx = target[0] - s.pos[0];
              const dz = target[2] - s.pos[2];
              const frac = 1 / s.safePushTicksLeft;
              s.pos[0] += dx * frac;
              s.pos[2] += dz * frac;
            } else {
              s.pos[0] = target[0];
              s.pos[2] = target[2];
            }
          }
        }
      }
    }

    // Step 7: Tỏa Sáng (Pulse) — +15 total if Shade was draining, +5 otherwise
    const pulsePressed = !!input.pulse && !this.lastPulse;
    this.lastPulse = !!input.pulse;
    if (
      pulsePressed &&
      this.respawnTicks === 0 &&
      !this.falling &&
      this.carried >= t.pulse_cost &&
      this.pulseCdTicks === 0
    ) {
      this.carried -= t.pulse_cost;
      this.pulseCdTicks = cfg.pulse_cooldown_ticks;
      const pulseCenter: Pos3 = [this.playerPos[0], this.playerPos[1] + cfg.pulse_center_y_offset, this.playerPos[2]];
      const stunnedIds: string[] = [];

      for (const s of this.shades) {
        if (s.createdSimTick < this.simTick && dist3D(pulseCenter, s.pos) <= t.pulse_radius) {
          const wasDraining = s.state === 'drain';
          const d = distXZ(pulseCenter, s.pos);
          const dirX = d > 1e-9 ? (s.pos[0] - pulseCenter[0]) / d : 1;
          const dirZ = d > 1e-9 ? (s.pos[2] - pulseCenter[2]) / d : 0;
          s.state = 'stunned';
          s.stateTicksLeft = cfg.pulse_stun_ticks;
          s.stunPushTicksLeft = cfg.pulse_push_ticks;
          s.stunPushDir = [dirX, dirZ];
          s.targetLanternId = null;
          s.drainTicks = 0;
          this.score += wasDraining ? 15 : t.score.per_stun;
          stunnedIds.push(s.id);
        }
      }

      for (const d of this.drifters) {
        if (d.createdSimTick < this.simTick && dist3D(pulseCenter, d.pos) <= t.pulse_radius) {
          if (d.state === 'chase') {
            d.state = 'flee';
            d.fleeTicksLeft = cfg.drifter_flee_ticks;
          } else if (d.state === 'flee' && d.stolen > 0) {
            const dropAmount = d.stolen;
            const gh = getGroundHeight(this.night, d.pos[0], d.pos[2]);
            const dropY = gh !== null && Number.isFinite(gh) ? gh : 0;
            for (let i = 0; i < dropAmount; i++) {
              this.motes.push({
                id: this.id('M'),
                pos: [d.pos[0], dropY, d.pos[2]],
                kind: 'dropped',
                ttlTicks: cfg.dropped_mote_ttl_ticks,
                createdSimTick: this.simTick
              });
            }
            d.stolen = 0;
            d.fleeTicksLeft = cfg.drifter_pulse_drop_flee_ticks;
            pushEvent(events, stepTick, { name: 'drifter_drop', data: { drifter_id: d.id, amount: dropAmount } });
          }
        }
      }

      pushEvent(events, stepTick, { name: 'pulse', data: { stunned_ids: stunnedIds } });
    }

    // Step 8: Move Shades (with drain state machine) & Drifters
    for (const s of this.shades) {
      if (s.createdSimTick === this.simTick) continue;
      if (s.state === 'spawning') continue;
      if (s.state === 'stunned') {
        if (s.stunPushTicksLeft > 0) {
          const stepM = t.pulse_push_m / cfg.pulse_push_ticks;
          const moved = this.moveShadeStep(s, s.stunPushDir[0] * stepM, s.stunPushDir[1] * stepM, false);
          if (!moved) s.stunPushTicksLeft = 0;
          else s.stunPushTicksLeft--;
        }
        continue;
      }
      if (s.state === 'recoil') {
        const stepM = cfg.recoil_distance_m / cfg.recoil_ticks;
        this.moveShadeStep(s, s.recoilDir[0] * stepM, s.recoilDir[1] * stepM, true, safeLights);
        continue;
      }

      const dPlayer = distXZ(s.pos, this.playerPos);

      if (s.state === 'drain') {
        const targetLantern = s.targetLanternId ? this.lanterns.find((l) => l.id === s.targetLanternId) : null;
        if (this.respawnTicks === 0 && !this.falling && dPlayer <= 6.0) {
          s.state = 'chase';
          s.targetLanternId = null;
          s.drainTicks = 0;
        } else if (
          !targetLantern ||
          !targetLantern.lit ||
          targetLantern.fuel60 >= LOW_FUEL_60 ||
          distXZ(s.pos, targetLantern.pos) > 2.0
        ) {
          s.state = 'wander';
          s.targetLanternId = null;
          s.drainTicks = 0;
        } else {
          continue; // Remain stationary draining
        }
      }

      if (s.state === 'wander' && dPlayer <= cfg.shade_detect_radius) {
        s.state = 'chase';
        s.targetLanternId = null;
      } else if (s.state === 'chase' && dPlayer > cfg.shade_lose_radius) {
        s.state = 'wander';
      }

      if (s.state === 'chase') {
        if (dPlayer > 1e-9) {
          const stepM = Math.min(dPlayer, map.shadeSpeed * dt);
          this.moveShadeStep(
            s,
            ((this.playerPos[0] - s.pos[0]) / dPlayer) * stepM,
            ((this.playerPos[2] - s.pos[2]) / dPlayer) * stepM,
            true,
            safeLights
          );
        }
      } else {
        // wander: prioritize nearest low-fuel lit lantern (< 30), else nearest unlit lantern, else drift
        const lowTarget = this.findNearestLowFuelLantern(s.pos);
        if (lowTarget) {
          const dLow = distXZ(s.pos, lowTarget.pos);
          if (dLow <= 2.0) {
            s.state = 'drain';
            s.targetLanternId = lowTarget.id;
            s.drainTicks = 0;
          } else {
            const stepM = Math.min(dLow, map.shadeSpeed * dt);
            this.moveShadeStep(
              s,
              ((lowTarget.pos[0] - s.pos[0]) / dLow) * stepM,
              ((lowTarget.pos[2] - s.pos[2]) / dLow) * stepM,
              true,
              safeLights
            );
            if (distXZ(s.pos, lowTarget.pos) <= 2.0) {
              s.state = 'drain';
              s.targetLanternId = lowTarget.id;
              s.drainTicks = 0;
            }
          }
        } else {
          const unlitTarget = this.findNearestUnlitLantern(s.pos);
          if (unlitTarget && distXZ(s.pos, unlitTarget.pos) > 2.0) {
            const dUnlit = distXZ(s.pos, unlitTarget.pos);
            const stepM = Math.min(dUnlit, map.shadeSpeed * 0.5 * dt);
            const moved = this.moveShadeStep(
              s,
              ((unlitTarget.pos[0] - s.pos[0]) / dUnlit) * stepM,
              ((unlitTarget.pos[2] - s.pos[2]) / dUnlit) * stepM,
              true,
              safeLights
            );
            if (!moved) {
              const drift = map.shadeSpeed * 0.5 * dt;
              if (!this.moveShadeStep(s, Math.cos(s.wanderAngle) * drift, Math.sin(s.wanderAngle) * drift, true, safeLights)) {
                s.wanderAngle += Math.PI * 0.75;
              }
            }
          } else {
            const stepM = map.shadeSpeed * 0.5 * dt;
            if (!this.moveShadeStep(s, Math.cos(s.wanderAngle) * stepM, Math.sin(s.wanderAngle) * stepM, true, safeLights)) {
              s.wanderAngle += Math.PI * 0.75;
            }
          }
        }
      }
    }

    for (const d of this.drifters) {
      if (d.createdSimTick === this.simTick) continue;
      const distP = distXZ(d.pos, this.playerPos);
      if (d.state === 'idle') {
        if (!d.hasStolen && this.carried >= cfg.drifter_aggro_motes && distP <= cfg.drifter_aggro_radius) {
          d.state = 'chase';
        } else {
          const stepM = cfg.drifter_idle_speed * dt;
          d.pos[0] += Math.cos(d.idleAngle) * stepM;
          d.pos[2] += Math.sin(d.idleAngle) * stepM;
          if (!isInsideShadeMap(this.night, d.pos[0], d.pos[2])) {
            d.idleAngle += Math.PI * 0.75;
            d.pos[0] += Math.cos(d.idleAngle) * stepM;
            d.pos[2] += Math.sin(d.idleAngle) * stepM;
          }
        }
      }
      if (d.state === 'chase') {
        if (this.carried < cfg.drifter_aggro_motes || distP > cfg.drifter_aggro_radius) {
          d.state = 'idle';
        } else if (distP > 1e-9) {
          const stepM = Math.min(distP, cfg.drifter_chase_speed * dt);
          d.pos[0] += ((this.playerPos[0] - d.pos[0]) / distP) * stepM;
          d.pos[2] += ((this.playerPos[2] - d.pos[2]) / distP) * stepM;
        }
      } else if (d.state === 'flee') {
        const dirX = distP > 1e-9 ? (d.pos[0] - this.playerPos[0]) / distP : 1;
        const dirZ = distP > 1e-9 ? (d.pos[2] - this.playerPos[2]) / distP : 0;
        const stepM = cfg.drifter_flee_speed * dt;
        d.pos[0] += dirX * stepM;
        d.pos[2] += dirZ * stepM;
      }
    }

    // Step 9: Contact — Drifters steal first, then Shades hit (ascending id)
    if (this.respawnTicks === 0 && !this.falling && this.flames > 0) {
      if (this.drifters.length > 0) {
        const sortedDrifters = [...this.drifters].sort((a, b) => a.id.localeCompare(b.id));
        for (const d of sortedDrifters) {
          if (
            d.createdSimTick < this.simTick &&
            d.state === 'chase' &&
            !d.hasStolen &&
            distXZ(d.pos, this.playerPos) <= cfg.drifter_steal_radius
          ) {
            const amount = Math.min(cfg.drifter_steal_max, this.carried);
            this.carried -= amount;
            d.stolen = amount;
            d.hasStolen = true;
            d.state = 'flee';
            d.fleeTicksLeft = cfg.drifter_flee_ticks;
            pushEvent(events, stepTick, { name: 'drifter_steal', data: { drifter_id: d.id, amount, carried: this.carried } });
          }
        }
      }

      if (this.shades.length > 0 && this.invulnTicks === 0 && !this.isProtectedByLitLantern(this.playerPos, safeLights)) {
        const sortedShades = [...this.shades].sort((a, b) => a.id.localeCompare(b.id));
        for (const s of sortedShades) {
          if (
            s.createdSimTick < this.simTick &&
            (s.state === 'chase' || s.state === 'wander') &&
            s.safePushTicksLeft === 0 &&
            distXZ(s.pos, this.playerPos) <= t.shade_hit_radius &&
            Math.abs(s.pos[1] - this.playerPos[1]) <= 1.5
          ) {
            this.flames = Math.max(0, this.flames - 1);
            const dropped = Math.floor(this.carried * t.hit_drop_ratio);
            this.carried -= dropped;
            this.invulnTicks = cfg.invuln_ticks;

            for (let i = 0; i < dropped; i++) {
              const angle = this.rng() * Math.PI * 2;
              const radius = cfg.dropped_mote_min_r + (cfg.dropped_mote_max_r - cfg.dropped_mote_min_r) * this.rng();
              let mxPos = this.playerPos[0] + Math.cos(angle) * radius;
              let mzPos = this.playerPos[2] + Math.sin(angle) * radius;
              let gh = getGroundHeight(this.night, mxPos, mzPos);
              if (gh === null || !Number.isFinite(gh)) {
                mxPos = this.playerPos[0];
                mzPos = this.playerPos[2];
                gh = getGroundHeight(this.night, mxPos, mzPos) ?? 0;
              }
              this.motes.push({
                id: this.id('M'),
                pos: [mxPos, Number.isFinite(gh) ? gh : 0, mzPos],
                kind: 'dropped',
                ttlTicks: cfg.dropped_mote_ttl_ticks,
                createdSimTick: this.simTick
              });
            }

            const dHit = distXZ(s.pos, this.playerPos);
            s.state = 'recoil';
            s.stateTicksLeft = cfg.recoil_ticks;
            s.recoilDir =
              dHit > 1e-9 ? [(s.pos[0] - this.playerPos[0]) / dHit, (s.pos[2] - this.playerPos[2]) / dHit] : [1, 0];

            pushEvent(events, stepTick, { name: 'player_hit', data: { by: 'shade', flames: this.flames, dropped } });
            break;
          }
        }
      }
    }

    // Step 10: Scheduled spawns
    if (this.randomMotes && this.simTick % cfg.mote_spawn_interval_ticks === 0 && this.motes.length < cfg.max_motes) {
      const free = map.moteSpawns.filter(
        (pt) => !this.motes.some((m) => distXZ(m.pos, pt) < 0.5 && Math.abs(m.pos[1] - pt[1]) < 0.5)
      );
      if (free.length > 0) {
        const pt = free[Math.floor(this.rng() * free.length)];
        this.motes.push({ id: this.id('M'), pos: [...pt], kind: 'random', ttlTicks: null, createdSimTick: this.simTick });
      }
    }

    if (this.randomShades && this.simTick >= cfg.shade_initial_tick) {
      let spawnCount = 0;
      if (this.simTick === cfg.shade_initial_tick) {
        spawnCount = 2;
      } else if ((this.simTick - cfg.shade_initial_tick) % map.shadeIntervalTicks === 0) {
        spawnCount = 1;
      }
      for (let i = 0; i < spawnCount && this.shades.length < map.maxShades; i++) {
        const valid = map.shadeSpawns.filter(
          (pt) =>
            distXZ(pt, this.playerPos) >= cfg.shade_spawn_min_player_dist &&
            !this.isProtectedByLitLantern(pt)
        );
        if (valid.length === 0) break;
        const pt = valid[Math.floor(this.rng() * valid.length)];
        const shade: InternalShade = {
          id: this.id('S'),
          pos: [pt[0], pt[1] + 0.8, pt[2]],
          state: 'spawning',
          stateTicksLeft: cfg.shade_spawn_delay_ticks,
          stunPushTicksLeft: 0,
          stunPushDir: [1, 0],
          recoilDir: [1, 0],
          safePushTicksLeft: 0,
          targetLanternId: null,
          drainTicks: 0,
          wanderAngle: this.rng() * Math.PI * 2,
          createdSimTick: this.simTick
        };
        this.shades.push(shade);
        pushEvent(events, stepTick, { name: 'shade_spawned', data: { id: shade.id } });
      }
    }

    if (
      this.randomDrifters &&
      this.simTick % cfg.drifter_spawn_interval_ticks === 0 &&
      this.drifters.length < cfg.drifter_max
    ) {
      const pts = map.shadeSpawns;
      if (pts.length > 0) {
        const pt = pts[Math.floor(this.rng() * pts.length)];
        this.drifters.push({
          id: this.id('D'),
          pos: [pt[0], pt[1] + 1.2, pt[2]],
          state: 'idle',
          stolen: 0,
          hasStolen: false,
          fleeTicksLeft: 0,
          idleAngle: this.rng() * Math.PI * 2,
          createdSimTick: this.simTick
        });
      }
    }

    // Step 11: Win / Loss check (no early all_lit win; no_flames always loses first)
    if (this.flames <= 0) {
      this.state = 'lost';
      this.reason = 'no_flames';
    } else if (this.remainingSimTicks === 0) {
      const litLanterns = this.lanterns.filter((l) => l.lit);
      const needed = Math.ceil(t.win_ratio * this.lanterns.length);
      if (litLanterns.length >= needed) {
        this.state = 'won';
        this.reason = 'dawn_survived';
        for (const l of litLanterns) {
          this.score += 50 + Math.floor(Math.max(0, l.fuel60) / cfg.tick_hz);
        }
        this.score += this.flames * t.score.per_flame_left;
      } else {
        this.state = 'lost';
        this.reason = 'dawn';
      }
    }

    if (this.state === 'won' || this.state === 'lost') {
      pushEvent(events, stepTick, { name: 'game_over', data: { result: this.state, reason: this.reason! } });
    }

    return events;
  }
}
