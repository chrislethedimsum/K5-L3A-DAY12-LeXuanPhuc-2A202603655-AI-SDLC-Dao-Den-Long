import { GameWorld, type NightNumber } from '../core/simulation';
import type { GameEvent } from '../core/types';
import { GameAudio } from './audio';
import { HUD } from './hud';
import { IslandScene } from './scene';
import { loadSettings, saveSettings, type GameSettings } from './settings';
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

const audio = new GameAudio();
let settings: GameSettings = loadSettings();

function applyVisualSettings(s: GameSettings): void {
  audio.setVolume(s.volume);
  document.body.classList.toggle('colorblind', s.colorblind);
  scene.setColorblind(s.colorblind);
}

applyVisualSettings(settings);

let currentNight: NightNumber = 1;
let totalScore = 0;
let world = new GameWorld({ seed: 42, night: 1 });
let screenMode: 'menu' | 'intro' | 'playing' | 'paused' | 'result' = 'menu';
let yaw = 0;
let accumulator = 0;
const keys = new Set<string>();
let interactQueued = false;
let pulseQueued = false;
let dashQueued = false;
let lastCountdownSec = -1;
let lastWindWarn = false;

function clearInput(): void {
  keys.clear();
  interactQueued = false;
  pulseQueued = false;
  dashQueued = false;
  accumulator = 0;
}

function loadNight(night: NightNumber, showIntro = true): void {
  currentNight = night;
  world = new GameWorld({ seed: 42 + night - 1, night });
  scene.reset();
  yaw = 0;
  lastCountdownSec = -1;
  lastWindWarn = false;
  clearInput();
  if (showIntro) {
    screenMode = 'intro';
    hud.showNightIntro(night, totalScore);
  } else {
    screenMode = 'playing';
    hud.hideModal();
  }
}

const hud = new HUD(settings, {
  onStartCampaign: (night) => {
    audio.unlock();
    totalScore = 0;
    loadNight(night, true);
  },
  onStartNight: () => {
    audio.unlock();
    screenMode = 'playing';
    clearInput();
    hud.hideModal();
  },
  onPause: () => pauseGame(),
  onResume: () => resumeGame(),
  onRestartNight: () => {
    audio.unlock();
    loadNight(currentNight, false);
  },
  onNextNight: () => {
    audio.unlock();
    if (currentNight < 3) loadNight((currentNight + 1) as NightNumber, true);
  },
  onBackToMenu: () => {
    screenMode = 'menu';
    clearInput();
    hud.showMainMenu();
  },
  onSettingsChange: (next) => {
    settings = next;
    saveSettings(next);
    applyVisualSettings(next);
  },
  onDeposit: () => {
    interactQueued = true;
  },
  onPulse: () => {
    pulseQueued = true;
  },
  onDash: () => {
    dashQueued = true;
  }
});

function pauseGame(): void {
  if (screenMode === 'playing' && world.getState() === 'playing') {
    world.step({ pause: true });
    world.step({ pause: false });
    screenMode = 'paused';
    clearInput();
    hud.showPause();
  }
}

function resumeGame(): void {
  audio.unlock();
  if (screenMode === 'paused') {
    if (world.getState() === 'paused') {
      world.step({ pause: false });
      world.step({ pause: true });
    }
    screenMode = 'playing';
    clearInput();
    hud.hideModal();
  }
}

hud.showMainMenu();

window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && e.target === document.body) {
    e.preventDefault();
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (screenMode === 'playing') pauseGame();
    else if (screenMode === 'paused') resumeGame();
    return;
  }
  if (screenMode === 'playing') keys.add(e.code);
});

window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', pauseGame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

let dragging = false;
let lastX = 0;
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  dragging = true;
  lastX = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (dragging && screenMode === 'playing') {
    yaw -= (e.clientX - lastX) * 0.006 * settings.sensitivity;
    lastX = e.clientX;
  }
});
canvas.addEventListener('pointerup', () => (dragging = false));
canvas.addEventListener('pointercancel', () => (dragging = false));

const down = (...codes: string[]) => codes.some((c) => keys.has(c));

function handleEvents(events: GameEvent[], prevGrounded: boolean): void {
  const snap = world.snapshot();
  if (prevGrounded && !snap.player.grounded && snap.player.vel[1] > 0) audio.playJump();
  for (const e of events) {
    if (e.name === 'mote_picked') audio.playPickup();
    else if (e.name === 'deposit') audio.playDeposit();
    else if (e.name === 'refuel') audio.playRefuel();
    else if (e.name === 'lantern_lit') audio.playLanternLit();
    else if (e.name === 'lantern_out') audio.playLanternOut();
    else if (e.name === 'pulse') audio.playPulse();
    else if (e.name === 'player_hit') audio.playHit();
    else if (e.name === 'dash') audio.playDash();
    else if (e.name === 'shade_spawned') audio.playShadeSpawn();
    else if (e.name === 'charm_picked') audio.playCharm();
    else if (e.name === 'game_over') {
      if (e.data.result === 'won') {
        audio.playWin();
        totalScore += snap.score;
      } else {
        audio.playLose();
      }
      screenMode = 'result';
      hud.showNightResult(currentNight, e.data.result === 'won', e.data.reason, snap.score, totalScore);
    }
  }
}

const fpsTracker = { frames: 0, elapsedMs: 0, fps: 0, avgMs: 0 };
(window as unknown as { __DDL_FPS__: typeof fpsTracker }).__DDL_FPS__ = fpsTracker;

let last = performance.now();

function frame(now: number): void {
  const rawDeltaMs = Math.min(now - last, 150);
  const delta = rawDeltaMs / 1000;
  last = now;

  fpsTracker.frames++;
  fpsTracker.elapsedMs += rawDeltaMs;
  if (fpsTracker.elapsedMs > 0) {
    fpsTracker.avgMs = fpsTracker.elapsedMs / fpsTracker.frames;
    fpsTracker.fps = Math.round((fpsTracker.frames * 1000) / fpsTracker.elapsedMs);
  }

  const events: GameEvent[] = [];
  if (screenMode === 'playing') {
    accumulator += delta;
    while (accumulator >= 1 / 60 && world.getState() === 'playing') {
      const prevGrounded = world.snapshot().player.grounded;
      const mx = Number(down('KeyD', 'ArrowRight')) - Number(down('KeyA', 'ArrowLeft'));
      const mz = Number(down('KeyS', 'ArrowDown')) - Number(down('KeyW', 'ArrowUp'));
      const stepEvents = world.step({
        move: [mx, mz],
        cam_yaw_deg: (yaw * 180) / Math.PI,
        jump: down('Space'),
        dash: down('ShiftLeft', 'ShiftRight', 'KeyL') || dashQueued,
        interact: down('KeyE') || interactQueued,
        pulse: down('KeyQ') || pulseQueued
      });
      events.push(...stepEvents);
      handleEvents(stepEvents, prevGrounded);
      interactQueued = false;
      pulseQueued = false;
      dashQueued = false;
      accumulator -= 1 / 60;
    }
  }

  const snapshot = world.snapshot();
  const hudState = world.hudState();

  if (screenMode === 'playing') {
    const secs = Math.ceil(snapshot.time_left_s);
    if (secs <= 10 && secs > 0 && secs !== lastCountdownSec) {
      lastCountdownSec = secs;
      audio.playCountdown();
    }
    if (hudState.wind_warning && !lastWindWarn) {
      audio.playWindWarning();
    }
    lastWindWarn = hudState.wind_warning;
  }

  hud.update(snapshot, hudState, totalScore, (pos) => scene.projectToScreen(pos));
  scene.draw(snapshot, hudState, yaw, now / 1000, delta, events);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
