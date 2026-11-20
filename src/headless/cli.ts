import { readFileSync, writeFileSync } from 'node:fs';
import { GameWorld } from '../core/simulation';
import { number, validateInputsFile, validateScenario } from '../core/validators';
import type { InputFrame, Scenario } from '../core/types';

function main(args: string[]): void {
  const allowed = ['seed', 'night', 'scenario', 'inputs', 'ticks', 'out', 'snapshot-every'];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.startsWith('--') ? args[i].slice(2) : '';
    if (!allowed.includes(key) || flags.has(key) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error(`Invalid, duplicate, or missing flag: ${args[i] ?? ''}`);
    }
    flags.set(key, args[i + 1]);
  }

  const integer = (key: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number => {
    if (!flags.has(key)) return fallback;
    const raw = flags.get(key)!;
    if (!/^\d+$/.test(raw)) throw new Error(`--${key} requires an integer`);
    return number(Number(raw), `--${key}`, min, max, true);
  };

  const seed = flags.has('seed') ? integer('seed', 42, 0, 4294967295) : undefined;
  const night = flags.has('night') ? integer('night', 1, 1, 1) : undefined;
  const ticks = integer('ticks', 10800, 0);
  const interval = integer('snapshot-every', 10, 1);

  let scenario: Scenario | undefined;
  if (flags.has('scenario')) {
    const v: unknown = JSON.parse(readFileSync(flags.get('scenario')!, 'utf8'));
    validateScenario(v);
    scenario = v;
  }

  let frames: (InputFrame & { tick: number })[] = [];
  if (flags.has('inputs')) {
    const v: unknown = JSON.parse(readFileSync(flags.get('inputs')!, 'utf8'));
    validateInputsFile(v);
    frames = v.frames;
  }

  const world = new GameWorld({ seed, night, scenario });
  const lines: string[] = [];
  const pushSnapshot = () => lines.push(JSON.stringify(world.snapshot()));

  pushSnapshot();
  let cursor = 0;
  const activeInput: InputFrame = {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false
  };

  for (let tick = 0; tick < ticks && world.snapshot().state === 'playing'; tick++) {
    if (frames[cursor]?.tick === tick) {
      const f = frames[cursor++];
      if (f.move !== undefined) activeInput.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) activeInput.cam_yaw_deg = f.cam_yaw_deg;
      if (f.jump !== undefined) activeInput.jump = f.jump;
      if (f.interact !== undefined) activeInput.interact = f.interact;
      if (f.pulse !== undefined) activeInput.pulse = f.pulse;
      if (f.dash !== undefined) activeInput.dash = f.dash;
    }

    for (const event of world.step(activeInput)) {
      lines.push(JSON.stringify(event));
    }

    if ((tick + 1) % interval === 0) {
      pushSnapshot();
    }
  }

  lines.push(JSON.stringify(world.endRecord()));
  const output = lines.join('\n') + '\n';
  if (flags.has('out')) {
    writeFileSync(flags.get('out')!, output);
  } else {
    process.stdout.write(output);
  }
}

try {
  main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 2;
}
