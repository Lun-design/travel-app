import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'public', 'sw.js');
const outputPath = path.join(root, 'dist', 'sw.js');
const deploymentVersion = process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.GIT_COMMIT_SHA
  || `local-${Date.now()}`;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  }));
  return nested.flat();
}

const source = await readFile(sourcePath, 'utf8');
const distFiles = await listFiles(path.join(root, 'dist'));
const precachedFiles = distFiles
  .filter((file) => path.basename(file) !== 'sw.js')
  .filter((file) => /\.(?:html|js|css|png|jpe?g|gif|svg|webp|woff2?|ttf|json|ico|pdf)$/i.test(file))
  .map((file) => `/${path.relative(path.join(root, 'dist'), file).split(path.sep).join('/')}`);
const safeVersion = deploymentVersion.replace(/[^a-zA-Z0-9._-]/g, '-');
const serviceWorker = source
  .replace(/__BUILD_VERSION__/g, safeVersion)
  .replace('/* __PRECACHE_MANIFEST__ */', `BUILD_PRECACHED_URLS.push(...${JSON.stringify(precachedFiles)});`);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, serviceWorker, 'utf8');

const iosHeadTags = {
  manifest: '<link rel="manifest" href="/manifest.json" />',
  capable: '<meta name="apple-mobile-web-app-capable" content="yes" />',
  statusBar: '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  title: '<meta name="apple-mobile-web-app-title" content="大白小白gogogo" />',
  icon: '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
};

function upsertHeadTag(html, pattern, tag) {
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace('</head>', `  ${tag}\n</head>`);
}

// Expo's single static export may not carry every custom +html.tsx head node
// into dist/index.html. Ensure iOS receives the install metadata in the
// actual document shipped to Vercel, while keeping the operation idempotent.
for (const htmlPath of distFiles.filter((file) => file.toLowerCase().endsWith('.html'))) {
  let html = await readFile(htmlPath, 'utf8');
  html = upsertHeadTag(html, /<link\s+rel=["']manifest["'][^>]*>/i, iosHeadTags.manifest);
  html = upsertHeadTag(html, /<meta\s+name=["']apple-mobile-web-app-capable["'][^>]*>/i, iosHeadTags.capable);
  html = upsertHeadTag(html, /<meta\s+name=["']apple-mobile-web-app-status-bar-style["'][^>]*>/i, iosHeadTags.statusBar);
  html = upsertHeadTag(html, /<meta\s+name=["']apple-mobile-web-app-title["'][^>]*>/i, iosHeadTags.title);
  html = upsertHeadTag(html, /<link\s+rel=["']apple-touch-icon["'][^>]*>/i, iosHeadTags.icon);
  await writeFile(htmlPath, html, 'utf8');
}
console.log(`[PWA] Generated ${path.relative(root, outputPath)} (${deploymentVersion})`);
