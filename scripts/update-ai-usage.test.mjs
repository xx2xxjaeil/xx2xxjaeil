import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSvg, summarizeDaily } from './update-ai-usage.mjs';

test('only aggregates dates in the requested window', () => {
  const dates = ['2026-10-18', '2026-10-19'];
  const summary = summarizeDaily([
    { date: '2026-10-17', inputTokens: 999, outputTokens: 999, totalTokens: 1998 },
    { date: '2026-10-18', inputTokens: 12, outputTokens: 3, totalTokens: 30 },
    { date: '2026-10-19', inputTokens: 7, outputTokens: 2, totalTokens: 9 },
  ], dates);
  assert.deepEqual(summary, { activeDays: 2, input: 19, output: 5, activity: [30, 9] });
});

test('invalid token counts are treated as zero', () => {
  const summary = summarizeDaily([
    { date: '2026-10-19', inputTokens: -1, outputTokens: '5', totalTokens: null },
  ], ['2026-10-19']);
  assert.deepEqual(summary, { activeDays: 0, input: 0, output: 0, activity: [0] });
});

test('SVG contains summaries but not raw report metadata', () => {
  const dates = ['2026-10-18', '2026-10-19'];
  const claude = summarizeDaily([{ date: '2026-10-19', inputTokens: 10, outputTokens: 2, totalTokens: 12, projectName: 'private-project' }], dates);
  const codex = summarizeDaily([], dates);
  const svg = renderSvg({ today: dates[1], dates, summaries: [claude, codex] });
  assert.match(svg, /Claude Code/);
  assert.match(svg, /Codex/);
  assert.match(svg, /10 input/);
  assert.match(svg, /No local data/);
  assert.doesNotMatch(svg, /private-project/);
});
