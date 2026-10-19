import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCOUNT = 'xx2xxjaeil';
const OUTPUT_PATH = fileURLToPath(new URL('../assets/github-stats.svg', import.meta.url));
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Query only aggregate counts; private repository names and source never leave GitHub.
const REPOSITORIES_QUERY = `query($cursor: String) {
  viewer {
    login
    createdAt
    followers { totalCount }
    pullRequests(first: 1) { totalCount }
    openIssues: issues(states: OPEN, first: 1) { totalCount }
    closedIssues: issues(states: CLOSED, first: 1) { totalCount }
    reviews: contributionsCollection { totalPullRequestReviewContributions }
    repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) { totalCount }
    privateRepositories: repositories(ownerAffiliations: OWNER, privacy: PRIVATE, first: 1) { totalCount }
    repositories(ownerAffiliations: OWNER, first: 100, after: $cursor) {
      totalCount
      nodes { stargazerCount }
      pageInfo { endCursor hasNextPage }
    }
  }
}`;

const CONTRIBUTIONS_QUERY = `query($from: DateTime!, $to: DateTime!) {
  viewer {
    login
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
    }
  }
}`;

function count(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`GitHub returned an invalid ${field} count`);
  }
  return value;
}

export function yearlyWindows(createdAt, now) {
  const start = new Date(createdAt).getTime();
  const end = now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new Error('Invalid GitHub account date range');
  }

  const windows = [];
  for (let from = start; from <= end;) {
    const to = Math.min(from + YEAR_MS - 1, end);
    windows.push({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
    if (to === end) break;
    from = to + 1;
  }
  return windows;
}

export function parseRepositoryPage(viewer) {
  const repositories = viewer?.repositories;
  const pageInfo = repositories?.pageInfo;
  if (!repositories || !Array.isArray(repositories.nodes) || !pageInfo) {
    throw new Error('GitHub returned an incomplete repository page');
  }
  if (pageInfo.hasNextPage && !pageInfo.endCursor) {
    throw new Error('GitHub omitted a repository page cursor');
  }
  return {
    createdAt: viewer.createdAt,
    followers: count(viewer.followers?.totalCount, 'followers'),
    pullRequests: count(viewer.pullRequests?.totalCount, 'pull requests'),
    issues: count(viewer.openIssues?.totalCount, 'open issues') + count(viewer.closedIssues?.totalCount, 'closed issues'),
    reviews: count(viewer.reviews?.totalPullRequestReviewContributions, 'reviews'),
    contributedTo: count(viewer.repositoriesContributedTo?.totalCount, 'contributed repositories'),
    privateRepos: count(viewer.privateRepositories?.totalCount, 'private repositories'),
    repositoryCount: count(repositories.totalCount, 'repositories'),
    pageSize: repositories.nodes.length,
    stars: repositories.nodes.reduce((sum, repo) => sum + count(repo?.stargazerCount, 'stars'), 0),
    nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
  };
}

export function parseContributions(viewer) {
  const collection = viewer?.contributionsCollection;
  return count(collection?.totalCommitContributions, 'commits');
}

// Matches the published GitHub Readme Stats rank formula while keeping the token in this repository's workflow.
export function calculateRank({ commits, pullRequests, issues, reviews, stars, followers }) {
  const exponential = (value) => 1 - 2 ** -value;
  const logNormal = (value) => value / (1 + value);
  const score = (
    2 * exponential(commits / 1000) +
    3 * exponential(pullRequests / 50) +
    exponential(issues / 25) +
    exponential(reviews / 2) +
    4 * logNormal(stars / 50) +
    logNormal(followers / 10)
  ) / 12;
  const percentile = (1 - score) * 100;
  const thresholds = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
  const levels = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'];
  return { level: levels[thresholds.findIndex((value) => percentile <= value)], percentile };
}

async function queryGitHub(token, query, variables, request) {
  const response = await request('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'xx2xxjaeil-profile-stats',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`GitHub GraphQL API returned HTTP ${response.status}`);

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`GitHub GraphQL query failed: ${payload.errors.map((error) => error.message).join('; ')}`);
  }
  const viewer = payload.data?.viewer;
  if (viewer?.login?.toLowerCase() !== ACCOUNT) {
    throw new Error(`PRIVATE_STATS_TOKEN must belong to ${ACCOUNT}`);
  }
  return viewer;
}

export async function fetchStats(token, now = new Date(), request = fetch) {
  if (!token) throw new Error('GITHUB_STATS_TOKEN is required');

  let cursor = null;
  let account;
  let stars = 0;
  let seenRepos = 0;
  const seenCursors = new Set();
  do {
    const viewer = await queryGitHub(token, REPOSITORIES_QUERY, { cursor }, request);
    const page = parseRepositoryPage(viewer);
    account ??= page;
    stars += page.stars;
    seenRepos += page.pageSize;
    cursor = page.nextCursor;
    if (cursor && seenCursors.has(cursor)) throw new Error('GitHub repository pagination did not advance');
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  if (seenRepos !== account.repositoryCount) throw new Error('GitHub repository pagination was incomplete');

  // This account has private repositories. Fail rather than silently publishing a public-only card.
  if (account.privateRepos === 0) throw new Error('No private repositories are visible to PRIVATE_STATS_TOKEN');

  const totals = {
    stars,
    commits: 0,
    pullRequests: account.pullRequests,
    issues: account.issues,
    reviews: account.reviews,
    followers: account.followers,
    contributedTo: account.contributedTo,
    privateRepos: account.privateRepos,
  };
  for (const window of yearlyWindows(account.createdAt, now)) {
    const viewer = await queryGitHub(token, CONTRIBUTIONS_QUERY, window, request);
    totals.commits += parseContributions(viewer);
  }
  totals.rank = calculateRank(totals);
  return totals;
}

export function renderStats(stats, updatedAt) {
  const format = (value) => value.toLocaleString('en-US');
  const circumference = 2 * Math.PI * 40;
  const progress = circumference * (1 - stats.rank.percentile / 100);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="195" viewBox="0 0 500 195" role="img" aria-labelledby="title description">
  <title id="title">Jaeil's GitHub Stats</title>
  <desc id="description">All-time statistics with accessible private activity, updated ${updatedAt.toISOString().slice(0, 10)}: ${format(stats.stars)} stars, ${format(stats.commits)} commits, ${format(stats.pullRequests)} pull requests, ${format(stats.issues)} issues, ${format(stats.contributedTo)} recently contributed repositories. Rank ${stats.rank.level}.</desc>
  <rect width="500" height="195" rx="5" fill="#ffffff" />
  <g font-family="Segoe UI, Ubuntu, Helvetica Neue, sans-serif">
    <text x="25" y="31" fill="#7957d5" font-size="19" font-weight="700">Jaeil's GitHub Stats</text>
    <g fill="none" stroke="#ff3860" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="m25 48 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7Z" />
      <path d="M18 82h4m6 0h4m-10 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" />
      <circle cx="21" cy="107" r="2.5" /><circle cx="30" cy="117" r="2.5" /><path d="M21 109.5v14a3 3 0 0 0 3 3h3a3 3 0 0 0 3-3v-4" />
      <circle cx="25" cy="135" r="7" /><path d="M25 132v4m0 2h.01" />
      <rect x="19" y="151" width="12" height="12" rx="2" /><path d="M22 154h6m-6 3h6" />
    </g>
    <g fill="#363636" font-size="14" font-weight="600">
      <text x="45" y="59">Total Stars Earned:</text>
      <text x="45" y="85">Total Commits:</text>
      <text x="45" y="111">Total PRs:</text>
      <text x="45" y="137">Total Issues:</text>
      <text x="45" y="163">Contributed to (last year):</text>
    </g>
    <g fill="#363636" font-size="14" font-weight="700" text-anchor="end">
      <text x="300" y="59">${format(stats.stars)}</text>
      <text x="300" y="85">${format(stats.commits)}</text>
      <text x="300" y="111">${format(stats.pullRequests)}</text>
      <text x="300" y="137">${format(stats.issues)}</text>
      <text x="300" y="163">${format(stats.contributedTo)}</text>
    </g>
    <circle cx="410" cy="104" r="40" fill="none" stroke="#7957d5" stroke-width="6" opacity="0.2" />
    <circle cx="410" cy="104" r="40" fill="none" stroke="#7957d5" stroke-width="6" stroke-linecap="round" stroke-dasharray="${progress.toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 410 104)" />
    <text x="410" y="113" text-anchor="middle" fill="#363636" font-size="26" font-weight="800">${stats.rank.level}</text>
  </g>
</svg>\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const now = new Date();
  const stats = await fetchStats(process.env.GITHUB_STATS_TOKEN, now);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, renderStats(stats, now));
  process.stdout.write('Updated assets/github-stats.svg\n');
}
