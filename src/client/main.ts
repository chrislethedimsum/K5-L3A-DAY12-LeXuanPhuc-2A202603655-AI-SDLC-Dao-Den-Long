import { GameWorld, type NightNumber } from '../core/simulation';
import type { GameEvent } from '../core/types';
import { GameAudio } from './audio';
import { HUD, type NightClientStats } from './hud';
import { fetchLeaderboard, submitLeaderboardEntry } from './leaderboard';
import { IslandScene } from './scene';
import { loadSettings, saveSettings, type GameSettings } from './settings';
import './style.css';

const params = new URLSearchParams(window.location.search);
const isBench = params.get('bench') === '1';

const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const flashEl = document.querySelector<HTMLDivElement>('#screen-flash')!;
const hudRoot = document.querySelector<HTMLDivElement>('#hud')!;

let scene: IslandScene;
try {
  scene = new IslandScene(canvas);
} catch (error) {
  hudRoot.textContent =
    'Không khởi tạo được WebGL. Hãy bật tăng tốc phần cứng hoặc thử trình duyệt hỗ trợ WebGL.';
  console.error(error);
  throw error;
}

if (isBench) {
  runBenchmarkMode();
} else {
  runGameMode();
}

function runBenchmarkMode(): void {
  const seedRaw = Number(params.get('seed') ?? '42');
  const seed = Number.isSafeInteger(seedRaw) && seedRaw >= 0 && seedRaw <= 4294967295 ? seedRaw : 42;
  const durRaw = Number(params.get('duration') ?? '30');
  const durationS = Number.isFinite(durRaw) && durRaw > 0 ? durRaw : 30;

  hudRoot.hidden = true;
  scene.setBenchMode(true);

  const world = new GameWorld({ seed, night: 1, benchMode: true });
  const initSnap = world.snapshot();
  const initHud = world.hudState();
  scene.draw(initSnap, initHud, 0, 0, 1 / 60, [], 0);
  void fetch('/__bench_first_frame', { method: 'POST' }).catch(() => {});

  const round1 = (n: number): number => Math.round(n * 10) / 10;
  const warmupMs = 3000;
  const measureMs = durationS * 1000;
  const dts: number[] = [];

  const firstFrameNow = performance.now();
  let prevNow = firstFrameNow;
  let accumulator = 0;

  const stepBench = (now: number): void => {
    const dtMs = now - prevNow;
    prevNow = now;
    const elapsedTotalMs = now - firstFrameNow;

    accumulator += Math.min(dtMs, 100) / 1000;
    let steps = 0;
    while (accumulator >= 1 / 60 && steps < 4) {
      world.step({});
      accumulator -= 1 / 60;
      steps++;
    }

    const snap = world.snapshot();
    const hudState = world.hudState();
    scene.draw(snap, hudState, 0, elapsedTotalMs / 1000, dtMs / 1000, [], elapsedTotalMs / 1000);

    if (elapsedTotalMs >= warmupMs) {
      dts.push(dtMs);
    }

    if (elapsedTotalMs >= warmupMs + measureMs && dts.length > 0) {
      const n = dts.length;
      let sumMs = 0;
      for (let i = 0; i < n; i++) sumMs += dts[i];
      const sortedDesc = [...dts].sort((a, b) => b - a);
      const k = Math.max(1, Math.ceil(0.01 * n));
      let slowSum = 0;
      for (let i = 0; i < k; i++) slowSum += sortedDesc[i];
      const sortedAsc = [...sortedDesc].reverse();
      const p95Idx = Math.min(n - 1, Math.ceil(0.95 * n) - 1);

      const payload = {
        frames: n,
        avg_fps: round1((1000 * n) / sumMs),
        p1_low_fps: round1(1000 / (slowSum / k)),
        frame_ms_p95: round1(sortedAsc[p95Idx]),
        renderer: scene.getRendererInfo()
      };
      void fetch('/__bench_result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
      return;
    }

    requestAnimationFrame(stepBench);
  };

  requestAnimationFrame(stepBench);
}

function runGameMode(): void {
  const audio = new GameAudio();
  let settings: GameSettings = loadSettings();

  function applySettings(s: GameSettings): void {
    audio.setVolume(s.volume);
    document.body.classList.toggle('colorblind', s.colorblind);
    document.body.classList.toggle('reduced-motion', s.reducedMotion);
    document.body.classList.toggle('large-text', s.largeText);
    scene.setColorblind(s.colorblind);
    scene.setReducedMotion(s.reducedMotion);
  }

  applySettings(settings);

  const campaignSeed = 42;
  let currentNight: NightNumber = 1;
  let totalScore = 0;
  let nightsWon = 0;
  let world = new GameWorld({ seed: campaignSeed, night: 1 });
  let screenMode: 'menu' | 'intro' | 'playing' | 'paused' | 'result' = 'menu';
  let yaw = 0;
  let accumulator = 0;
  const keys = new Set<string>();
  let interactQueued = false;
  let pulseQueued = false;
  let dashQueued = false;
  let lastCountdownSec = -1;
  let lastWindWarn = false;
  let flashTimer = 0;
  let stats: NightClientStats = { lit: 0, relit: 0, refuel: 0, drainStun: 0, hits: 0 };
  const lastDrainingIds = new Set<string>();

  function triggerFlash(kind: 'hit' | 'pulse'): void {
    if (settings.reducedMotion) return;
    flashEl.className = kind;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      flashEl.className = '';
    }, 180);
  }

  function clearInput(): void {
    keys.clear();
    interactQueued = false;
    pulseQueued = false;
    dashQueued = false;
    accumulator = 0;
  }

  function loadNight(night: NightNumber, showIntro = true): void {
    currentNight = night;
    world = new GameWorld({ seed: campaignSeed + night - 1, night });
    scene.reset();
    hud.resetNightOverlays();
    yaw = 0;
    lastCountdownSec = -1;
    lastWindWarn = false;
    stats = { lit: 0, relit: 0, refuel: 0, drainStun: 0, hits: 0 };
    lastDrainingIds.clear();
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
      nightsWon = 0;
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
      applySettings(next);
    },
    onSaveScore: (name) =>
      submitLeaderboardEntry({
        name,
        score: totalScore,
        nights_won: nightsWon,
        seed: campaignSeed
      }),
    onLoadLeaderboard: () => fetchLeaderboard(),
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

  function isCodeBoundElsewhere(code: string, targetCode: string): boolean {
    return Object.values(settings.keybinds).includes(code) && code !== targetCode;
  }

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    audio.unlock();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && e.target === document.body) {
      e.preventDefault();
    }
    const kb = settings.keybinds;
    const isPauseKey = e.code === kb.pause || (e.code === 'KeyP' && !isCodeBoundElsewhere('KeyP', kb.pause));
    if (isPauseKey) {
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

  const actionDown = (primaryCode: string, fallback?: string): boolean => {
    if (keys.has(primaryCode)) return true;
    if (fallback && !Object.values(settings.keybinds).includes(fallback) && keys.has(fallback)) return true;
    return false;
  };

  function handleEvents(events: GameEvent[], prevGrounded: boolean): void {
    const snap = world.snapshot();
    if (prevGrounded && !snap.player.grounded && snap.player.vel[1] > 0) audio.playJump();
    for (const e of events) {
      if (e.name === 'mote_picked') audio.playPickup();
      else if (e.name === 'deposit') audio.playDeposit();
      else if (e.name === 'refuel') {
        stats.refuel++;
        audio.playRefuel();
      } else if (e.name === 'lantern_lit') {
        if (e.data.relight) stats.relit++;
        else stats.lit++;
        audio.playLanternLit();
      } else if (e.name === 'lantern_out') audio.playLanternOut();
      else if (e.name === 'pulse') {
        for (const sid of e.data.stunned_ids) {
          if (lastDrainingIds.has(sid)) stats.drainStun++;
        }
        triggerFlash('pulse');
        audio.playPulse();
      } else if (e.name === 'player_hit') {
        stats.hits++;
        triggerFlash('hit');
        audio.playHit();
      } else if (e.name === 'dash') audio.playDash();
      else if (e.name === 'shade_spawned') {
        hud.notifyShadeSpawned(e.data.id);
        audio.playShadeSpawn();
      } else if (e.name === 'charm_picked') audio.playCharm();
      else if (e.name === 'game_over') {
        if (e.data.result === 'won') {
          audio.playWin();
          totalScore += snap.score;
          nightsWon = Math.max(nightsWon, currentNight);
        } else {
          audio.playLose();
        }
        screenMode = 'result';
        hud.showNightResult(
          currentNight,
          e.data.result === 'won',
          e.data.reason,
          snap.score,
          totalScore,
          nightsWon,
          campaignSeed,
          { ...stats }
        );
      }
    }

    lastDrainingIds.clear();
    for (const sh of snap.shades) {
      if (sh.state === 'drain') lastDrainingIds.add(sh.id);
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
      const kb = settings.keybinds;
      while (accumulator >= 1 / 60 && world.getState() === 'playing') {
        const prevGrounded = world.snapshot().player.grounded;
        const mx =
          Number(actionDown(kb.moveRight, 'ArrowRight')) - Number(actionDown(kb.moveLeft, 'ArrowLeft'));
        const mz =
          Number(actionDown(kb.moveDown, 'ArrowDown')) - Number(actionDown(kb.moveUp, 'ArrowUp'));
        const stepEvents = world.step({
          move: [mx, mz],
          cam_yaw_deg: (yaw * 180) / Math.PI,
          jump: actionDown(kb.jump),
          dash: actionDown(kb.dash, 'ShiftRight') || dashQueued,
          interact: actionDown(kb.interact) || interactQueued,
          pulse: actionDown(kb.pulse) || pulseQueued
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
}
