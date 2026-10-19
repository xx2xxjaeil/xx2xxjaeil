# GitHub Stats card with private repositories

The README initially displays the public `github-readme-stats.vercel.app` card. The workflow at `.github/workflows/github-stats.yml` runs a script in this repository that queries GitHub's GraphQL API directly and generates `assets/github-stats.svg`. The token is not passed to a third-party stats Action or image service. On the first successful run, the workflow switches the README to the generated SVG. Subsequent runs refresh the card daily. This avoids a broken image before the secret is configured.

## One-time setup

1. Create a GitHub personal access token (classic) with `repo` and `read:user` scopes. Set an expiration date and keep the token private. The classic `repo` scope is broad and can grant write access to private repositories; revoke the token if you no longer want this card or if it is exposed.
2. In `xx2xxjaeil/xx2xxjaeil`, open **Settings → Environments → PRIVATE_STATS_TOKEN → Environment secrets**. Save the token as `PRIVATE_STATS_TOKEN`. The workflow explicitly selects this environment. Never put the token in README, an image URL, or a commit.
3. Open **Actions → Update GitHub Stats → Run workflow**. Confirm it generated `assets/github-stats.svg` and committed the README change. A missing secret causes the workflow to skip generation without changing the existing public card.

The generated SVG is public. It shows aggregate private-repository statistics from the last 365 days to everyone who views the profile, but it does not publish repository names or source code. The private-repository count includes repositories owned by this account; contribution totals can include work in other repositories accessible to the token. GitHub's **Contribution settings → Private contributions** setting controls the separate contribution graph, not this card.
