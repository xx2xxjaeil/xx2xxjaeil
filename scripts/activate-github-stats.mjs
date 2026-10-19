import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const README_PATH = fileURLToPath(new URL('../README.md', import.meta.url));
const CARD_PATH = fileURLToPath(new URL('../assets/github-stats.svg', import.meta.url));
const PUBLIC_CARD = 'src="https://github-readme-stats.vercel.app/api?username=xx2xxjaeil&amp;show_icons=true&amp;hide_border=true&amp;theme=github_dark"';
const PRIVATE_CARD = 'src="./assets/github-stats.svg"';

export function activateGitHubStats(readme) {
  if (readme.includes(PRIVATE_CARD)) return readme;
  if (!readme.includes(PUBLIC_CARD)) throw new Error('GitHub Stats image URL was not found in README.md');
  return readme.replace(PUBLIC_CARD, PRIVATE_CARD);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(CARD_PATH)) throw new Error('Generate assets/github-stats.svg before activating it');
  const readme = readFileSync(README_PATH, 'utf8');
  const updated = activateGitHubStats(readme);
  if (updated !== readme) writeFileSync(README_PATH, updated);
}
