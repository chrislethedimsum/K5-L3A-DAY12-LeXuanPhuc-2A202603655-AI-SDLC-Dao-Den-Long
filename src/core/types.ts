export type Pos3 = [number, number, number];
export type Move2 = [number, number];

export interface InputFrame {
  tick?: number;
  move?: Move2;
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
}

export interface InputsFile {
  frames: (InputFrame & { tick: number })[];
}

export interface ScenarioLanternPatch {
  id: string;
  pos?: Pos3;
  deposited?: number;
  lit?: boolean;
}

export interface ScenarioShade {
  id?: string;
  pos: Pos3;
  stun_left_s?: number;
}

export interface Scenario {
  seed?: number;
  night?: number;
  random_motes?: boolean;
  random_shades?: boolean;
  time_left_s?: number;
  player?: {
    pos?: Pos3;
    carried?: number;
    flames?: number;
    invuln_left_s?: number;
    pulse_cooldown_left_s?: number;
  };
  lanterns?: ScenarioLanternPatch[];
  motes?: Pos3[];
  shades?: ScenarioShade[];
}

export type GameState = 'playing' | 'won' | 'lost';
export type GameOverReason = 'all_lit' | 'dawn' | 'no_flames';
export type ShadeState = 'chase' | 'stunned';

export interface Snapshot {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  state: GameState;
  time_left_s: number;
  score: number;
  player: {
    pos: Pos3;
    flames: number;
    carried: number;
  };
  lanterns: {
    id: string;
    pos: Pos3;
    lit: boolean;
    deposited: number;
  }[];
  shades: {
    id: string;
    pos: Pos3;
    state: ShadeState;
  }[];
  motes: {
    id: string;
    pos: Pos3;
  }[];
  motes_active: number;
}

export interface HudState {
  invuln_left_s: number;
  pulse_cooldown_left_s: number;
  reason: GameOverReason | null;
  stun_left_by_id: Record<string, number>;
  pulse_positions: Pos3[];
}

export type GameEventPayload =
  | { name: 'mote_picked'; data: { carried: number } }
  | { name: 'deposit'; data: { lantern_id: string; amount: number; deposited: number } }
  | { name: 'lantern_lit'; data: { lantern_id: string } }
  | { name: 'pulse'; data: { stunned_ids: string[] } }
  | { name: 'player_hit'; data: { by: 'shade' | 'fall'; flames: number; dropped: number } }
  | { name: 'shade_spawned'; data: { id: string } }
  | { name: 'game_over'; data: { result: 'won' | 'lost'; reason: GameOverReason } };

export type GameEvent = { type: 'event'; tick: number } & GameEventPayload;

export interface EndRecord {
  type: 'end';
  ticks: number;
  state: GameState;
  score: number;
}

export type Tuning = typeof import('../../game.contract.json')['tuning'];
