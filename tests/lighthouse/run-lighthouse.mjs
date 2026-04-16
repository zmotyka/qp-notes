import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const rootOut = join(process.cwd(), 'tests', 'lighthouse');
const pages = [
  { name: 'login', path: '/' },
  { name: 'main', path: '/' },
  { name: 'settings', path: '/' },
];

const devices = [
  { name: 'laptop', preset: 'desktop', formFactor: 'desktop', width: 1440, height: 900, dpr: 1, mobile: false },
  { name: 'tablet', preset: 'desktop', formFactor: 'desktop', width: 768, height: 1024, dpr: 2, mobile: false },
  { name: 'iphone', preset: 'desktop', formFactor: 'mobile', width: 390, height: 844, dpr: 3, mobile: true },
];

await mkdir(rootOut, { recursive: true });

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

for (const device of devices) {
  const outDir = join(rootOut, device.name);
  await mkdir(outDir, { recursive: true });
  for (const page of pages) {
    const outputPath = join(outDir, `${page.name}`);
    const args = [
      'lighthouse',
      `http://127.0.0.1:5173${page.path}`,
      '--quiet',
      '--chrome-flags="--headless=new --no-sandbox"',
      `--preset=${device.preset}`,
      `--form-factor=${device.formFactor}`,
      `--screenEmulation.width=${device.width}`,
      `--screenEmulation.height=${device.height}`,
      `--screenEmulation.deviceScaleFactor=${device.dpr}`,
      `--screenEmulation.mobile=${device.mobile}`,
      '--only-categories=performance,accessibility,best-practices,seo',
      '--output=json',
      '--output=html',
      `--output-path=${outputPath}`,
    ];
    await run('npx', args);
  }
}

console.log('Lighthouse reports generated under tests/lighthouse');
