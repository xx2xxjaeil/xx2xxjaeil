import assert from 'node:assert/strict';
import test from 'node:test';
import { activateGitHubStats } from './activate-github-stats.mjs';

const publicCard = 'https://github-readme-stats.vercel.app/api?username=xx2xxjaeil&amp;show_icons=true&amp;hide_border=true&amp;theme=github_dark';
const privateCard = './assets/github-stats.svg';

test('switches to the generated card after it exists', () => {
  assert.equal(activateGitHubStats(`<img src="${publicCard}" />`), `<img src="${privateCard}" />`);
});

test('is idempotent', () => {
  const readme = `<img src="${privateCard}" />`;
  assert.equal(activateGitHubStats(readme), readme);
});

test('does not mistake a text mention for an active image', () => {
  const readme = `Generated file: ${privateCard}\n<img src="${publicCard}" />`;
  assert.equal(activateGitHubStats(readme), `Generated file: ${privateCard}\n<img src="${privateCard}" />`);
});

test('fails if the expected card has changed', () => {
  assert.throws(() => activateGitHubStats('<img src="other.svg" />'), /was not found/);
});
