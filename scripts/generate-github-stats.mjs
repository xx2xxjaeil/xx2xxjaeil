import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCOUNT = 'xx2xxjaeil';
const OUTPUT_PATH = fileURLToPath(new URL('../assets/github-stats.svg', import.meta.url));
const DAY_MS = 24 * 60 * 60 * 1000;

const QUERY = `query($from: DateTime!, $to: DateTime!) {
  viewer {
    login
    privateRepositories: repositories(ownerAffiliations: OWNER, privacy: PRIVATE, first: 1) { totalCount }
    publicRepositories: repositories(ownerAffiliations: OWNER, privacy: PUBLIC, first: 1) { totalCount }
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { totalContributions }
      totalCommitContributions
      totalPullRequestContributions
    }
  }
}`;

function count(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`GitHub returned an invalid ${field} count`);
  }
  return value;
}

export function parseStats(payload) {
  if (payload.errors?.length) {
    throw new Error(`GitHub GraphQL query failed: ${payload.errors.map((error) => error.message).join('; ')}`);
  }

  const viewer = payload.data?.viewer;
  if (viewer?.login?.toLowerCase() !== ACCOUNT) {
    throw new Error(`PRIVATE_STATS_TOKEN must belong to ${ACCOUNT}`);
  }

  const contributions = viewer.contributionsCollection;
  const stats = {
    totalContributions: count(contributions?.contributionCalendar?.totalContributions, 'contributions'),
    commits: count(contributions?.totalCommitContributions, 'commits'),
    pullRequests: count(contributions?.totalPullRequestContributions, 'pull requests'),
    privateRepos: count(viewer.privateRepositories?.totalCount, 'private repositories'),
    publicRepos: count(viewer.publicRepositories?.totalCount, 'public repositories'),
  };

  // This account has private repositories. Fail rather than silently publishing a public-only card.
  if (stats.privateRepos === 0) throw new Error('No private repositories are visible to PRIVATE_STATS_TOKEN');
  return stats;
}

export function renderStats(stats, updatedAt) {
  const format = (value) => value.toLocaleString('en-US');
  const date = updatedAt.toISOString().slice(0, 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="205" viewBox="0 0 560 205" role="img" aria-labelledby="title description">
  <title id="title">GitHub Stats for @${ACCOUNT}</title>
  <desc id="description">Last 365 days: ${format(stats.totalContributions)} contributions, ${format(stats.commits)} commits, ${format(stats.pullRequests)} pull requests. ${format(stats.privateRepos)} private and ${format(stats.publicRepos)} public repositories owned.</desc>
  <rect x="0.5" y="0.5" width="559" height="204" rx="12" fill="#0d1117" stroke="#30363d" />
  <g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
    <text x="24" y="36" fill="#3ee084" font-size="20" font-weight="700">GitHub Stats</text>
    <text x="536" y="34" text-anchor="end" fill="#8b949e" font-size="13">@${ACCOUNT}</text>
    <path d="M249 58v119" stroke="#30363d" />
    <text x="24" y="76" fill="#8b949e" font-size="11" letter-spacing="1.5">LAST 365 DAYS</text>
    <text x="24" y="133" fill="#3ee084" font-size="47" font-weight="700">${format(stats.totalContributions)}</text>
    <text x="24" y="154" fill="#c9d1d9" font-size="13">contributions</text>
    <text x="273" y="80" fill="#8b949e" font-size="12">Commits</text>
    <text x="273" y="105" fill="#e6edf3" font-size="20" font-weight="600">${format(stats.commits)}</text>
    <text x="410" y="80" fill="#8b949e" font-size="12">Pull requests</text>
    <text x="410" y="105" fill="#e6edf3" font-size="20" font-weight="600">${format(stats.pullRequests)}</text>
    <text x="273" y="135" fill="#8b949e" font-size="12">Private repos</text>
    <text x="273" y="160" fill="#3ee084" font-size="20" font-weight="600">${format(stats.privateRepos)}</text>
    <text x="410" y="135" fill="#8b949e" font-size="12">Public repos</text>
    <text x="410" y="160" fill="#e6edf3" font-size="20" font-weight="600">${format(stats.publicRepos)}</text>
    <text x="24" y="190" fill="#6e7681" font-size="11">Includes accessible private activity · Updated ${date}</text>
  </g>
</svg>\n`;
}

export async function fetchStats(token, now = new Date(), request = fetch) {
  if (!token) throw new Error('GITHUB_STATS_TOKEN is required');
  const from = new Date(now.getTime() - 365 * DAY_MS).toISOString();
  const to = now.toISOString();
  const response = await request('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'xx2xxjaeil-profile-stats',
    },
    body: JSON.stringify({ query: QUERY, variables: { from, to } }),
  });
  if (!response.ok) throw new Error(`GitHub GraphQL API returned HTTP ${response.status}`);
  return parseStats(await response.json());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const now = new Date();
  const stats = await fetchStats(process.env.GITHUB_STATS_TOKEN, now);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, renderStats(stats, now));
  process.stdout.write('Updated assets/github-stats.svg\n');
}
