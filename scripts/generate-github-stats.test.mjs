import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateRank, fetchStats, renderStats, yearlyWindows } from './generate-github-stats.mjs';

const NOW = new Date('2022-07-01T00:00:00Z');

function accountPage({ login = 'xx2xxjaeil', privateRepos = 20, stars = [2, 1], totalCount = stars.length, nextCursor = null } = {}) {
  return {
    data: {
      viewer: {
        login,
        createdAt: '2020-06-27T16:29:29Z',
        followers: { totalCount: 2 },
        pullRequests: { totalCount: 5 },
        openIssues: { totalCount: 1 },
        closedIssues: { totalCount: 1 },
        reviews: { totalPullRequestReviewContributions: 1 },
        repositoriesContributedTo: { totalCount: 4 },
        privateRepositories: { totalCount: privateRepos },
        repositories: {
          totalCount,
          nodes: stars.map((stargazerCount) => ({ stargazerCount })),
          pageInfo: { hasNextPage: nextCursor !== null, endCursor: nextCursor },
        },
      },
    },
  };
}

function contributionPage(commits) {
  return {
    data: {
      viewer: {
        login: 'xx2xxjaeil',
        contributionsCollection: {
          totalCommitContributions: commits,
        },
      },
    },
  };
}

function mockRequests(pages) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => pages[calls.length - 1] };
  };
  return { calls, request };
}

test('covers the full account lifetime in non-overlapping one-year windows', () => {
  const windows = yearlyWindows('2020-06-27T16:29:29Z', NOW);
  assert.equal(windows.length, 3);
  assert.equal(windows[0].from, '2020-06-27T16:29:29.000Z');
  assert.equal(windows.at(-1).to, NOW.toISOString());
  for (let index = 0; index < windows.length; index += 1) {
    assert.ok(Date.parse(windows[index].to) - Date.parse(windows[index].from) < 365 * 86400000);
    if (index > 0) assert.equal(Date.parse(windows[index - 1].to) + 1, Date.parse(windows[index].from));
  }
});

test('sums all-time contributions and stars without requesting private repository names', async () => {
  const { calls, request } = mockRequests([
    accountPage(),
    contributionPage(1),
    contributionPage(3),
    contributionPage(2),
  ]);
  const stats = await fetchStats('test-token', NOW, request);
  assert.equal(stats.stars, 3);
  assert.equal(stats.commits, 6);
  assert.equal(stats.pullRequests, 5);
  assert.equal(stats.issues, 2);
  assert.equal(stats.contributedTo, 4);
  assert.equal(stats.privateRepos, 20);
  assert.deepEqual(stats.rank, calculateRank(stats));
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ url }) => url === 'https://api.github.com/graphql'));
  assert.ok(calls.every(({ options }) => options.headers.Authorization === 'Bearer test-token'));
  assert.ok(calls.every(({ options }) => !/\bname\b|\burl\b|\bcontent\b/.test(JSON.parse(options.body).query)));
});

test('paginates repositories so stars are not undercounted', async () => {
  const { request } = mockRequests([
    accountPage({ stars: [2], totalCount: 2, nextCursor: 'page-2' }),
    accountPage({ stars: [5], totalCount: 2 }),
    contributionPage(1),
    contributionPage(0),
    contributionPage(0),
  ]);
  const stats = await fetchStats('test-token', NOW, request);
  assert.equal(stats.stars, 7);
});

test('rejects a token from another account or without private repository access', async () => {
  const other = mockRequests([accountPage({ login: 'other' })]);
  await assert.rejects(fetchStats('test-token', NOW, other.request), /must belong/);
  const publicOnly = mockRequests([accountPage({ privateRepos: 0 })]);
  await assert.rejects(fetchStats('test-token', NOW, publicOnly.request), /No private repositories/);
});

test('computes a real rank from the published formula', () => {
  assert.equal(calculateRank({ stars: 0, commits: 0, pullRequests: 0, issues: 0, reviews: 0, followers: 0 }).level, 'C');
  assert.equal(calculateRank({ stars: 100000, commits: 100000, pullRequests: 100000, issues: 100000, reviews: 100000, followers: 100000 }).level, 'S');
});

test('renders the buefy layout with a calculated rank and all-time commits', () => {
  const stats = { stars: 3, commits: 1234, pullRequests: 17, issues: 2, contributedTo: 4, privateRepos: 20, reviews: 1, followers: 2 };
  stats.rank = calculateRank(stats);
  const svg = renderStats(stats, new Date('2026-10-19T00:00:00Z'));
  assert.match(svg, /#ffffff/);
  assert.match(svg, /#7957d5/);
  assert.match(svg, /#ff3860/);
  assert.match(svg, /Total Stars Earned:/);
  assert.match(svg, /Total Commits:/);
  assert.match(svg, /Contributed to \(last year\):/);
  assert.ok(svg.includes(`>${stats.rank.level}</text>`));
  assert.match(svg, /1,234/);
  assert.doesNotMatch(svg, /ALL TIME|PRIVATE_STATS_TOKEN|Bearer/);
});
