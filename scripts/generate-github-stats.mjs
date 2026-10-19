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
      totalPullRequestContributions
      totalIssueContributions
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
    privateRepos: count(viewer.privateRepositories?.totalCount, 'private repositories'),
    repositoryCount: count(repositories.totalCount, 'repositories'),
    pageSize: repositories.nodes.length,
    stars: repositories.nodes.reduce((sum, repo) => sum + count(repo?.stargazerCount, 'stars'), 0),
    nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
  };
}

export function parseContributions(viewer) {
  const collection = viewer?.contributionsCollection;
  return {
    commits: count(collection?.totalCommitContributions, 'commits'),
    pullRequests: count(collection?.totalPullRequestContributions, 'pull requests'),
    issues: count(collection?.totalIssueContributions, 'issues'),
  };
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
    pullRequests: 0,
    issues: 0,
    privateRepos: account.privateRepos,
    joinedYear: new Date(account.createdAt).getUTCFullYear(),
  };
  for (const window of yearlyWindows(account.createdAt, now)) {
    const viewer = await queryGitHub(token, CONTRIBUTIONS_QUERY, window, request);
    const period = parseContributions(viewer);
    totals.commits += period.commits;
    totals.pullRequests += period.pullRequests;
    totals.issues += period.issues;
  }
  return totals;
}

export function renderStats(stats, updatedAt) {
  const format = (value) => value.toLocaleString('en-US');
  const date = updatedAt.toISOString().slice(0, 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="215" viewBox="0 0 500 215" role="img" aria-labelledby="title description">
  <title id="title">${ACCOUNT}'s GitHub Stats</title>
  <desc id="description">All-time GitHub contribution statistics, including accessible private activity: ${format(stats.stars)} stars, ${format(stats.commits)} commits, ${format(stats.pullRequests)} pull requests, ${format(stats.issues)} issues, ${format(stats.privateRepos)} owned private repositories.</desc>
  <rect width="500" height="215" rx="5" fill="#0D1117" />
  <g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
    <text x="25" y="34" fill="#58A6FF" font-size="19" font-weight="700">${ACCOUNT}'s GitHub Stats</text>
    <g fill="none" stroke="#1F6FEB" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="m25 59 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7Z" />
      <path d="M18 94h4m6 0h4m-10 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" />
      <circle cx="21" cy="119" r="2.5" /><circle cx="30" cy="129" r="2.5" /><path d="M21 121.5v14a3 3 0 0 0 3 3h3a3 3 0 0 0 3-3v-4" />
      <circle cx="25" cy="156" r="7" /><path d="M25 153v4m0 2h.01" />
      <rect x="19" y="182" width="12" height="12" rx="2" /><path d="M22 185h6m-6 3h6" />
    </g>
    <g fill="#C3D1D9" font-size="13.5">
      <text x="44" y="69">Total Stars Earned:</text>
      <text x="44" y="99">Total Commits:</text>
      <text x="44" y="129">Total PRs:</text>
      <text x="44" y="159">Total Issues:</text>
      <text x="44" y="189">Private Repositories:</text>
    </g>
    <g fill="#C3D1D9" font-size="13.5" font-weight="700" text-anchor="end">
      <text x="270" y="69">${format(stats.stars)}</text>
      <text x="270" y="99">${format(stats.commits)}</text>
      <text x="270" y="129">${format(stats.pullRequests)}</text>
      <text x="270" y="159">${format(stats.issues)}</text>
      <text x="270" y="189">${format(stats.privateRepos)}</text>
    </g>
    <circle cx="402" cy="123" r="44" fill="none" stroke="#21262D" stroke-width="7" />
    <circle cx="402" cy="123" r="44" fill="none" stroke="#58A6FF" stroke-width="7" stroke-linecap="round" stroke-dasharray="220 277" transform="rotate(-90 402 123)" />
    <text x="402" y="128" text-anchor="middle" fill="#58A6FF" font-size="25" font-weight="700">ALL</text>
    <text x="402" y="146" text-anchor="middle" fill="#8B949E" font-size="10">TIME</text>
    <text x="25" y="207" fill="#6E7681" font-size="10">Since ${stats.joinedYear} · private activity included · updated ${date}</text>
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
