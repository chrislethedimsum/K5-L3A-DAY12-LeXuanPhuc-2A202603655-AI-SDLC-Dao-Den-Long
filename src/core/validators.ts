import { WORLD_CONFIG } from './config';
import contract from './contract';
import type { InputFrame, InputsFile, Pos3, Scenario } from './types';

const t = contract.tuning;
const cfg = WORLD_CONFIG;
type Obj = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function object(v: unknown, path: string, keys: string[]): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(path, 'expected object');
  for (const k of Object.keys(v)) {
    if (!keys.includes(k)) fail(`${path}.${k}`, 'unknown field');
  }
  return v as Obj;
}

export function number(v: unknown, path: string, min = -Infinity, max = Infinity, integer = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isSafeInteger(v))) {
    fail(path, `expected ${integer ? 'safe integer' : 'finite number'} in [${min},${max}]`);
  }
  return v;
}

function bool(v: unknown, p: string): void {
  if (typeof v !== 'boolean') fail(p, 'expected boolean');
}

function pos3(v: unknown, p: string, ground: boolean): Pos3 {
  if (!Array.isArray(v) || v.length !== 3) fail(p, 'expected [x, y, z] array');
  const x = number(v[0], `${p}[0]`);
  const y = number(v[1], `${p}[1]`, 0);
  const z = number(v[2], `${p}[2]`);
  if (Math.hypot(x, z) > cfg.island_radius + 1e-9 || (ground && y !== 0)) {
    fail(p, 'outside island or nonzero ground height');
  }
  return [x, y, z];
}

export function validateInputFrame(v: unknown, requiredTick = false): asserts v is InputFrame {
  const o = object(v, 'input', ['tick', 'move', 'cam_yaw_deg', 'jump', 'interact', 'pulse', 'dash']);
  if (requiredTick || 'tick' in o) {
    number(o.tick, 'input.tick', 0, Number.MAX_SAFE_INTEGER, true);
  }
  if ('move' in o) {
    if (!Array.isArray(o.move) || o.move.length !== 2) fail('input.move', 'expected [x, z]');
    number(o.move[0], 'input.move[0]', -1, 1);
    number(o.move[1], 'input.move[1]', -1, 1);
  }
  if ('cam_yaw_deg' in o) number(o.cam_yaw_deg, 'input.cam_yaw_deg');
  for (const k of ['jump', 'interact', 'pulse', 'dash']) {
    if (k in o) bool(o[k], `input.${k}`);
  }
}

export function validateInputsFile(v: unknown): asserts v is InputsFile {
  const root = object(v, 'inputs', ['frames']);
  if (!Array.isArray(root.frames)) fail('inputs.frames', 'expected array');
  let last = -1;
  for (const f of root.frames) {
    validateInputFrame(f, true);
    if (f.tick! <= last) fail('inputs.frames', 'ticks must strictly increase');
    last = f.tick!;
  }
}

const VALID_LANTERN_IDS = new Set(
  Array.from({ length: t.lantern_count_night1 }, (_, i) => `L${i + 1}`)
);

export function validateScenario(v: unknown): asserts v is Scenario {
  const o = object(v, 'scenario', [
    'seed',
    'night',
    'random_motes',
    'random_shades',
    'time_left_s',
    'player',
    'lanterns',
    'motes',
    'shades'
  ]);
  if ('seed' in o) number(o.seed, 'scenario.seed', 0, 4294967295, true);
  if ('night' in o) number(o.night, 'scenario.night', 1, 1, true);
  for (const k of ['random_motes', 'random_shades']) {
    if (k in o) bool(o[k], `scenario.${k}`);
  }
  if ('time_left_s' in o) {
    const tls = number(o.time_left_s, 'scenario.time_left_s', 0);
    if (tls <= 0) fail('scenario.time_left_s', 'must be positive');
  }
  if ('player' in o) {
    const p = object(o.player, 'scenario.player', [
      'pos',
      'carried',
      'flames',
      'invuln_left_s',
      'pulse_cooldown_left_s'
    ]);
    if ('pos' in p) pos3(p.pos, 'scenario.player.pos', false);
    if ('flames' in p) number(p.flames, 'scenario.player.flames', 1, t.flames, true);
    if ('carried' in p) number(p.carried, 'scenario.player.carried', 0, t.carry_capacity, true);
    if ('invuln_left_s' in p) number(p.invuln_left_s, 'scenario.player.invuln_left_s', 0, t.invuln_s);
    if ('pulse_cooldown_left_s' in p) {
      number(p.pulse_cooldown_left_s, 'scenario.player.pulse_cooldown_left_s', 0, t.pulse_cooldown_s);
    }
  }
  if ('lanterns' in o) {
    if (!Array.isArray(o.lanterns)) fail('scenario.lanterns', 'expected array');
    const seen = new Set<string>();
    for (const item of o.lanterns) {
      const e = object(item, 'scenario.lanterns[]', ['id', 'pos', 'deposited', 'lit']);
      if (typeof e.id !== 'string' || !VALID_LANTERN_IDS.has(e.id) || seen.has(e.id)) {
        fail('scenario.lanterns[].id', 'expected unique lantern id L1..L5');
      }
      seen.add(e.id);
      if ('pos' in e) pos3(e.pos, 'scenario.lanterns[].pos', true);
      if ('deposited' in e) number(e.deposited, 'scenario.lanterns[].deposited', 0, t.lantern_cost, true);
      if ('lit' in e) bool(e.lit, 'scenario.lanterns[].lit');
      if ('deposited' in e && 'lit' in e) {
        if (e.lit !== (e.deposited === t.lantern_cost)) {
          fail('scenario.lanterns[]', 'lit must equal deposited === lantern_cost');
        }
      }
    }
  }
  if ('motes' in o) {
    if (!Array.isArray(o.motes)) fail('scenario.motes', 'expected array');
    for (let i = 0; i < o.motes.length; i++) {
      pos3(o.motes[i], `scenario.motes[${i}]`, true);
    }
  }
  if ('shades' in o) {
    if (!Array.isArray(o.shades)) fail('scenario.shades', 'expected array');
    const shadeIds = new Set<string>();
    for (let i = 0; i < o.shades.length; i++) {
      const e = object(o.shades[i], `scenario.shades[${i}]`, ['id', 'pos', 'stun_left_s']);
      if ('id' in e) {
        if (typeof e.id !== 'string' || !e.id.trim() || shadeIds.has(e.id) || VALID_LANTERN_IDS.has(e.id)) {
          fail(`scenario.shades[${i}].id`, 'expected unique nonempty id');
        }
        shadeIds.add(e.id);
      }
      pos3(e.pos, `scenario.shades[${i}].pos`, true);
      if ('stun_left_s' in e) number(e.stun_left_s, `scenario.shades[${i}].stun_left_s`, 0, t.pulse_stun_s);
    }
  }
}
