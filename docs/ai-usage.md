# AI Usage card

The profile card in `assets/ai-usage.svg` summarizes the **available local logs** for Claude Code and Codex. It shows recorded tokens, estimated API-equivalent cost, token mix, active days, and the top model by token volume. It is **not** a live account quota, actual billing statement, or measure of engineering productivity. Older logs may be missing or pruned, so the card deliberately says "Local history" rather than "All-time".

## Refresh the card

From this repository on the Mac that has the local agent logs:

```bash
node scripts/update-ai-usage.mjs
node --test scripts/update-ai-usage.test.mjs
```

The script uses Node.js 20+ and a pinned `ccusage` version through `npx`. It reads only aggregated daily JSON reports, then writes the SVG. The script does not upload session transcripts, prompts, file paths, project names, or credentials. Model names and aggregate model token counts are used to determine the displayed top model.

The USD cost is estimated from `ccusage`'s model pricing and does not represent money actually paid under a subscription. KRW, EUR, and CNY are converted from USD using the [ECB euro reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) available when the card is refreshed; the rate date appears in the footer. If the ECB request fails, those three conversions are shown as unavailable rather than reusing an unlabelled stale rate. No usage statistics are sent to the ECB.

The script does **not** commit or push. Review `git diff -- assets/ai-usage.svg` before publishing an update. GitHub-hosted Actions cannot read logs from a personal Mac, so automatic refresh would require an explicitly configured local scheduler or self-hosted runner.
