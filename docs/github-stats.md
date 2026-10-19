# GitHub Stats card with private repositories

The README initially displays the public `github-readme-stats.vercel.app` card. The workflow at `.github/workflows/github-stats.yml` generates `assets/github-stats.svg` with an authenticated GitHub token. On its first successful run, it switches the README to the generated SVG. Subsequent runs refresh the card daily. This avoids a broken image before the secret is configured.

## One-time setup

1. Create a GitHub personal access token (classic) with the `repo` and `read:user` scopes required by [GitHub Readme Stats Action](https://github.com/stats-organization/github-readme-stats-action#inputs). Set an expiration date and keep the token private. The classic `repo` scope is broad and can grant write access to private repositories; revoke the token if you no longer want this card or if it is exposed.
2. In `xx2xxjaeil/xx2xxjaeil`, open **Settings → Environments → PRIVATE_STATS_TOKEN → Environment secrets**. Save the token as `PRIVATE_STATS_TOKEN`. The workflow explicitly selects this environment. Never put the token in README, an image URL, or a commit.
3. Open **Actions → Update GitHub Stats → Run workflow**. Confirm it generated `assets/github-stats.svg` and committed the README change. A missing secret causes the workflow to skip generation without changing the existing public card.

The generated SVG is public. It shows aggregate private-repository statistics to everyone who views the profile, but the card does not need to publish repository names or source code. GitHub's **Contribution settings → Private contributions** setting controls the separate contribution graph, not this card.
