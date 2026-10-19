import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TIME_ZONE = 'Asia/Seoul';
const CCUSAGE_VERSION = '20.0.36';
const ECB_RATES_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const OUTPUT_PATH = fileURLToPath(new URL('../assets/ai-usage.svg', import.meta.url));
const SOURCES = [
  { command: 'claude', name: 'Claude Code' },
  { command: 'codex', name: 'Codex' },
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

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeCost(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function emptyTotals() {
  return { tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}

function addTotals(left, right) {
  return Object.fromEntries(Object.keys(left).map((key) => [key, left[key] + right[key]]));
}

function modelEntries(row, source) {
  if (source === 'codex') {
    return Object.entries(row.models ?? {}).map(([name, usage]) => [name, safeCount(usage?.totalTokens)]);
  }
  return (row.modelBreakdowns ?? []).map((usage) => [
    usage.modelName,
    safeCount(usage.inputTokens) + safeCount(usage.outputTokens)
      + safeCount(usage.cacheReadTokens) + safeCount(usage.cacheCreationTokens),
  ]);
}

export function summarizeDaily(daily, source) {
  if (!Array.isArray(daily)) throw new TypeError('Expected daily usage rows');
  if (!SOURCES.some((item) => item.command === source)) throw new TypeError('Unknown agent source');

  const byDate = new Map();
  const byModel = new Map();

  for (const row of daily) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    const input = safeCount(row.inputTokens);
    const output = safeCount(row.outputTokens);
    const cacheRead = safeCount(row.cacheReadTokens);
    const cacheWrite = safeCount(row.cacheCreationTokens);
    const values = {
      tokens: safeCount(row.totalTokens) || input + output + cacheRead + cacheWrite,
      input,
      output,
      cacheRead,
      cacheWrite,
      cost: safeCost(source === 'codex' ? row.costUSD : row.totalCost),
    };
    byDate.set(row.date, addTotals(byDate.get(row.date) ?? emptyTotals(), values));

    for (const [name, tokens] of modelEntries(row, source)) {
      if (typeof name === 'string' && name.length > 0 && tokens > 0) {
        byModel.set(name, (byModel.get(name) ?? 0) + tokens);
      }
    }
  }

  const days = [...byDate].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));
  return {
    source,
    days,
    totals: days.reduce((sum, day) => addTotals(sum, day), emptyTotals()),
    models: Object.fromEntries(byModel),
  };
}

export function combineSummaries(summaries) {
  const byDate = new Map();
  const byModel = new Map();
  const totals = summaries.reduce((sum, source) => addTotals(sum, source.totals), emptyTotals());

  for (const source of summaries) {
    for (const day of source.days) {
      const { date, ...values } = day;
      byDate.set(date, addTotals(byDate.get(date) ?? emptyTotals(), values));
    }
    for (const [name, tokens] of Object.entries(source.models)) {
      byModel.set(name, (byModel.get(name) ?? 0) + tokens);
    }
  }

  const days = [...byDate].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));
  const activeDays = days.filter((day) => day.tokens > 0).length;
  const topModel = [...byModel].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  return {
    totals,
    activeDays,
    firstDate: days[0]?.date ?? null,
    peakDayCost: Math.max(0, ...days.map((day) => day.cost)),
    averageCost: activeDays > 0 ? totals.cost / activeDays : 0,
    cacheReadShare: totals.tokens > 0 ? (totals.cacheRead / totals.tokens) * 100 : 0,
    topModel,
  };
}

export function parseEcbRates(xml) {
  const date = xml.match(/<Cube time=['"](\d{4}-\d{2}-\d{2})['"]>/)?.[1];
  const rates = Object.fromEntries([...xml.matchAll(/<Cube currency=['"]([A-Z]{3})['"] rate=['"]([\d.]+)['"]\s*\/>/g)]
    .map(([, currency, value]) => [currency, Number(value)]));
  if (!date || !['USD', 'KRW', 'CNY'].every((currency) => Number.isFinite(rates[currency]) && rates[currency] > 0)) {
    throw new Error('ECB response did not contain the required reference rates');
  }
  return { date, rates };
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function compact(value) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function currency(value, code, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: code, currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(value);
}

function metricRow(label, value, y, left, right, valueSize = 16) {
  return `<text x="${left}" y="${y}" fill="#a3a3a3" font-size="15">${escapeXml(label)}</text>
  <text x="${right}" y="${y}" text-anchor="end" fill="#3ee084" font-size="${valueSize}" font-weight="600">${escapeXml(value)}</text>`;
}

export function renderSvg({ updatedAt, summaries, combined, fx }) {
  const { totals } = combined;
  const converted = fx ? {
    KRW: totals.cost * fx.rates.KRW / fx.rates.USD,
    EUR: totals.cost / fx.rates.USD,
    CNY: totals.cost * fx.rates.CNY / fx.rates.USD,
  } : null;
  const model = combined.topModel.length > 17
    ? `${combined.topModel.slice(0, 16)}…` : combined.topModel;
  const toolLine = summaries.map(({ source, totals: tool }) => {
    const name = SOURCES.find((item) => item.command === source)?.name ?? source;
    const share = totals.cost > 0 ? (tool.cost / totals.cost) * 100 : 0;
    return `${name} ${currency(tool.cost, 'USD', 2)} (${share.toFixed(1)}%)`;
  }).join('  ·  ');
  const footer = `Recorded local logs${combined.firstDate ? ` since ${combined.firstDate}` : ''}  ·  ${fx ? `ECB FX ${fx.date}` : 'FX unavailable'}  ·  Not actual charges`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="298" viewBox="0 0 860 298" role="img" aria-labelledby="title description">
  <title id="title">AI Usage from locally recorded Claude Code and Codex sessions</title>
  <desc id="description">${escapeXml(footer)}. API-equivalent cost is estimated from available local logs.</desc>
  <rect x="0.5" y="0.5" width="859" height="297" rx="12" fill="#050505" stroke="#30363d" />
  <g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
  <path d="M37 18 25 37h10l-4 15 16-22H36l5-12Z" fill="#facc15" />
  <text x="57" y="40" fill="#3ee084" font-size="24" font-weight="700">AI Usage</text>
  <text x="832" y="29" text-anchor="end" fill="#a3a3a3" font-size="15" font-weight="600">@xx2xxjaeil</text>
  <text x="832" y="47" text-anchor="end" fill="#757575" font-size="12">API-equivalent · ${updatedAt}</text>
  <path d="M222 78v132 M435 78v132 M645 78v132" stroke="#2b2b2b" />
  <text x="28" y="84" fill="#777" font-size="12" letter-spacing="2">LOCAL HISTORY</text>
  <text x="241" y="84" fill="#777" font-size="12" letter-spacing="2">EST. COST</text>
  <text x="454" y="84" fill="#777" font-size="12" letter-spacing="2">TOKEN MIX</text>
  <text x="664" y="84" fill="#777" font-size="12" letter-spacing="2">ACTIVITY</text>
  <text x="28" y="159" fill="#3ee084" font-size="52" font-weight="700">${compact(totals.tokens)}</text>
  <text x="28" y="190" fill="#aaa" font-size="13">tokens · ${combined.cacheReadShare.toFixed(1)}% cache-read share</text>
  ${metricRow('USD', currency(totals.cost, 'USD'), 117, 241, 417)}
  ${metricRow('KRW', converted ? currency(converted.KRW, 'KRW') : '—', 143, 241, 417)}
  ${metricRow('EUR', converted ? currency(converted.EUR, 'EUR') : '—', 169, 241, 417)}
  ${metricRow('CNY', converted ? currency(converted.CNY, 'CNY') : '—', 195, 241, 417)}
  ${metricRow('Output', compact(totals.output), 117, 454, 627)}
  ${metricRow('Input', compact(totals.input), 143, 454, 627)}
  ${metricRow('Cache read', compact(totals.cacheRead), 169, 454, 627)}
  ${metricRow('Cache write', compact(totals.cacheWrite), 195, 454, 627)}
  ${metricRow('Active days', combined.activeDays, 117, 664, 833)}
  ${metricRow('Avg / day', currency(combined.averageCost, 'USD'), 143, 664, 833)}
  ${metricRow('Peak day', currency(combined.peakDayCost, 'USD'), 169, 664, 833)}
  ${metricRow('Top model', model, 195, 664, 833, 12)}
  <path d="M28 225h804" stroke="#2b2b2b" />
  <text x="28" y="251" fill="#777" font-size="12" letter-spacing="2">BY TOOL</text>
  <text x="140" y="251" fill="#d1d5db" font-size="14">${escapeXml(toolLine)}</text>
  <text x="28" y="282" fill="#737373" font-size="11">${escapeXml(footer)}</text>
  </g>
</svg>
`;
}

function readDaily(command) {
  const output = execFileSync('npx', [
    '--yes', `ccusage@${CCUSAGE_VERSION}`, command, 'daily', '--json', '--offline',
    '--timezone', TIME_ZONE,
  ], { encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
  const report = JSON.parse(output);
  if (!Array.isArray(report.daily)) throw new Error(`Unexpected ${command} report format`);
  return report.daily;
}

async function readExchangeRates() {
  try {
    const response = await fetch(ECB_RATES_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`ECB returned ${response.status}`);
    return parseEcbRates(await response.text());
  } catch {
    console.warn('ECB exchange rates unavailable; non-USD amounts will be omitted.');
    return null;
  }
}

async function main() {
  const summaries = SOURCES.map(({ command }) => summarizeDaily(readDaily(command), command));
  const svg = renderSvg({
    updatedAt: seoulDate(new Date()),
    summaries,
    combined: combineSummaries(summaries),
    fx: await readExchangeRates(),
  });
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, svg, 'utf8');
  console.log(`Updated ${OUTPUT_PATH}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
