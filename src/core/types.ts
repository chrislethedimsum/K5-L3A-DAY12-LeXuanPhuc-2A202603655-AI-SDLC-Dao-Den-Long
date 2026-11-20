import type { NightNumber, Pos3 } from './maps';

export type { NightNumber, Pos3 } from './maps';
export type Move2 = [number, number];

export interface InputFrame {
  tick?: number;
  move?: Move2;
  cam_yaw_deg?: number;
  jump?: boolean;
  dash?: boolean;
  interact?: boolean;
  pulse?: boolean;
  pause?: boolean;
}

export interface InputsFile {
  frames: (InputFrame & { tick: number })[];
}

export interface ScenarioLanternPatch {
  id: string;
  pos?: Pos3;
  deposited?: number;
  lit?: boolean;
  fuel?: number;
  ever_lit?: boolean;
}

export type ShadeState = 'spawning' | 'wander' | 'chase' | 'drain' | 'recoil' | 'stunned';
export type DrifterState = 'idle' | 'chase' | 'flee';
export type MoteKind = 'random' | 'dropped';

export interface ScenarioMoteObj {
  id?: string;
  pos: Pos3;
  kind?: MoteKind;
  ttl_ticks?: number | null;
}

export interface ScenarioShade {
  id?: string;
  pos: Pos3;
  state?: ShadeState;
  state_ticks_left?: number;
  stun_left_s?: number;
  target_lantern_id?: string;
}

export interface ScenarioDrifter {
  id?: string;
  pos: Pos3;
  state?: DrifterState;
  stolen?: number;
  flee_ticks_left?: number;
}

export interface ScenarioCharm {
  id?: string;
  pos: Pos3;
  available?: boolean;
  respawn_ticks?: number;
}

export interface Scenario {
  seed?: number;
  night?: NightNumber;
  random_motes?: boolean;
  random_shades?: boolean;
  random_drifters?: boolean;
  wind_enabled?: boolean;
  time_left_s?: number;
  player?: {
    pos?: Pos3;
    carried?: number;
    flames?: number;
    successful_lights?: number;
    invuln_ticks?: number;
    dash_cd_ticks?: number;
    pulse_cd_ticks?: number;
    charm_ticks?: number;
    invuln_left_s?: number;
    pulse_cooldown_left_s?: number;
  };
  lanterns?: ScenarioLanternPatch[];
  motes?: (Pos3 | ScenarioMoteObj)[];
  shades?: ScenarioShade[];
  drifters?: ScenarioDrifter[];
  charms?: ScenarioCharm[];
}

export type GameState = 'playing' | 'paused' | 'won' | 'lost';
export type GameOverReason = 'dawn_survived' | 'dawn' | 'no_flames';

export interface Snapshot {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  night: NightNumber;
  state: GameState;
  time_left_s: number;
  score: number;
  wind: {
    active: boolean;
    dir_deg: number;
  };
  player: {
    pos: Pos3;
    vel: Pos3;
    grounded: boolean;
    flames: number;
    carried: number;
    capacity: number;
    invuln: boolean;
    dash_cd_s: number;
    pulse_cd_s: number;
    charm_s: number;
  };
  lanterns: {
    id: string;
    pos: Pos3;
    lit: boolean;
    deposited: number;
    fuel: number;
    ever_lit: boolean;
    relit_count: number;
  }[];
  shades: {
    id: string;
    pos: Pos3;
    state: ShadeState;
  }[];
  motes: {
    id: string;
    pos: Pos3;
    kind: MoteKind;
    ttl_s: number | null;
  }[];
  motes_active: number;
  drifters: {
    id: string;
    pos: Pos3;
    state: DrifterState;
    stolen: number;
  }[];
  charms: {
    id: string;
    pos: Pos3;
    available: boolean;
    respawn_s: number;
  }[];
}

export interface HudState {
  invuln_left_s: number;
  dash_cd_s: number;
  pulse_cd_s: number;
  charm_s: number;
  wind_warning: boolean;
  wind_active: boolean;
  wind_dir_deg: number;
  reason: GameOverReason | null;
  respawning: boolean;
}

export type GameEventPayload =
  | { name: 'mote_picked'; data: { carried: number } }
  | { name: 'deposit'; data: { lantern_id: string; amount: number; deposited: number } }
  | { name: 'lantern_lit'; data: { lantern_id: string; relight: boolean } }
  | { name: 'refuel'; data: { lantern_id: string; amount: number; fuel: number } }
  | { name: 'lantern_out'; data: { lantern_id: string } }
  | { name: 'fuel_drain'; data: { lantern_id: string; shade_id: string; fuel: number } }
  | { name: 'pulse'; data: { stunned_ids: string[] } }
  | { name: 'player_hit'; data: { by: 'shade' | 'fall'; flames: number; dropped: number; lost?: number } }
  | { name: 'shade_spawned'; data: { id: string } }
  | { name: 'game_over'; data: { result: 'won' | 'lost'; reason: GameOverReason } }
  | { name: 'dash'; data: Record<string, never> }
  | { name: 'charm_picked'; data: { charm_id: string; charm_ticks: number } }
  | { name: 'drifter_steal'; data: { drifter_id: string; amount: number; carried: number } }
  | { name: 'drifter_drop'; data: { drifter_id: string; amount: number } }
  | { name: 'night_start'; data: { night: NightNumber } }
  | { name: 'paused'; data: Record<string, never> }
  | { name: 'resumed'; data: Record<string, never> };

export type GameEvent = { type: 'event'; tick: number } & GameEventPayload;

export interface EndRecord {
  type: 'end';
  ticks: number;
  state: GameState;
  score: number;
}

export type Tuning = typeof import('../../game.contract.json')['tuning'];
