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

## 4. Pick the version, bump it in both places, tag, push

npm already has **1.2.0** (published 2026-08-25), but the repo says 1.1.2 and no
commit in it is 1.2.0. npm never accepts a version twice, and a version lower than
1.2.0 would become `latest`. Use **1.2.1** (or higher):

```bash
git switch main && git pull
npm version 1.2.1 --no-git-tag-version
sed -i 's/export const version = ".*"/export const version = "1.2.1"/' src/server.ts
# add a 1.2.1 heading to CHANGELOG.md over the 1.1.2 notes
npm test && git commit -am "chore: release 1.2.1"
git tag v1.2.1 && git push origin main v1.2.1
```

`test/server.test.ts` fails if the two versions disagree.

## 5. Check the first CI release

GitHub → Actions → `release`. Check that:
- npm shows the new version with a provenance badge,
- the GitHub release has `operator-mcp-{linux,darwin}-{x64,arm64}.gz`, `SHA256SUMS`, `install.sh`,
- the `macos` job ran the arm64 binary (`--version`) after `codesign -s -`. On a Mac:
  `curl -fsSL https://github.com/DanielEsc0911/operator-mcp/releases/latest/download/install.sh | sh -s -- --no-setup && operator-mcp --version`.

## 6. Publish the landing page

```bash
cd ../operator-landing-page
gh repo create DanielEsc0911/operator-landing-page --private --source . --push
```

Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
Framework preset Astro; build command `npm run build`; output directory `dist`;
environment variable `NODE_VERSION` = `22`. Project name `operator-mcp` gives
`https://operator-mcp.pages.dev`.

Optional: Pages project → Metrics → enable Web Analytics (cookieless, already allowed by
the CSP in `public/_headers`). Optional custom domain: Pages project → Custom domains.
**If the domain changes**, change the one install-line constant in each repo:
`SITE_URL` in `operator-landing-page/src/site.ts`, and the `curl` line in
`operator-mcp/README.md` and the usage lines at the top of `install/install.sh`. Re-run
`npm run sync-brand` in the landing repo only if you also re-record the demo.

## 7. Run the live installer

After step 5 and step 6:

```bash
curl -fsSL https://operator-mcp.pages.dev/install.sh | sh
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
