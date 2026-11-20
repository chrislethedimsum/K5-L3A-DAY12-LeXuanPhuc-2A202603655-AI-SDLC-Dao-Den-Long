import { WORLD_CONFIG } from './config';
import contract from './contract';
import { mulberry32 } from './rng';
import { number, validateInputFrame, validateScenario } from './validators';
import type {
  EndRecord,
  GameEvent,
  GameEventPayload,
  GameOverReason,
  GameState,
  HudState,
  InputFrame,
  Pos3,
  Scenario,
  Snapshot
} from './types';

export type { EndRecord, GameEvent, HudState, InputFrame, Scenario, Snapshot } from './types';

const t = contract.tuning;
const cfg = WORLD_CONFIG;
const dt = 1 / cfg.tick_hz;

interface InternalLantern {
  id: string;
  pos: Pos3;
  deposited: number;
  lit: boolean;
}

interface InternalMote {
  id: string;
  pos: Pos3;
}

interface InternalShade {
  id: string;
  pos: Pos3;
  stunLeft: number;
}

const distXZ = (a: Pos3, b: Pos3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
const round = (n: number): number => Math.round(n * 1000) / 1000 || 0;
const roundPos = (p: Pos3): Pos3 => [round(p[0]), round(p[1]), round(p[2])];

function clampToIsland(p: Pos3): void {
  const d = Math.hypot(p[0], p[2]);
  if (d > cfg.island_radius) {
    const scale = cfg.island_radius / d;
    p[0] *= scale;
    p[2] *= scale;
  }
}

export class GameWorld {
  private tick = 0;
  private initialDurationS: number;
  private score = 0;
  private state: GameState = 'playing';
  private reason: GameOverReason | null = null;
  private playerPos: Pos3;
  private flames: number;
  private carried: number;
  private invulnLeft: number;
  private pulseCooldownLeft: number;
  private lanterns: InternalLantern[];
  private motes: InternalMote[];
  private shades: InternalShade[];
  private rng: () => number;
  private randomMotes: boolean;
  private randomShades: boolean;
  private vy = 0;
  private lastJump = false;
  private lastInteract = false;
  private lastPulse = false;
  private idCounters: Record<string, number> = {};
  private ids = new Set<string>();

  constructor(options: { seed?: number; night?: number; scenario?: Scenario } = {}) {
    const s = options.scenario ?? {};
    validateScenario(s);

    const seed = options.seed ?? s.seed ?? 42;
    const night = options.night ?? s.night ?? 1;
    number(seed, 'seed', 0, 4294967295, true);
    number(night, 'night', 1, 1, true);

    this.rng = mulberry32(seed);
    this.initialDurationS = s.time_left_s ?? t.night1_duration_s;
    this.randomMotes = s.random_motes ?? true;
    this.randomShades = s.random_shades ?? true;

    this.playerPos = s.player?.pos ? [...s.player.pos] : [0, 0, 0];
    this.flames = s.player?.flames ?? t.flames;
    this.carried = s.player?.carried ?? 0;
    this.invulnLeft = s.player?.invuln_left_s ?? 0;
    this.pulseCooldownLeft = s.player?.pulse_cooldown_left_s ?? 0;

    this.lanterns = Array.from({ length: t.lantern_count_night1 }, (_, i) => ({
      id: `L${i + 1}`,
      pos: [
        Math.cos((i * Math.PI * 2) / t.lantern_count_night1) * cfg.lantern_ring_radius,
        0,
        Math.sin((i * Math.PI * 2) / t.lantern_count_night1) * cfg.lantern_ring_radius
      ],
      deposited: 0,
      lit: false
    }));

    if (s.lanterns) {
      for (const patch of s.lanterns) {
        const target = this.lanterns.find((l) => l.id === patch.id)!;
        if (patch.pos) target.pos = [...patch.pos];
        if (patch.deposited !== undefined && patch.lit !== undefined) {
          target.deposited = patch.deposited;
          target.lit = patch.lit;
        } else if (patch.lit !== undefined) {
          target.lit = patch.lit;
          target.deposited = patch.lit ? t.lantern_cost : 0;
        } else if (patch.deposited !== undefined) {
          target.deposited = patch.deposited;
          target.lit = patch.deposited === t.lantern_cost;
        }
      }
    }

    for (const l of this.lanterns) this.ids.add(l.id);
    if (s.shades) {
      for (const sh of s.shades) {
        if (sh.id) this.ids.add(sh.id);
      }
    }

    this.motes = [];
    if (s.motes !== undefined) {
      for (const pos of s.motes) this.spawnMote(pos);
    } else if (this.randomMotes) {
      for (let i = 0; i < cfg.initial_motes; i++) this.spawnMote();
    }

    this.shades = [];
    if (s.shades !== undefined) {
      for (const sh of s.shades) {
        this.shades.push({
          id: sh.id ?? this.id('S'),
          pos: [...sh.pos],
          stunLeft: sh.stun_left_s ?? 0
        });
      }
    } else if (this.randomShades) {
      for (let i = 0; i < cfg.initial_shades; i++) {
        this.shades.push({
          id: this.id('S'),
          pos: this.randomPosition(cfg.shade_initial_min_radius),
          stunLeft: 0
        });
      }
    }
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

  private randomPosition(minRadius: number): Pos3 {
    const a = this.rng() * Math.PI * 2;
    const r = minRadius + (cfg.mote_spawn_max_radius - minRadius) * this.rng();
    return [Math.cos(a) * r, 0, Math.sin(a) * r];
  }

  private spawnMote(pos?: Pos3): void {
    this.motes.push({
      id: this.id('M'),
      pos: pos ? [pos[0], 0, pos[2]] : this.randomPosition(cfg.mote_spawn_min_radius)
    });
  }

  // Solve all lit safe disks and island boundary jointly to avoid oscillation.
  private excludeSafeZones(p: Pos3): void {
    const lights = this.lanterns.filter((l) => l.lit);
    const valid = (v: Pos3) =>
      Math.hypot(v[0], v[2]) <= cfg.island_radius + 1e-8 &&
      lights.every((l) => distXZ(v, l.pos) >= t.safe_radius - 1e-8);

    if (valid(p)) return;

    const circles = [
      ...lights.map((l) => ({ p: l.pos, r: t.safe_radius })),
      { p: [0, 0, 0] as Pos3, r: cfg.island_radius }
    ];
    const candidates: Pos3[] = [];
    for (const c of circles) {
      const d = distXZ(p, c.p);
      candidates.push([
        c.p[0] + (d ? (p[0] - c.p[0]) / d : 1) * c.r,
        0,
        c.p[2] + (d ? (p[2] - c.p[2]) / d : 0) * c.r
      ]);
    }
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i];
        const b = circles[j];
        const d = distXZ(a.p, b.p);
        if (d < 1e-10 || d > a.r + b.r || d < Math.abs(a.r - b.r)) continue;
        const along = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, a.r * a.r - along * along));
        const dx = (b.p[0] - a.p[0]) / d;
        const dz = (b.p[2] - a.p[2]) / d;
        for (const sign of [-1, 1]) {
          candidates.push([
            a.p[0] + along * dx - sign * h * dz,
            0,
            a.p[2] + along * dz + sign * h * dx
          ]);
        }
      }
    }
    const nearest = candidates.filter(valid).sort((a, b) => distXZ(a, p) - distXZ(b, p))[0];
    if (!nearest) throw new Error('Safe zone geometry has no feasible position');
    p[0] = nearest[0];
    p[2] = nearest[2];
  }

  snapshot(): Snapshot {
    const timeLeft = Math.max(0, this.initialDurationS - this.tick / cfg.tick_hz);
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.tick,
      state: this.state,
      time_left_s: round(timeLeft),
      score: this.score,
      player: {
        pos: roundPos(this.playerPos),
        flames: this.flames,
        carried: this.carried
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: roundPos(l.pos),
        lit: l.lit,
        deposited: l.deposited
      })),
      shades: this.shades.map((s) => ({
        id: s.id,
        pos: roundPos(s.pos),
        state: s.stunLeft > 0 ? 'stunned' : 'chase'
      })),
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: roundPos(m.pos)
      })),
      motes_active: this.motes.length
    };
  }

  hudState(): HudState {
    const stunById: Record<string, number> = {};
    for (const s of this.shades) stunById[s.id] = round(s.stunLeft);
    return {
      invuln_left_s: round(this.invulnLeft),
      pulse_cooldown_left_s: round(this.pulseCooldownLeft),
      reason: this.reason,
      stun_left_by_id: stunById,
      pulse_positions: []
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
    if (this.state !== 'playing') return [];
    validateInputFrame(input);
    if (input.tick !== undefined && input.tick !== this.tick) {
      throw new Error('input.tick must equal current tick');
    }

    const nextTick = this.tick + 1;
    const events: GameEvent[] = [];
    const emit = (payload: GameEventPayload) => {
      events.push({ type: 'event', tick: nextTick, ...payload } as GameEvent);
    };

    const decrease = (n: number) => Math.max(0, n - dt < 1e-10 ? 0 : n - dt);
    this.invulnLeft = decrease(this.invulnLeft);
    this.pulseCooldownLeft = decrease(this.pulseCooldownLeft);
    for (const s of this.shades) s.stunLeft = decrease(s.stunLeft);

    const rawMove = input.move ?? [0, 0];
    const len = Math.max(1, Math.hypot(rawMove[0], rawMove[1]));
    const mx = rawMove[0] / len;
    const mz = rawMove[1] / len;
    const yaw = (((input.cam_yaw_deg ?? 0) % 360) * Math.PI) / 180;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    // Test Contract v1.0 C: x' = x*cosθ + z*sinθ, z' = -x*sinθ + z*cosθ
    this.playerPos[0] += (mx * cosY + mz * sinY) * t.player_speed * dt;
    this.playerPos[2] += (-mx * sinY + mz * cosY) * t.player_speed * dt;
    clampToIsland(this.playerPos);

    if (input.jump && !this.lastJump && this.playerPos[1] === 0) {
      this.vy = cfg.jump_speed;
    }
    if (this.playerPos[1] > 0 || this.vy > 0) {
      this.vy += cfg.gravity * dt;
      this.playerPos[1] = Math.max(0, this.playerPos[1] + this.vy * dt);
      if (this.playerPos[1] === 0) this.vy = 0;
    }

    if (input.interact && !this.lastInteract && this.carried > 0) {
      const target = this.lanterns
        .filter((l) => !l.lit && distXZ(l.pos, this.playerPos) <= t.interact_radius)
        .sort((a, b) => distXZ(a.pos, this.playerPos) - distXZ(b.pos, this.playerPos))[0];

      if (target) {
        const amount = Math.min(this.carried, t.lantern_cost - target.deposited);
        target.deposited += amount;
        this.carried -= amount;
        emit({
          name: 'deposit',
          data: { lantern_id: target.id, amount, deposited: target.deposited }
        });
        if (target.deposited === t.lantern_cost) {
          target.lit = true;
          this.score += t.score.per_lantern;
          emit({ name: 'lantern_lit', data: { lantern_id: target.id } });
        }
      }
    }

    if (input.pulse && !this.lastPulse && this.carried >= t.pulse_cost && this.pulseCooldownLeft === 0) {
      this.carried -= t.pulse_cost;
      this.pulseCooldownLeft = t.pulse_cooldown_s;
      const stunnedIds: string[] = [];

      for (const s of this.shades) {
        if (distXZ(s.pos, this.playerPos) <= t.pulse_radius) {
          const d = distXZ(s.pos, this.playerPos);
          const dx = d ? (s.pos[0] - this.playerPos[0]) / d : 1;
          const dz = d ? (s.pos[2] - this.playerPos[2]) / d : 0;
          s.pos[0] += dx * t.pulse_push_m;
          s.pos[2] += dz * t.pulse_push_m;
          clampToIsland(s.pos);
          s.stunLeft = t.pulse_stun_s;
          this.score += t.score.per_stun;
          stunnedIds.push(s.id);
        }
      }
      emit({ name: 'pulse', data: { stunned_ids: stunnedIds } });
    }

    this.lastJump = !!input.jump;
    this.lastInteract = !!input.interact;
    this.lastPulse = !!input.pulse;

    this.motes = this.motes.filter((m) => {
      if (this.carried < t.carry_capacity && distXZ(this.playerPos, m.pos) <= t.pickup_radius) {
        this.carried++;
        this.score += t.score.per_mote;
        emit({ name: 'mote_picked', data: { carried: this.carried } });
        return false;
      }
      return true;
    });

    for (const s of this.shades) {
      if (s.stunLeft === 0) {
        const d = distXZ(s.pos, this.playerPos);
        if (d > 0) {
          const stepDist = Math.min(d, t.shade_speed * dt);
          s.pos[0] += ((this.playerPos[0] - s.pos[0]) / d) * stepDist;
          s.pos[2] += ((this.playerPos[2] - s.pos[2]) / d) * stepDist;
        }
      }
      this.excludeSafeZones(s.pos);

      const playerProtected = this.lanterns.some((l) => l.lit && distXZ(this.playerPos, l.pos) <= t.safe_radius);
      if (!playerProtected && s.stunLeft === 0 && this.invulnLeft === 0 && distXZ(s.pos, this.playerPos) <= t.shade_hit_radius) {
        this.flames--;
        const dropped = Math.floor(this.carried * t.hit_drop_ratio);
        this.carried -= dropped;
        this.invulnLeft = t.invuln_s;
        for (let i = 0; i < dropped; i++) this.spawnMote(this.playerPos);
        emit({ name: 'player_hit', data: { by: 'shade', flames: this.flames, dropped } });
      }
    }

    if (
      this.randomMotes &&
      nextTick % (cfg.mote_respawn_s * cfg.tick_hz) === 0 &&
      this.motes.length < cfg.mote_respawn_below &&
      this.motes.length < cfg.initial_motes
    ) {
      this.spawnMote();
    }

    if (
      this.randomShades &&
      nextTick % (cfg.shade_spawn_s * cfg.tick_hz) === 0 &&
      this.shades.length < cfg.max_shades
    ) {
      const shade: InternalShade = {
        id: this.id('S'),
        pos: this.randomPosition(cfg.shade_initial_min_radius),
        stunLeft: 0
      };
      this.shades.push(shade);
      emit({ name: 'shade_spawned', data: { id: shade.id } });
    }

    const nextTimeLeft = Math.max(0, this.initialDurationS - nextTick / cfg.tick_hz);
    if (this.lanterns.every((l) => l.lit)) {
      this.state = 'won';
      this.reason = 'all_lit';
      this.score += Math.floor(nextTimeLeft) * t.score.per_second_left + this.flames * t.score.per_flame_left;
    } else if (this.flames <= 0) {
      this.state = 'lost';
      this.reason = 'no_flames';
    } else if (nextTimeLeft <= 1e-9) {
      this.state = 'lost';
      this.reason = 'dawn';
    }

    if (this.state !== 'playing') {
      emit({
        name: 'game_over',
        data: { result: this.state, reason: this.reason! }
      });
    }

    this.tick = nextTick;
    return events;
  }
}
