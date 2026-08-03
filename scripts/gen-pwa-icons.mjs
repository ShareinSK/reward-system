/**
 * Regenerate PWA icons from src/lib/assets/logo-app.png
 * Run: npm run icons
 * Requires macOS `sips` (or replace with sharp/imagemagick).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src/lib/assets/logo-app.png');
const out = join(root, 'static/pwa');
mkdirSync(out, { recursive: true });

for (const [name, size] of [
	['icon-512.png', 512],
	['icon-192.png', 192],
	['apple-touch-icon.png', 180]
]) {
	execFileSync('sips', ['-z', String(size), String(size), src, '--out', join(out, name)]);
	console.log('Wrote', name);
}
