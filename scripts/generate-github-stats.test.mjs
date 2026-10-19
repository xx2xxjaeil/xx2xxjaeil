import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchStats, parseStats, renderStats } from './generate-github-stats.mjs';

const response = {
  data: {
    viewer: {
      login: 'xx2xxjaeil',
      privateRepositories: { totalCount: 20 },
      publicRepositories: { totalCount: 6 },
      contributionsCollection: {
        contributionCalendar: { totalContributions: 232 },
        totalCommitContributions: 133,
        totalPullRequestContributions: 17,
      },
    },
  },
};

test('parses aggregate statistics without private repository names', () => {
  assert.deepEqual(parseStats(response), {
    totalContributions: 232,
    commits: 133,
    pullRequests: 17,
    privateRepos: 20,
    publicRepos: 6,
  });
});

test('rejects a token from another account or without visible private repositories', () => {
  assert.throws(() => parseStats({ data: { viewer: { login: 'other' } } }), /must belong/);
  const publicOnly = structuredClone(response);
  publicOnly.data.viewer.privateRepositories.totalCount = 0;
  assert.throws(() => parseStats(publicOnly), /No private repositories/);
});

test('renders only aggregate counts and an explicit time window', () => {
  const svg = renderStats(parseStats(response), new Date('2026-10-19T00:00:00Z'));
  assert.match(svg, /LAST 365 DAYS/);
  assert.match(svg, /232/);
  assert.match(svg, /Private repos/);
  assert.match(svg, /2026-10-19/);
  assert.doesNotMatch(svg, /PRIVATE_STATS_TOKEN|Bearer|secret-repo-name/);
});

test('queries GitHub directly with a fixed one-year window', async () => {
  let call;
  const request = async (url, options) => {
    call = { url, options };
    return { ok: true, json: async () => response };
  };
  const stats = await fetchStats('test-token', new Date('2026-10-19T00:00:00Z'), request);
  assert.equal(stats.privateRepos, 20);
  assert.equal(call.url, 'https://api.github.com/graphql');
  assert.equal(call.options.headers.Authorization, 'Bearer test-token');
  const body = JSON.parse(call.options.body);
  assert.equal(body.variables.to, '2026-10-19T00:00:00.000Z');
  assert.equal(body.variables.from, '2025-10-19T00:00:00.000Z');
  assert.doesNotMatch(body.query, /\bname\b|\burl\b/);
});
