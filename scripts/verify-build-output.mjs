import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');

function fail(message) {
  console.error(`[BuildVerify] ${message}`);
  process.exitCode = 1;
}

function readRequired(relativePath) {
  const filePath = path.join(dist, relativePath);
  if (!existsSync(filePath)) {
    fail(`missing dist/${relativePath}`);
    return null;
  }
  return { filePath, bytes: readFileSync(filePath) };
}

const htmlFile = readRequired('index.html');
if (htmlFile) {
  const html = htmlFile.bytes.toString('utf8');
  const requiredTags = [
    '<link rel="manifest" href="/manifest.json" />',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    '<meta name="apple-mobile-web-app-title" content="大白小白gogogo" />',
  ];
  for (const tag of requiredTags) {
    if (!html.includes(tag)) fail(`dist/index.html is missing ${tag}`);
  }
}

const iconFile = readRequired('apple-touch-icon.png');
if (iconFile) {
  const png = iconFile.bytes;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!png.subarray(0, 8).equals(signature)) fail('dist/apple-touch-icon.png is not a PNG');
  if (png.length < 24 || png.readUInt32BE(16) !== 180 || png.readUInt32BE(20) !== 180) {
    fail('dist/apple-touch-icon.png must be 180x180');
  }
}

const manifestFile = readRequired('manifest.json');
if (manifestFile) {
  try {
    const manifest = JSON.parse(manifestFile.bytes.toString('utf8'));
    if (manifest.start_url !== '/') fail('dist/manifest.json must use start_url "/"');
    if (manifest.display !== 'standalone') fail('dist/manifest.json must use display "standalone"');
    const sizes = new Set((manifest.icons ?? []).map((icon) => icon.sizes));
    for (const size of ['192x192', '512x512']) {
      if (!sizes.has(size)) fail(`dist/manifest.json is missing a ${size} icon`);
    }
  } catch (error) {
    fail(`dist/manifest.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log('[BuildVerify] dist PWA output verified');
