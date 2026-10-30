# Manual release steps — what only the owner can do

Everything here needs your accounts, browser, or credentials. Work top to bottom.
The code is done on branch `fresh-coat` (operator-mcp) and `main` (operator-landing-page).

**Do steps 1–5 first.** `operator-mcp` on npm still serves code without the Chunk 1
security fixes (URL escape, plain-HTTP keys, path injection). Until a release ships,
every `npx operator-mcp` user runs the unpatched version.

## 1. Turn on private reporting and keep your email private

`SECURITY.md` and `CODE_OF_CONDUCT.md` both send reports to GitHub's private
form, not to an email address. The form only works once it is switched on:

- **Repo → Settings → Code security → Private vulnerability reporting → Enable.**
- **github.com/settings/emails:** tick *Keep my email addresses private* and
  *Block command line pushes that expose my email*.
- Commit with your GitHub no-reply address from now on:

```bash
id=$(gh api users/DanielEsc0911 --jq .id)
git config user.email "${id}+DanielEsc0911@users.noreply.github.com"
```

## 2. Review and merge `fresh-coat` into `main`

```bash
git push -u origin fresh-coat
gh pr create --base main --head fresh-coat --title "Fresh Coat"
```

Read the diff on GitHub, wait for CI (Linux, macOS, Windows, CodeQL) to go green, fix
anything Windows-only that the first run shows, then merge.

## 3. Configure npm Trusted Publishing

npmjs.com → `operator-mcp` → Settings → Trusted Publisher → GitHub Actions:
owner `DanielEsc0911`, repository `operator-mcp`, workflow `release.yml`, no environment.
The release job already has `id-token: write` and runs `npm publish --provenance`.

## 4. Tag 1.2.1 and push the tag

npm already has **1.2.0** (published 2026-08-25 with no matching commit here), and
npm never accepts a version twice, so the security release is **1.2.1**. The bump in
`package.json`, `package-lock.json`, `src/server.ts` and `CHANGELOG.md` arrives
through the `release-1.2.1` pull request. Merge it once its CI is green on Linux,
macOS and Windows, then tag the merge:

```bash
git switch main && git pull
git tag v1.2.1 && git push origin v1.2.1
```

For later releases: `npm version X.Y.Z --no-git-tag-version`, set the same value in
`src/server.ts`, add a `CHANGELOG.md` heading, merge, then tag `vX.Y.Z`. `test/server.test.ts` fails if the two versions disagree.

## 5. Check the first CI release

GitHub → Actions → `release`. Check that:
- npm shows the new version with a provenance badge,
- the GitHub release has `operator-mcp-{linux,darwin}-{x64,arm64}.gz`, `SHA256SUMS`, `install.sh`,
- the `macos` job ran the arm64 binary (`--version`) after `codesign -s -`. On a Mac:
  `curl -fsSL https://github.com/DanielEsc0911/operator-mcp/releases/latest/download/install.sh | sh -s -- --no-setup && operator-mcp --version`.

## 6. Publish the landing page

The repo is `git@github.com:DanielEsc0911/operator-landing-page.git` (private) and
deploys with Cloudflare Pages' Git integration: every push to `main` goes to
production, and every other branch or PR gets its own preview URL. No secrets live
in GitHub.

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
   Authorize the Cloudflare GitHub app for `operator-landing-page` only. **Do not
   create the project with `wrangler` first**: a Direct Upload project can never be
   switched to Git later.
2. Build settings: framework preset **Astro**, build command `npm run build`, output
   directory `dist`, production branch `main`. The build image reads `.nvmrc` (22);
   set `NODE_VERSION` = `22` only if the build log shows another version.
3. Pages project → **Custom domains → Set up a custom domain** → `operator.daer.dev`.
   The zone is in the same Cloudflare account, so the CNAME and certificate are
   created for you.
4. GitHub → repo **Settings → Branches → Add rule** for `main`: require a pull request
   and require the `test` status check from the `ci` workflow (build, Playwright + axe, Lighthouse). Cloudflare
   cannot wait for GitHub checks, so this rule is what keeps an untested change off
   production: only merged, green PRs reach `main`.
5. Optional: Pages project → **Metrics → Web Analytics** (cookieless, already allowed by
   the CSP in `public/_headers`).

**If the domain changes**, change the one install-line constant in each repo:
`SITE_URL` in `operator-landing-page/src/site.ts`, and the `curl` line in
`operator-mcp/README.md` and the usage lines at the top of `install/install.sh`. Re-run
`npm run sync-brand` in the landing repo only if you also re-record the demo.

## 7. Run the live installer

After step 5 and step 6:

```bash
curl -fsSL https://operator.daer.dev/install.sh | sh
```

Before the first tag, `/install.sh` redirects (302) to a release asset that 404s; that is expected.

## 8. Optional: re-record the demo against a real instance

`docs/brand/demo/session.txt` was recorded against a local mock. To replace it, record
`curl … | sh` at 80 columns (see the Chunk 4/5 notes in `docs/progress/2026-10-29-fresh-coat.md`),
then `cd ../operator-landing-page && npm run sync-brand` (it rewrites your host to
`openproject.acme.com`).

## 9. Later housekeeping

- **Astro:** once your Node is ≥ 22.23.4, bump `astro` past 7.4.1 in the landing repo
  (`npm i -E astro@latest && npm run build && npm test && npm run lighthouse`).
- **Name search:** search "OPerator" at npmjs.com, USPTO (tmsearch.uspto.gov) and EUIPO
  (euipo.europa.eu/eSearch) in software classes 9 and 42.
- **Dev-only advisories:** `npm audit` reports dev-dependency advisories in both repos.
  `npm audit --omit=dev` is clean; update dev tools when fixes land.
