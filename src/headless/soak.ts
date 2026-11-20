import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { NightNumber } from '../core/maps';
import type { InputFrame } from '../core/types';
import { mulberry32 } from '../core/rng';
import { GameWorld } from '../core/simulation';
import { NIGHT_MAPS } from '../core/maps';
import { number } from '../core/validators';

const round1 = (n: number): number => Math.round(n * 10) / 10;
const rssMb = (): number => round1(process.memoryUsage().rss / (1024 * 1024));

function main(args: string[]): void {
  const allowed = ['seed', 'nights', 'out'];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.startsWith('--') ? args[i].slice(2) : '';
    if (!allowed.includes(key) || flags.has(key) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error(`Invalid, duplicate, or missing flag: ${args[i] ?? ''}`);
    }
    flags.set(key, args[i + 1]);
  }

  const parseIntFlag = (key: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number => {
    if (!flags.has(key)) return fallback;
    const raw = flags.get(key)!;
    if (!/^\d+$/.test(raw)) throw new Error(`--${key} requires an integer`);
    return number(Number(raw), `--${key}`, min, max, true);
  };

  const baseSeed = parseIntFlag('seed', 7, 0, 4294967295);
  const nights = parseIntFlag('nights', 10, 1, 1000);
  const outPath = flags.get('out');

  const gc = (globalThis as { gc?: () => void }).gc;

  // Engine runtime bytecode warmup (pages in simulation paths across Nights 1-3 before Night 1 loads)
  {
    const mv: [number, number] = [1, 0];
    const warmInput: InputFrame = { move: mv, jump: false, dash: false, pulse: false, interact: false };
    for (const n of [1, 2, 3] as NightNumber[]) {
      let warmWorld: GameWorld | null = new GameWorld({ seed: 1, night: n });
      for (let t = 0; t < 400 && warmWorld.getState() === 'playing'; t++) {
        warmInput.jump = t % 20 === 0;
        warmInput.dash = t % 35 === 0;
        warmInput.interact = t % 10 === 0;
        warmWorld.step(warmInput);
      }
      warmWorld = null;
    }
    gc?.();
  }

  const startMs = performance.now();
  let memStartMb: number | null = null;
  let crashes = 0;
  const results: ('won' | 'lost')[] = [];
  const movePair: [number, number] = [0, 0];
  const inputFrame: InputFrame = {
    move: movePair,
    jump: false,
    dash: false,
    pulse: false,
    interact: false
  };

  for (let i = 0; i < nights; i++) {
    const night = ((i % 3) + 1) as NightNumber;
    const nightSeed = (baseSeed + i) >>> 0;
    const maxTicks = NIGHT_MAPS[night].durationS * 60;
    const inputRng = mulberry32((nightSeed ^ 0x9e3779b9) >>> 0);

    try {
      let world: GameWorld | null = new GameWorld({ seed: nightSeed, night });
      if (i === 0) {
        memStartMb = rssMb();
      }

      movePair[0] = 0;
      movePair[1] = 0;
      for (let tick = 0; tick < maxTicks; tick++) {
        const state = world.getState();
        if (state === 'won' || state === 'lost') break;

        if (tick % 30 === 0) {
          const angle = inputRng() * Math.PI * 2;
          movePair[0] = Math.cos(angle);
          movePair[1] = Math.sin(angle);
        }
        inputFrame.jump = inputRng() < 0.05;
        inputFrame.dash = inputRng() < 0.03;
        inputFrame.pulse = inputRng() < 0.02;
        inputFrame.interact = inputRng() < 0.1;
        world.step(inputFrame);
      }

      const endState = world.getState();
      results.push(endState === 'won' ? 'won' : 'lost');
      world = null;
      gc?.();
    } catch (err) {
      crashes++;
      results.push('lost');
      gc?.();
      process.stderr.write(`Soak crash on night index ${i}: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  const memEndMb = rssMb();
  const durationS = round1((performance.now() - startMs) / 1000);
  const report = {
    nights,
    crashes,
    results,
    mem_start_mb: memStartMb ?? memEndMb,
    mem_end_mb: memEndMb,
    duration_s: durationS
  };

  const json = JSON.stringify(report, null, 2) + '\n';
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, json, 'utf8');
  } else {
    process.stdout.write(json);
  }

  if (crashes > 0) process.exitCode = 1;
}

try {
  main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 2;
}
