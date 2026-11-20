import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, release, tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm'
};

function parseArgs(argv) {
  const allowed = ['seed', 'duration', 'out', 'browser'];
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.startsWith('--') ? argv[i].slice(2) : '';
    if (!allowed.includes(key) || flags.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error(`Invalid, duplicate, or missing flag: ${argv[i] ?? ''}`);
    }
    flags.set(key, argv[i + 1]);
  }
  const seedRaw = flags.get('seed') ?? '42';
  if (!/^\d+$/.test(seedRaw)) throw new Error('--seed requires an integer');
  const seed = Number(seedRaw);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('--seed out of range');

  const durRaw = flags.get('duration') ?? '30';
  const duration = Number(durRaw);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) {
    throw new Error('--duration must be a positive number <= 3600');
  }

  return {
    seed,
    duration,
    out: flags.get('out') ?? null,
    browser: flags.get('browser') ?? null
  };
}

function findChrome(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  for (const cmd of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      const resolved = execFileSync('which', [cmd], { encoding: 'utf8' }).trim();
      if (resolved && existsSync(resolved)) return resolved;
    } catch {
      // ignore missing binary
    }
  }
  throw new Error('Chrome/Chromium not found. Pass --browser <path> or set CHROME_PATH.');
}

function detectOsString() {
  try {
    if (platform() === 'darwin') {
      const prod = execFileSync('sw_vers', ['-productName'], { encoding: 'utf8' }).trim();
      const ver = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim();
      return `${prod} ${ver} (${arch()})`;
    }
    if (platform() === 'linux' && existsSync('/etc/os-release')) {
      const raw = readFileSync('/etc/os-release', 'utf8');
      const m = raw.match(/^PRETTY_NAME="([^"]+)"/m);
      if (m) return `${m[1]} (${arch()})`;
    }
  } catch {
    // fallback below
  }
  return `${platform()} ${release()} (${arch()})`;
}

function readProcessTreeRssKb(rootPid) {
  try {
    const out = execFileSync('ps', ['-eo', 'pid=,ppid=,rss='], { encoding: 'utf8' });
    const rows = [];
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length !== 3) continue;
      const pid = Number(parts[0]);
      const ppid = Number(parts[1]);
      const rss = Number(parts[2]);
      if (Number.isFinite(pid) && Number.isFinite(ppid) && Number.isFinite(rss)) {
        rows.push({ pid, ppid, rss });
      }
    }
    const group = new Set([rootPid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of rows) {
        if (group.has(r.ppid) && !group.has(r.pid)) {
          group.add(r.pid);
          changed = true;
        }
      }
    }
    let totalKb = 0;
    for (const r of rows) {
      if (group.has(r.pid)) totalKb += r.rss;
    }
    return totalKb > 0 ? totalKb : null;
  } catch {
    return null;
  }
}

async function main() {
  const procStart = performance.now();
  const opts = parseArgs(process.argv.slice(2));
  const distDir = resolve(import.meta.dirname, '..', 'dist');
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error('dist/ not found. Run `npm run build` first.');
  }

  const chromeBin = findChrome(opts.browser);
  const profileDir = mkdtempSync(join(tmpdir(), 'ddl-bench-profile-'));

  let loadMs = null;
  let resolveResult;
  let rejectResult;
  const resultPromise = new Promise((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });

  const server = createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    if (reqUrl.pathname === '/__bench_first_frame' && req.method === 'POST') {
      if (loadMs === null) {
        loadMs = Math.round(performance.now() - procStart);
      }
      res.writeHead(204);
      res.end();
      return;
    }
    if (reqUrl.pathname === '/__bench_result' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        res.writeHead(204);
        res.end();
        try {
          resolveResult(JSON.parse(body));
        } catch (err) {
          rejectResult(err);
        }
      });
      return;
    }

    const rel = decodeURIComponent(reqUrl.pathname === '/' ? '/index.html' : reqUrl.pathname).replace(/^\/+/, '');
    let filePath = resolve(distDir, rel);
    if (!filePath.startsWith(distDir) || !existsSync(filePath)) {
      filePath = join(distDir, 'index.html');
    }
    const mime = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(readFileSync(filePath));
  });

  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const url = `http://127.0.0.1:${port}/?bench=1&seed=${opts.seed}&duration=${opts.duration}`;

  const chromeArgs = [
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-frame-rate-limit',
    '--disable-gpu-vsync',
    '--window-size=1280,720',
    '--window-position=80,60',
    '--autoplay-policy=no-user-gesture-required'
  ];

  if (platform() === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    chromeArgs.push('--headless=new', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist');
  }
  chromeArgs.push(`--app=${url}`);

  let chrome = null;
  let rssTimer = null;
  let timeoutTimer = null;
  let peakRssKb = null;

  try {
    chrome = spawn(chromeBin, chromeArgs, { stdio: 'ignore' });
    chrome.once('error', (err) => rejectResult(err));
    chrome.once('exit', (code) => {
      if (code !== null && code !== 0) {
        rejectResult(new Error(`Chrome exited unexpectedly with code ${code}`));
      }
    });

    const sampleRss = () => {
      if (!chrome?.pid) return;
      const kb = readProcessTreeRssKb(chrome.pid);
      if (kb !== null && (peakRssKb === null || kb > peakRssKb)) {
        peakRssKb = kb;
      }
    };
    sampleRss();
    rssTimer = setInterval(sampleRss, 500);

    const timeoutMs = (opts.duration + 45) * 1000;
    timeoutTimer = setTimeout(() => {
      rejectResult(new Error(`Benchmark timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    const metrics = await resultPromise;
    sampleRss();

    const avgFps = Number(metrics.avg_fps);
    const report = {
      contract_version: '1.3',
      avg_fps: avgFps,
      p1_low_fps: Number(metrics.p1_low_fps),
      frame_ms_p95: Number(metrics.frame_ms_p95),
      frames: Number(metrics.frames),
      load_ms: loadMs ?? Math.round(performance.now() - procStart),
      peak_mem_mb: peakRssKb === null ? null : Math.round((peakRssKb / 1024) * 10) / 10,
      vsync_off: true,
      renderer: String(metrics.renderer || 'Three.js / WebGL'),
      os: detectOsString()
    };

    const json = JSON.stringify(report, null, 2) + '\n';
    if (opts.out) {
      mkdirSync(dirname(resolve(opts.out)), { recursive: true });
      writeFileSync(resolve(opts.out), json, 'utf8');
    } else {
      process.stdout.write(json);
    }
  } finally {
    if (rssTimer) clearInterval(rssTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (chrome && chrome.exitCode === null) {
      chrome.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
      if (chrome.exitCode === null) chrome.kill('SIGKILL');
    }
    await new Promise((r) => server.close(r));
    rmSync(profileDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 2;
});
