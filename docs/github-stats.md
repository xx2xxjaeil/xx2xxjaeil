# GitHub Stats card with private repositories

The README initially displays the public `github-readme-stats.vercel.app` card. The workflow at `.github/workflows/github-stats.yml` runs a script in this repository that queries GitHub's GraphQL API directly and generates `assets/github-stats.svg`. The token is not passed to a third-party stats Action or image service. On the first successful run, the workflow switches the README to the generated SVG. Subsequent runs refresh the card daily. This avoids a broken image before the secret is configured.

## One-time setup

1. Create a GitHub personal access token (classic) with `repo` and `read:user` scopes. Set an expiration date and keep the token private. The classic `repo` scope is broad and can grant write access to private repositories; revoke the token if you no longer want this card or if it is exposed.
2. In `xx2xxjaeil/xx2xxjaeil`, open **Settings → Environments → PRIVATE_STATS_TOKEN → Environment secrets**. Save the token as `PRIVATE_STATS_TOKEN`. The workflow explicitly selects this environment. Never put the token in README, an image URL, or a commit.
3. Open **Actions → Update GitHub Stats → Run workflow**. Confirm it generated `assets/github-stats.svg` and committed the README change. A missing secret causes the workflow to skip generation without changing the existing public card.

The generated SVG is public. Its white-and-purple `buefy` layout and rank display follow the [GitHub Readme Stats card](https://github.com/anuraghazra/github-readme-stats), but the token stays in this repository's workflow. The displayed rank uses the [published rank formula](https://github.com/anuraghazra/github-readme-stats/blob/master/src/calculateRank.js); it is not an official GitHub grade.

- **Stars:** Current sum of stars on owned repositories, not every star ever given and removed.
- **Commits:** GitHub contribution commits since account creation, summed over non-overlapping windows of at most 365 days. The original card's `include_all_commits=true` uses REST commit search instead, so the numbers may differ for branches or contribution rules.
- **PRs and issues:** All-time GitHub connection counts available to the authenticated account.
- **Contributed to (last year):** GitHub's recent contributed-repositories count, matching the original card's time scope.

Only aggregate counts are requested from GitHub; the script does not request repository names or source code. Anyone viewing the profile can see the published aggregate counts and rank. GitHub's **Contribution settings → Private contributions** setting controls the separate contribution graph, not this card. The right-hand `top-langs` image is served by the public GitHub Readme Stats service, uses the same `buefy` theme, and does not include private repositories. No token is sent to that service.
