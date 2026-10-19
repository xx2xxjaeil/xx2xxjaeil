import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TIME_ZONE = 'Asia/Seoul';
const WINDOW_DAYS = 30;
const CCUSAGE_VERSION = '20.0.36';
const OUTPUT_PATH = fileURLToPath(new URL('../assets/ai-usage.svg', import.meta.url));
const SOURCES = [
  { command: 'claude', name: 'Claude Code', colors: ['#38264f', '#64408f', '#9862db', '#c79af4'] },
  { command: 'codex', name: 'Codex', colors: ['#123a57', '#1f6da4', '#388fce', '#72bdf0'] },
];

function seoulDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateRange(now) {
  const today = seoulDate(now);
  const first = new Date(`${today}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - (WINDOW_DAYS - 1));
  const dates = Array.from({ length: WINDOW_DAYS }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  return { today, dates };
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function summarizeDaily(daily, dates) {
  const allowedDates = new Set(dates);
  const byDate = new Map();

  for (const row of daily) {
    if (!allowedDates.has(row.date)) continue;
    const previous = byDate.get(row.date) ?? { input: 0, output: 0, total: 0 };
    const input = safeCount(row.inputTokens);
    const output = safeCount(row.outputTokens);
    byDate.set(row.date, {
      input: previous.input + input,
      output: previous.output + output,
      total: previous.total + (safeCount(row.totalTokens) || input + output),
    });
  }

  return {
    activeDays: dates.filter((date) => (byDate.get(date)?.total ?? 0) > 0).length,
    input: dates.reduce((sum, date) => sum + (byDate.get(date)?.input ?? 0), 0),
    output: dates.reduce((sum, date) => sum + (byDate.get(date)?.output ?? 0), 0),
    activity: dates.map((date) => byDate.get(date)?.total ?? 0),
  };
}

function compact(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function heatmap(summary, source, y) {
  const maximum = Math.max(...summary.activity);
  return summary.activity.map((value, index) => {
    const intensity = value === 0 ? -1 : Math.min(3, Math.floor((Math.log1p(value) / Math.log1p(maximum)) * 4));
    const color = intensity === -1 ? '#21262d' : source.colors[intensity];
    return `<rect x="${166 + index * 22}" y="${y}" width="16" height="16" rx="3" fill="${color}" />`;
  }).join('\n  ');
}

export function renderSvg({ today, dates, summaries }) {
  const [claude, codex] = summaries;
  const sourceCard = (source, summary, x) => {
    const hasLocalData = summary.activeDays > 0;
    const headline = hasLocalData
      ? `${summary.activeDays}<tspan fill="#8b949e" font-size="13" font-weight="400"> active days / ${WINDOW_DAYS}</tspan>`
      : 'No local data';
    const detail = hasLocalData
      ? `${compact(summary.input)} input  ·  ${compact(summary.output)} output tokens`
      : 'in this 30-day window';
    return `
  <rect x="${x}" y="54" width="394" height="94" rx="10" fill="#161b22" stroke="#30363d" />
  <text x="${x + 18}" y="80" fill="#e6edf3" font-size="15" font-weight="700">${source.name}</text>
  <text x="${x + 18}" y="111" fill="#e6edf3" font-size="26" font-weight="700">${headline}</text>
  <text x="${x + 18}" y="134" fill="#8b949e" font-size="12">${detail}</text>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="264" viewBox="0 0 860 264" role="img" aria-labelledby="title description">
  <title id="title">AI Coding Activity</title>
  <desc id="description">Claude Code and Codex activity from local logs for ${dates[0]} through ${today}. Counts exclude prompts, paths, and project names.</desc>
  <rect x="0.5" y="0.5" width="859" height="263" rx="15" fill="#0d1117" stroke="#30363d" />
  <g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
  <text x="24" y="32" fill="#e6edf3" font-size="18" font-weight="700">AI Coding Activity</text>
  <text x="689" y="31" fill="#8b949e" font-size="12">LAST 30 DAYS</text>${sourceCard(SOURCES[0], claude, 24)}${sourceCard(SOURCES[1], codex, 442)}
  <text x="24" y="189" fill="#c9d1d9" font-size="13">Claude Code</text>
  ${heatmap(claude, SOURCES[0], 175)}
  <text x="24" y="219" fill="#c9d1d9" font-size="13">Codex</text>
  ${heatmap(codex, SOURCES[1], 205)}
  <text x="24" y="249" fill="#8b949e" font-size="11">Local logs only · Updated ${today} KST · Not an account quota or productivity score</text>
  </g>
</svg>
`;
}

function readDaily(command, since, until) {
  const output = execFileSync('npx', [
    '--yes', `ccusage@${CCUSAGE_VERSION}`, command, 'daily', '--json', '--no-cost',
    '--offline', '--since', since, '--until', until, '--timezone', TIME_ZONE,
  ], { encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
  const report = JSON.parse(output);
  if (!Array.isArray(report.daily)) throw new Error(`Unexpected ${command} report format`);
  return report.daily;
}

function main() {
  const { today, dates } = dateRange(new Date());
  const summaries = SOURCES.map(({ command }) => summarizeDaily(readDaily(command, dates[0], today), dates));
  const svg = renderSvg({ today, dates, summaries });
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, svg, 'utf8');
  console.log(`Updated ${OUTPUT_PATH} (${dates[0]} to ${today})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
