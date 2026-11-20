import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const PLAYER_NAME_REGEX = /^[A-Za-z0-9_À-ỹà-ỹĐđ]{3,12}$/u;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8'
};

function getDataDir() {
  return process.env.DAO_DEN_LONG_DATA_DIR || join(homedir(), '.dao-den-long');
}

function getLeaderboardPath() {
  return join(getDataDir(), 'leaderboard.json');
}

function formatIsoWithTimezone(date = new Date()) {
  const pad = (n) => String(Math.trunc(Math.abs(n))).padStart(2, '0');
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

function sortAndSanitizeEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const clean = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.name !== 'string') continue;
    const trimmed = item.name.trim();
    if (!PLAYER_NAME_REGEX.test(trimmed)) continue;
    if (typeof item.score !== 'number' || !Number.isSafeInteger(item.score) || item.score < 0) continue;
    if (
      typeof item.nights_won !== 'number' ||
      !Number.isSafeInteger(item.nights_won) ||
      item.nights_won < 0 ||
      item.nights_won > 3
    ) {
      continue;
    }
    if (typeof item.seed !== 'number' || !Number.isSafeInteger(item.seed) || item.seed < 0 || item.seed > 4294967295) {
      continue;
    }
    if (typeof item.achieved_at !== 'string' || !Number.isFinite(Date.parse(item.achieved_at))) continue;
    clean.push({
      name: trimmed,
      score: item.score,
      nights_won: item.nights_won,
      achieved_at: item.achieved_at,
      seed: item.seed
    });
  }
  return clean
    .map((entry, idx) => ({ entry, idx }))
    .sort((a, b) => {
      if (b.entry.score !== a.entry.score) return b.entry.score - a.entry.score;
      const ta = Date.parse(a.entry.achieved_at);
      const tb = Date.parse(b.entry.achieved_at);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      return a.idx - b.idx;
    })
    .slice(0, 10)
    .map((x) => x.entry);
}

function readLeaderboard() {
  const file = getLeaderboardPath();
  if (!existsSync(file)) return { entries: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return { entries: sortAndSanitizeEntries(parsed?.entries) };
  } catch {
    return { entries: [] };
  }
}

function writeLeaderboard(data) {
  const file = getLeaderboardPath();
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify({ entries: data.entries }, null, 2) + '\n', 'utf8');
  renameSync(tmp, file);
}

function addEntry(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Dữ liệu không hợp lệ.');
  }
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  if (!PLAYER_NAME_REGEX.test(name)) {
    throw new Error('Tên phải dài 3–12 ký tự [A-Za-z0-9_] (hỗ trợ tiếng Việt có dấu, không khoảng trắng).');
  }
  const score = Number(candidate.score);
  const nightsWon = Number(candidate.nights_won);
  const seed = Number(candidate.seed);
  if (!Number.isSafeInteger(score) || score < 0) throw new Error('Điểm không hợp lệ.');
  if (!Number.isSafeInteger(nightsWon) || nightsWon < 0 || nightsWon > 3) throw new Error('nights_won không hợp lệ.');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('seed không hợp lệ.');
  const achievedAt =
    typeof candidate.achieved_at === 'string' && Number.isFinite(Date.parse(candidate.achieved_at))
      ? candidate.achieved_at
      : formatIsoWithTimezone();

  const current = readLeaderboard();
  const entries = sortAndSanitizeEntries([
    ...current.entries,
    { name, score, nights_won: nightsWon, achieved_at: achievedAt, seed }
  ]);
  writeLeaderboard({ entries });
  return { entries };
}

function parseArgs(argv) {
  let exportPath = null;
  let port = Number(process.env.PORT || 4173);
  let host = process.env.HOST || '127.0.0.1';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--export-leaderboard=')) {
      exportPath = arg.slice('--export-leaderboard='.length);
      if (!exportPath) throw new Error('--export-leaderboard requires an output path');
    } else if (arg === '--export-leaderboard') {
      const next = argv[++i];
      if (!next || next.startsWith('--')) throw new Error('--export-leaderboard requires an output path');
      exportPath = next;
    } else if (arg.startsWith('--port=')) {
      port = Number(arg.slice('--port='.length));
    } else if (arg === '--port') {
      const next = argv[++i];
      if (!next || next.startsWith('--')) throw new Error('--port requires a number');
      port = Number(next);
    } else if (arg.startsWith('--host=')) {
      host = arg.slice('--host='.length) || '0.0.0.0';
    } else if (arg === '--host') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        host = next;
        i++;
      } else {
        host = '0.0.0.0';
      }
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid --port');
  }

  return { exportPath, port, host };
}

function findStaticDir() {
  const candidates = [
    resolve(import.meta.dirname, '..', 'dist'),
    resolve(import.meta.dirname, 'web'),
    resolve(process.cwd(), 'dist'),
    resolve(process.cwd(), 'web')
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) return dir;
  }
  return null;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.exportPath) {
    const data = readLeaderboard();
    const outAbs = resolve(opts.exportPath);
    mkdirSync(dirname(outAbs), { recursive: true });
    writeFileSync(outAbs, JSON.stringify({ entries: data.entries }, null, 2) + '\n', 'utf8');
    return;
  }

  const staticDir = findStaticDir();
  if (!staticDir) {
    process.stderr.write('Không tìm thấy bản build web (dist/ hoặc web/). Hãy chạy `npm run build` trước.\n');
    process.exitCode = 1;
    return;
  }

  const server = createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    if (reqUrl.pathname === '/api/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, version: '1.0.0' }));
      return;
    }

    if (reqUrl.pathname === '/api/leaderboard' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(readLeaderboard()));
      return;
    }

    if (reqUrl.pathname === '/api/leaderboard' && req.method === 'POST') {
      let body = '';
      let tooLarge = false;
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 16 * 1024) {
          tooLarge = true;
          req.destroy();
        }
      });
      req.on('end', () => {
        if (tooLarge) {
          res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          return;
        }
        try {
          const parsed = JSON.parse(body || '{}');
          const updated = addEntry(parsed);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(updated));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Invalid JSON' }));
        }
      });
      return;
    }

    const relPath = decodeURIComponent(reqUrl.pathname === '/' ? '/index.html' : reqUrl.pathname).replace(/^\/+/, '');
    let filePath = resolve(staticDir, relPath);
    if (!filePath.startsWith(staticDir) || !existsSync(filePath)) {
      filePath = join(staticDir, 'index.html');
    }
    try {
      const data = readFileSync(filePath);
      const mime = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });

  server.listen(opts.port, opts.host, () => {
    const shownHost = opts.host === '0.0.0.0' ? 'localhost' : opts.host;
    process.stdout.write(`Đảo Đèn Lồng v1.0.0 đang chạy tại http://${shownHost}:${opts.port}\n`);
  });
}

try {
  main();
} catch (err) {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 2;
}
