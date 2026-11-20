import {
  addLeaderboardEntry,
  sanitizeLeaderboardEntries,
  sortLeaderboard,
  type LeaderboardEntry
} from '../core/leaderboard';

const STORAGE_KEY = 'dao_den_long_leaderboard_v1';

function readLocal(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: unknown };
    return sanitizeLeaderboardEntries(parsed?.entries);
  } catch {
    return [];
  }
}

function writeLocal(entries: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: sortLeaderboard(entries) }));
  } catch {
    // Ignore storage quota errors
  }
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { entries?: unknown };
      const entries = sanitizeLeaderboardEntries(data?.entries);
      writeLocal(entries);
      return entries;
    }
  } catch {
    // Static preview without /api/leaderboard falls back to localStorage
  }
  return readLocal();
}

export async function submitLeaderboardEntry(candidate: {
  name: string;
  score: number;
  nights_won: number;
  seed: number;
}): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate)
    });
    if (res.ok) {
      const data = (await res.json()) as { entries?: unknown };
      const entries = sanitizeLeaderboardEntries(data?.entries);
      writeLocal(entries);
      return entries;
    }
    if (res.status === 400) {
      const errData = (await res.json()) as { error?: string };
      throw new Error(errData.error || 'Dữ liệu bảng xếp hạng không hợp lệ.');
    }
  } catch (err) {
    if (err instanceof Error && !err.message.includes('fetch') && !err.message.includes('NetworkError')) {
      // Server returned explicit validation error unless offline
      if (err.message.includes('Tên') || err.message.includes('Điểm') || err.message.includes('không hợp lệ')) {
        throw err;
      }
    }
  }

  const next = addLeaderboardEntry(readLocal(), candidate);
  writeLocal(next);
  return next;
}
