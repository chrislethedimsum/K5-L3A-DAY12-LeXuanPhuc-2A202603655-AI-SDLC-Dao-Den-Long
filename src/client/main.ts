import { GameWorld } from '../core/simulation';
import type { GameEvent } from '../core/types';
import { IslandScene } from './scene';
import { HUD } from './hud';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
let scene: IslandScene;
try {
  scene = new IslandScene(canvas);
} catch (error) {
  document.querySelector('#hud')!.textContent =
    'Không khởi tạo được WebGL. Hãy bật tăng tốc phần cứng hoặc thử trình duyệt hỗ trợ WebGL.';
  console.error(error);
  throw error;
}

let world = new GameWorld({ seed: 42 });
let started = false;
let paused = true;
let yaw = 0;
let accumulator = 0;
const keys = new Set<string>();
let pulseQueued = false;
let interactQueued = false;

function clearInput(): void {
  keys.clear();
  pulseQueued = false;
  interactQueued = false;
  accumulator = 0;
}

const hud = new HUD(
  () => {
    if (!started || world.snapshot().state !== 'playing') {
      world = new GameWorld({ seed: 42 });
      scene.reset();
      yaw = 0;
    }
    started = true;
    paused = false;
    clearInput();
    hud.hide();
  },
  () => pause(),
  () => {
    pulseQueued = true;
  },
  () => {
    interactQueued = true;
  }
);

function pause(): void {
  if (started && !paused && world.snapshot().state === 'playing') {
    paused = true;
    clearInput();
    hud.pause();
  }
}

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && e.target === document.body) {
    e.preventDefault();
  }
  if (e.code === 'Escape') {
    pause();
    return;
  }
  if (!paused) keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

let dragging = false;
let lastX = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (dragging && !paused) {
    yaw -= (e.clientX - lastX) * 0.006;
    lastX = e.clientX;
  }
});
canvas.addEventListener('pointerup', () => {
  dragging = false;
});
canvas.addEventListener('pointercancel', () => {
  dragging = false;
});

const down = (...codes: string[]) => codes.some((c) => keys.has(c));
let last = performance.now();

function frame(now: number): void {
  const delta = Math.min((now - last) / 1000, 0.15);
  last = now;
  const events: GameEvent[] = [];

  if (!paused) {
    accumulator += delta;
    while (accumulator >= 1 / 60) {
      const mx = Number(down('KeyD', 'ArrowRight')) - Number(down('KeyA', 'ArrowLeft'));
      const mz = Number(down('KeyS', 'ArrowDown')) - Number(down('KeyW', 'ArrowUp'));
      events.push(
        ...world.step({
          move: [mx, mz],
          cam_yaw_deg: (yaw * 180) / Math.PI,
          jump: down('Space'),
          interact: down('KeyE') || interactQueued,
          pulse: down('KeyQ', 'ShiftLeft', 'ShiftRight') || pulseQueued
        })
      );
      pulseQueued = false;
      interactQueued = false;
      accumulator -= 1 / 60;
    }
  }

  const snapshot = world.snapshot();
  const hudState = world.hudState();
  hud.update(snapshot, hudState);
  scene.draw(snapshot, hudState, yaw, now / 1000, delta, events);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
