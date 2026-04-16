import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
await copyFile(join(dist, 'index.html'), join(dist, '404.html'));
console.log('Prepared GitHub Pages fallback: dist/404.html');
