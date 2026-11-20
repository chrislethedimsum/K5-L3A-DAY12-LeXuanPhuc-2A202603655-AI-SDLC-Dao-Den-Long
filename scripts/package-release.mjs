import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const distDir = join(root, 'dist');
const runScript = join(root, 'scripts', 'run.mjs');

if (!existsSync(join(distDir, 'index.html'))) {
  throw new Error('dist/ not found. Run `npm run build` first.');
}

const releaseRoot = join(root, 'release');
const stageDir = join(releaseRoot, 'dao-den-long-v1.0.0');
const archivePath = join(releaseRoot, 'dao-den-long-v1.0.0-web.tar.gz');

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

cpSync(distDir, join(stageDir, 'web'), { recursive: true });
cpSync(runScript, join(stageDir, 'run.mjs'));
writeFileSync(
  join(stageDir, 'package.json'),
  JSON.stringify(
    {
      name: 'dao-den-long-release',
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: { start: 'node run.mjs' }
    },
    null,
    2
  ) + '\n',
  'utf8'
);
writeFileSync(
  join(stageDir, 'README-RELEASE.txt'),
  [
    'Đảo Đèn Lồng — v1.0.0 (Bản phát hành tĩnh kèm máy chủ cục bộ)',
    'Yêu cầu: Node.js 22+',
    '',
    'Chạy game:',
    '  node run.mjs',
    'Sau đó mở trình duyệt tại http://localhost:4173',
    '',
    'Xuất bảng xếp hạng ra JSON:',
    '  node run.mjs --export-leaderboard out.json',
    ''
  ].join('\n'),
  'utf8'
);

execFileSync('tar', ['-czf', archivePath, '-C', releaseRoot, 'dao-den-long-v1.0.0']);
const bytes = statSync(archivePath).size;
console.log(`Packaged ${archivePath} (${(bytes / 1024).toFixed(1)} KB)`);
