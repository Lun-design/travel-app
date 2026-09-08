import { rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputDirectories = ['dist', '.expo'];

await Promise.all(outputDirectories.map(async (directory) => {
  const target = path.resolve(root, directory);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Refusing to clean outside project root: ${target}`);
  await rm(target, { recursive: true, force: true });
}));

console.log(`[Build] Cleared ${outputDirectories.join(' and ')}`);
