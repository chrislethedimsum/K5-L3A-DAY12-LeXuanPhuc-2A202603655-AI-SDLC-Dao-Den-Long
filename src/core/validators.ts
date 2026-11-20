import contract from './contract';
import { NIGHT_MAPS, type NightNumber } from './maps';
import type { InputFrame, InputsFile, Pos3, Scenario } from './types';

const t = contract.tuning;
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

function pos3(v: unknown, p: string): Pos3 {
  if (!Array.isArray(v) || v.length !== 3) fail(p, 'expected [x, y, z] array');
  return [number(v[0], `${p}[0]`), number(v[1], `${p}[1]`), number(v[2], `${p}[2]`)];
}

export function validateInputFrame(v: unknown, requiredTick = false): asserts v is InputFrame {
  const o = object(v, 'input', ['tick', 'move', 'cam_yaw_deg', 'jump', 'dash', 'interact', 'pulse', 'pause']);
  if (requiredTick || 'tick' in o) {
    number(o.tick, 'input.tick', 0, Number.MAX_SAFE_INTEGER, true);
  }
  if ('move' in o) {
    if (!Array.isArray(o.move) || o.move.length !== 2) fail('input.move', 'expected [x, z]');
    number(o.move[0], 'input.move[0]', -1, 1);
    number(o.move[1], 'input.move[1]', -1, 1);
  }
  if ('cam_yaw_deg' in o) number(o.cam_yaw_deg, 'input.cam_yaw_deg');
  for (const k of ['jump', 'dash', 'interact', 'pulse', 'pause']) {
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

const VALID_SHADE_STATES = new Set(['spawning', 'wander', 'chase', 'recoil', 'stunned']);
const VALID_DRIFTER_STATES = new Set(['idle', 'chase', 'flee']);

export function validateScenario(v: unknown, nightOverride?: NightNumber): asserts v is Scenario {
  const o = object(v, 'scenario', [
    'seed',
    'night',
    'random_motes',
    'random_shades',
    'random_drifters',
    'wind_enabled',
    'time_left_s',
    'player',
    'lanterns',
    'motes',
    'shades',
    'drifters',
    'charms'
  ]);
  if ('seed' in o) number(o.seed, 'scenario.seed', 0, 4294967295, true);
  const night = (nightOverride ?? ('night' in o ? number(o.night, 'scenario.night', 1, 3, true) : 1)) as NightNumber;
  if ('night' in o) number(o.night, 'scenario.night', 1, 3, true);
  for (const k of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled']) {
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
      'invuln_ticks',
      'dash_cd_ticks',
      'pulse_cd_ticks',
      'charm_ticks',
      'invuln_left_s',
      'pulse_cooldown_left_s'
    ]);
    if ('pos' in p) pos3(p.pos, 'scenario.player.pos');
    if ('flames' in p) number(p.flames, 'scenario.player.flames', 1, t.flames, true);
    if ('carried' in p) number(p.carried, 'scenario.player.carried', 0, t.carry_capacity, true);
    if ('invuln_ticks' in p) number(p.invuln_ticks, 'scenario.player.invuln_ticks', 0, 100000, true);
    if ('dash_cd_ticks' in p) number(p.dash_cd_ticks, 'scenario.player.dash_cd_ticks', 0, 100000, true);
    if ('pulse_cd_ticks' in p) number(p.pulse_cd_ticks, 'scenario.player.pulse_cd_ticks', 0, 100000, true);
    if ('charm_ticks' in p) number(p.charm_ticks, 'scenario.player.charm_ticks', 0, 100000, true);
    if ('invuln_left_s' in p) number(p.invuln_left_s, 'scenario.player.invuln_left_s', 0);
    if ('pulse_cooldown_left_s' in p) number(p.pulse_cooldown_left_s, 'scenario.player.pulse_cooldown_left_s', 0);
  }

  const validLanternIds = new Set(NIGHT_MAPS[night].lanterns.map((l) => l.id));
  if ('lanterns' in o) {
    if (!Array.isArray(o.lanterns)) fail('scenario.lanterns', 'expected array');
    const seen = new Set<string>();
    for (const item of o.lanterns) {
      const e = object(item, 'scenario.lanterns[]', ['id', 'pos', 'deposited', 'lit']);
      if (typeof e.id !== 'string' || !validLanternIds.has(e.id) || seen.has(e.id)) {
        fail('scenario.lanterns[].id', `expected unique lantern id for night ${night}`);
      }
      seen.add(e.id);
      if ('pos' in e) pos3(e.pos, 'scenario.lanterns[].pos');
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
      const item = o.motes[i];
      if (Array.isArray(item)) {
        pos3(item, `scenario.motes[${i}]`);
      } else {
        const e = object(item, `scenario.motes[${i}]`, ['id', 'pos', 'kind', 'ttl_ticks']);
        if ('id' in e && (typeof e.id !== 'string' || !e.id.trim())) fail(`scenario.motes[${i}].id`, 'nonempty string');
        pos3(e.pos, `scenario.motes[${i}].pos`);
        if ('kind' in e && e.kind !== 'random' && e.kind !== 'dropped') fail(`scenario.motes[${i}].kind`, 'random|dropped');
        if ('ttl_ticks' in e && e.ttl_ticks !== null) number(e.ttl_ticks, `scenario.motes[${i}].ttl_ticks`, 1, 100000, true);
      }
    }
  }

  if ('shades' in o) {
    if (!Array.isArray(o.shades)) fail('scenario.shades', 'expected array');
    const ids = new Set<string>();
    for (let i = 0; i < o.shades.length; i++) {
      const e = object(o.shades[i], `scenario.shades[${i}]`, ['id', 'pos', 'state', 'state_ticks_left', 'stun_left_s']);
      if ('id' in e) {
        if (typeof e.id !== 'string' || !e.id.trim() || ids.has(e.id) || validLanternIds.has(e.id)) {
          fail(`scenario.shades[${i}].id`, 'expected unique nonempty id');
        }
        ids.add(e.id);
      }
      pos3(e.pos, `scenario.shades[${i}].pos`);
      if ('state' in e && (typeof e.state !== 'string' || !VALID_SHADE_STATES.has(e.state))) {
        fail(`scenario.shades[${i}].state`, 'invalid shade state');
      }
      if ('state_ticks_left' in e) number(e.state_ticks_left, `scenario.shades[${i}].state_ticks_left`, 0, 100000, true);
      if ('stun_left_s' in e) number(e.stun_left_s, `scenario.shades[${i}].stun_left_s`, 0);
    }
  }

  if ('drifters' in o) {
    if (!Array.isArray(o.drifters)) fail('scenario.drifters', 'expected array');
    const ids = new Set<string>();
    for (let i = 0; i < o.drifters.length; i++) {
      const e = object(o.drifters[i], `scenario.drifters[${i}]`, ['id', 'pos', 'state', 'stolen', 'flee_ticks_left']);
      if ('id' in e) {
        if (typeof e.id !== 'string' || !e.id.trim() || ids.has(e.id)) fail(`scenario.drifters[${i}].id`, 'unique nonempty');
        ids.add(e.id);
      }
      pos3(e.pos, `scenario.drifters[${i}].pos`);
      if ('state' in e && (typeof e.state !== 'string' || !VALID_DRIFTER_STATES.has(e.state))) {
        fail(`scenario.drifters[${i}].state`, 'invalid drifter state');
      }
      if ('stolen' in e) number(e.stolen, `scenario.drifters[${i}].stolen`, 0, 3, true);
      if ('flee_ticks_left' in e) number(e.flee_ticks_left, `scenario.drifters[${i}].flee_ticks_left`, 0, 100000, true);
    }
  }

  if ('charms' in o) {
    if (!Array.isArray(o.charms)) fail('scenario.charms', 'expected array');
    const ids = new Set<string>();
    for (let i = 0; i < o.charms.length; i++) {
      const e = object(o.charms[i], `scenario.charms[${i}]`, ['id', 'pos', 'available', 'respawn_ticks']);
      if ('id' in e) {
        if (typeof e.id !== 'string' || !e.id.trim() || ids.has(e.id)) fail(`scenario.charms[${i}].id`, 'unique nonempty');
        ids.add(e.id);
      }
      pos3(e.pos, `scenario.charms[${i}].pos`);
      if ('available' in e) bool(e.available, `scenario.charms[${i}].available`);
      if ('respawn_ticks' in e) number(e.respawn_ticks, `scenario.charms[${i}].respawn_ticks`, 0, 100000, true);
    }
  }
}
