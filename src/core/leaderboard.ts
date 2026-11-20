export interface LeaderboardEntry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
}

export const MAX_LEADERBOARD_ENTRIES = 10;
export const PLAYER_NAME_REGEX = /^[A-Za-z0-9_À-ỹà-ỹĐđ]{3,12}$/u;

export function validatePlayerName(raw: string): { valid: boolean; trimmed: string; reason?: string } {
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 12) {
    return { valid: false, trimmed, reason: 'Tên phải dài từ 3 đến 12 ký tự.' };
  }
  if (!PLAYER_NAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      trimmed,
      reason: 'Chỉ dùng chữ (kể cả tiếng Việt có dấu), số hoặc dấu gạch dưới (_), không khoảng trắng.'
    };
  }
  return { valid: true, trimmed };
}

export function formatIsoWithTimezone(date: Date = new Date()): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0');
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(offsetMin) / 60));
  const om = pad(Math.abs(offsetMin) % 60);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${oh}:${om}`;
}

export function sortLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return entries
    .map((entry, idx) => ({ entry: { ...entry }, idx }))
    .sort((a, b) => {
      if (b.entry.score !== a.entry.score) return b.entry.score - a.entry.score;
      const ta = Date.parse(a.entry.achieved_at);
      const tb = Date.parse(b.entry.achieved_at);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      return a.idx - b.idx;
    })
    .slice(0, MAX_LEADERBOARD_ENTRIES)
    .map((x) => x.entry);
}

export function sanitizeLeaderboardEntries(raw: unknown): LeaderboardEntry[] {
  if (!Array.isArray(raw)) return [];
  const valid: LeaderboardEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.name !== 'string' || !validatePlayerName(o.name).valid) continue;
    if (typeof o.score !== 'number' || !Number.isSafeInteger(o.score) || o.score < 0) continue;
    if (typeof o.nights_won !== 'number' || !Number.isSafeInteger(o.nights_won) || o.nights_won < 0 || o.nights_won > 3) {
      continue;
    }
    if (typeof o.seed !== 'number' || !Number.isSafeInteger(o.seed) || o.seed < 0 || o.seed > 4294967295) continue;
    if (typeof o.achieved_at !== 'string' || !Number.isFinite(Date.parse(o.achieved_at))) continue;
    valid.push({
      name: o.name.trim(),
      score: o.score,
      nights_won: o.nights_won,
      achieved_at: o.achieved_at,
      seed: o.seed
    });
  }
  return sortLeaderboard(valid);
}

export function addLeaderboardEntry(
  existing: LeaderboardEntry[],
  candidate: { name: string; score: number; nights_won: number; seed: number; achieved_at?: string }
): LeaderboardEntry[] {
  const check = validatePlayerName(candidate.name);
  if (!check.valid) throw new Error(check.reason ?? 'Tên không hợp lệ');
  if (!Number.isSafeInteger(candidate.score) || candidate.score < 0) {
    throw new Error('Điểm phải là số nguyên không âm.');
  }
  if (!Number.isSafeInteger(candidate.nights_won) || candidate.nights_won < 0 || candidate.nights_won > 3) {
    throw new Error('nights_won phải nằm trong [0, 3].');
  }
  if (!Number.isSafeInteger(candidate.seed) || candidate.seed < 0 || candidate.seed > 4294967295) {
    throw new Error('seed phải là uint32 hợp lệ.');
  }
  const achievedAt = candidate.achieved_at ?? formatIsoWithTimezone();
  if (!Number.isFinite(Date.parse(achievedAt))) {
    throw new Error('achieved_at phải là chuỗi ISO 8601 hợp lệ.');
  }
  const entry: LeaderboardEntry = {
    name: check.trimmed,
    score: candidate.score,
    nights_won: candidate.nights_won,
    achieved_at: achievedAt,
    seed: candidate.seed
  };
  return sortLeaderboard([...sanitizeLeaderboardEntries(existing), entry]);
}
