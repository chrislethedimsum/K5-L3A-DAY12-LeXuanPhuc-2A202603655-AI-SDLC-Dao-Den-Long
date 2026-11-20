import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACTION_ORDER,
  DEFAULT_KEYBINDS,
  formatKeyCode,
  rebindAction,
  sanitizeKeybinds
} from '../../src/core/keybinds';
import {
  addLeaderboardEntry,
  formatIsoWithTimezone,
  sortLeaderboard,
  validatePlayerName,
  type LeaderboardEntry
} from '../../src/core/leaderboard';
import { GameWorld } from '../../src/core/simulation';

describe('Phase 4 Ticket-04: Leaderboard, Keybinds, Bench Scene & Non-Interference', () => {
  it('validates [A-Za-z0-9_] and Vietnamese names of 3-12 chars', () => {
    expect(validatePlayerName('May_01').valid).toBe(true);
    expect(validatePlayerName('MinhÁnh_9').valid).toBe(true);
    expect(validatePlayerName('Ab').valid).toBe(false);
    expect(validatePlayerName('Abcdefghijklm').valid).toBe(false);
    expect(validatePlayerName('May 01').valid).toBe(false);
    expect(validatePlayerName('May!01').valid).toBe(false);
  });

  it('sorts leaderboard descending by score, breaks ties by earliest time, caps at top 10', () => {
    let entries: LeaderboardEntry[] = [];
    for (let i = 0; i < 12; i++) {
      entries = addLeaderboardEntry(entries, {
        name: `User_${i}`,
        score: i === 11 ? 500 : 100 + i * 50,
        nights_won: i % 4,
        seed: 42 + i,
        achieved_at: `2026-11-20T10:${String(i + 10).padStart(2, '0')}:00+07:00`
      });
    }
    expect(entries).toHaveLength(10);
    expect(entries[0].score).toBe(600);
    // User_8 and User_11 both have score 500; User_8 occurred earlier
    const tied500 = entries.filter((e) => e.score === 500).map((e) => e.name);
    expect(tied500).toEqual(['User_8', 'User_11']);
    expect(sortLeaderboard(entries)).toHaveLength(10);
    expect(formatIsoWithTimezone(new Date('2026-11-20T03:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('manages 9 keybinds, detects conflicts, and resets cleanly', () => {
    expect(ACTION_ORDER).toHaveLength(9);
    const conflict = rebindAction(DEFAULT_KEYBINDS, 'jump', 'KeyE');
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.conflictAction).toBe('interact');
    }

    const valid = rebindAction(DEFAULT_KEYBINDS, 'jump', 'KeyJ');
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.binds.jump).toBe('KeyJ');
    }

    expect(formatKeyCode('KeyW')).toBe('W');
    expect(formatKeyCode('ShiftLeft')).toBe('Shift');
    expect(sanitizeKeybinds({ ...DEFAULT_KEYBINDS, jump: 'KeyW' })).toEqual(DEFAULT_KEYBINDS);
  });

  it('initializes standardized Night 1 benchMode with 200 Shades, 100 Motes, L1-L3 fuel=100, disabled combat/decay/end', () => {
    const b1 = new GameWorld({ seed: 42, night: 1, benchMode: true });
    const b2 = new GameWorld({ seed: 42, night: 1, benchMode: true });
    const snap0 = b1.snapshot();

    expect(snap0.night).toBe(1);
    expect(snap0.shades).toHaveLength(200);
    expect(snap0.shades.every((s) => s.state === 'wander')).toBe(true);
    expect(snap0.motes).toHaveLength(100);
    expect(snap0.player.pos).toEqual([0, 0, 0]);
    expect(snap0.lanterns.slice(0, 3).every((l) => l.lit && l.fuel === 100)).toBe(true);
    expect(snap0.lanterns.slice(3).every((l) => !l.lit && l.fuel === 0)).toBe(true);

    // Run 300 ticks with heavy simulated player inputs (must be ignored in benchMode)
    for (let i = 0; i < 300; i++) {
      expect(b1.step({ move: [1, 1], jump: true, dash: true, interact: true, pulse: true })).toEqual([]);
      b2.step({});
    }

    const snapAfter = b1.snapshot();
    expect(snapAfter).toEqual(b2.snapshot());
    expect(snapAfter.player.pos).toEqual([0, 0, 0]);
    expect(snapAfter.player.flames).toBe(3);
    expect(snapAfter.player.carried).toBe(0);
    expect(snapAfter.motes).toHaveLength(100);
    expect(snapAfter.shades).toHaveLength(200);
    expect(snapAfter.shades.every((s) => s.state === 'wander')).toBe(true);
    expect(snapAfter.lanterns.slice(0, 3).every((l) => l.lit && l.fuel === 100)).toBe(true);
    expect(snapAfter.state).toBe('playing');
    // Verify Shades actually wandered
    const moved = snapAfter.shades.some(
      (s, i) => Math.hypot(s.pos[0] - snap0.shades[i].pos[0], s.pos[2] - snap0.shades[i].pos[2]) > 0.5
    );
    expect(moved).toBe(true);
  });

  it('keeps src/core free of DOM/client imports so creativity never affects headless determinism', () => {
    for (const file of ['simulation.ts', 'maps.ts', 'validators.ts', 'leaderboard.ts', 'keybinds.ts']) {
      const code = readFileSync(resolve('src/core', file), 'utf8');
      expect(code).not.toMatch(/from\s+['"]\.\.\/client/);
      expect(code).not.toMatch(/\b(document|window|localStorage|AudioContext)\b/);
    }
  });
});
