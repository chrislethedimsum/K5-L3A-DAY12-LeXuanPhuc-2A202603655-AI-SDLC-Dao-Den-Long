import raw from '../../game.contract.json';
import type { Tuning } from './types';

function validate(): void {
  if (raw.contract_version !== '1.1' || !raw.team || !raw.build_cmd || !raw.run_cmd || !raw.headless_cmd) {
    throw new Error('Invalid contract v1.1 metadata');
  }
  for (const [key, value] of Object.entries(raw.tuning)) {
    if (key === 'score') {
      for (const n of Object.values(value as Tuning['score'])) {
        if (!Number.isFinite(n) || n < 0) throw new Error('Invalid score tuning');
      }
    } else if (key === 'fall_enabled') {
      if (typeof value !== 'boolean') throw new Error('Invalid fall_enabled');
    } else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid tuning ${key}`);
    }
  }
  if (raw.tuning.lantern_count_night1 !== 5 || raw.tuning.lantern_cost > raw.tuning.carry_capacity) {
    throw new Error('Inconsistent tuning');
  }
}

validate();

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const contract = freeze(raw);
export default contract;
