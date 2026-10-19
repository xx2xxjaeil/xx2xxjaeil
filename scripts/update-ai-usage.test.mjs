import assert from 'node:assert/strict';
import test from 'node:test';
import { combineSummaries, parseEcbRates, renderSvg, summarizeDaily } from './update-ai-usage.mjs';

const claudeRows = [{
  date: '2026-10-18', inputTokens: 20, outputTokens: 10,
  cacheReadTokens: 60, cacheCreationTokens: 10, totalTokens: 100,
  totalCost: 2.5, projectPath: '/private/path',
  modelBreakdowns: [{ modelName: 'claude-test', inputTokens: 20, outputTokens: 10, cacheReadTokens: 60, cacheCreationTokens: 10 }],
}];

const codexRows = [
  { date: '2026-10-18', inputTokens: 50, outputTokens: 20, cacheReadTokens: 230, cacheCreationTokens: 0, totalTokens: 300, costUSD: 3, models: { 'gpt-<unsafe>': { totalTokens: 300 } } },
  { date: '2026-10-19', inputTokens: 20, outputTokens: 10, cacheReadTokens: 70, cacheCreationTokens: 0, totalTokens: 100, costUSD: 1, models: { 'gpt-<unsafe>': { totalTokens: 100 } } },
];

test('aggregates both report shapes without retaining private metadata', () => {
  const claude = summarizeDaily(claudeRows, 'claude');
  const codex = summarizeDaily(codexRows, 'codex');
  assert.equal(claude.totals.tokens, 100);
  assert.equal(claude.totals.cost, 2.5);
  assert.equal(codex.totals.tokens, 400);
  assert.equal(codex.totals.cost, 4);
  assert.equal(JSON.stringify(claude).includes('/private/path'), false);
});

test('combines overlapping days once and ranks models by token volume', () => {
  const combined = combineSummaries([
    summarizeDaily(claudeRows, 'claude'),
    summarizeDaily(codexRows, 'codex'),
  ]);
  assert.equal(combined.totals.tokens, 500);
  assert.equal(combined.totals.cost, 6.5);
  assert.equal(combined.activeDays, 2);
  assert.equal(combined.peakDayCost, 5.5);
  assert.equal(combined.averageCost, 3.25);
  assert.equal(combined.topModel, 'gpt-<unsafe>');
});

test('parses the required ECB reference rates', () => {
  const xml = "<Cube time='2026-10-16'><Cube currency='USD' rate='1.1253'/><Cube currency='KRW' rate='1499.01'/><Cube currency='CNY' rate='7.5240'/></Cube>";
  assert.deepEqual(parseEcbRates(xml), {
    date: '2026-10-16', rates: { USD: 1.1253, KRW: 1499.01, CNY: 7.524 },
  });
  assert.throws(() => parseEcbRates("<Cube time='2026-10-16'/>"));
});

test('renders four panels and escapes dynamic model names', () => {
  const summaries = [summarizeDaily(claudeRows, 'claude'), summarizeDaily(codexRows, 'codex')];
  const svg = renderSvg({
    updatedAt: '2026-10-19', summaries, combined: combineSummaries(summaries),
    fx: { date: '2026-10-16', rates: { USD: 1.1253, KRW: 1499.01, CNY: 7.524 } },
  });
  assert.match(svg, /LOCAL HISTORY/);
  assert.match(svg, /EST\. COST/);
  assert.match(svg, /TOKEN MIX/);
  assert.match(svg, /ACTIVITY/);
  assert.match(svg, /gpt-&lt;unsafe&gt;/);
  assert.doesNotMatch(svg, /\/private\/path/);
});

test('empty histories render without dividing by zero', () => {
  const summaries = [summarizeDaily([], 'claude'), summarizeDaily([], 'codex')];
  const combined = combineSummaries(summaries);
  assert.equal(combined.activeDays, 0);
  assert.equal(combined.averageCost, 0);
  assert.doesNotThrow(() => renderSvg({ updatedAt: '2026-10-19', summaries, combined, fx: null }));
});
