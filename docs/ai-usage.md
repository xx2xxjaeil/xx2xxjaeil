# AI Usage card

The profile card in `assets/ai-usage.svg` shows a rolling 30-day summary of local Claude Code and Codex usage. It is **not** a live account quota, billing statement, or measure of engineering productivity.

## Refresh the card

From this repository on the Mac that has the local agent logs:

```bash
node scripts/update-ai-usage.mjs
node --test scripts/update-ai-usage.test.mjs
```

The script uses Node.js 20+ and a pinned `ccusage` version through `npx`. It reads only the aggregated daily JSON reports, then writes the SVG. It does not upload session transcripts, prompts, file paths, project names, credentials, or model-level details. The displayed input/output counts exclude cache tokens; daily heatmap intensity uses the report's total token count, including cache.

"No local data" means this machine has no recorded usage for that tool in the 30-day window. It does not mean the account or a different device was unused.

The script does **not** commit or push. Review `git diff -- assets/ai-usage.svg` before publishing an update. GitHub-hosted Actions cannot read logs from a personal Mac, so automatic refresh would require an explicitly configured local scheduler or self-hosted runner.
