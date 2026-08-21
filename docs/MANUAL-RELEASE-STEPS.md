# Manual Release Steps — things only you can do

Everything in this file needs your accounts, your browser, or your credentials.
The code work is in
[`docs/superpowers/plans/2026-08-21-public-release-hardening.md`](./superpowers/plans/2026-08-21-public-release-hardening.md);
the reasoning behind it is in
[`docs/superpowers/specs/2026-08-21-public-release-hardening-design.md`](./superpowers/specs/2026-08-21-public-release-hardening-design.md).

Work through this top to bottom. Parts 1 and 2 come before the plan; Parts 3
onward come after it.

---

## Part 0 — Values you will substitute

Decide these once and use the same strings everywhere.

| Placeholder | Value | Where it appears |
|---|---|---|
| `<GITHUB_USER>` | your GitHub account | `package.json`, `README.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/config.yml`, `src/cli.ts` usage text |
| `<NPM_USER>` | your npm account | npm web UI only |
| `<CONTACT>` | an address you will read | `CODE_OF_CONDUCT.md` |

Already decided, and baked into the plan:

- **npm package name: `operator-mcp`.** `openproject-mcp` is taken —
  `openproject-mcp@1.0.1`, published 2026-01-23 by `cyborgx0x` for an unrelated
  OpenProject MCP server. So is `mcp-openproject`, same author. The **MCP server
  name stays `openproject`**; only the npm package is renamed.
- **Repository name: `operator-mcp`**, to match the package.
- **Node floor: 24.** CI runs Node 24 only.
- **Version: 1.0.0.**

---

## Part 1 — Prepare your machine (before the plan runs)

- [ ] **1.1 Upgrade Node to 24.** You are on v20.19.2, which went end-of-life in
  April 2026 and cannot run a package with `engines: >=24`.

  ```bash
  nvm install 24 && nvm use 24     # or fnm / volta / your distro
  node -v      # v24.x
  npm -v       # 11.x — Trusted Publishing needs >= 11.5.1
  ```

  If you use nvm, `nvm alias default 24` so a new shell keeps it.

- [ ] **1.2 Move your existing profile.** The config directory is renamed with
  the package. There are no published users, so the plan writes no migration
  code — one command covers your own machine.

  ```bash
  mv ~/.config/openproject-mcp ~/.config/operator-mcp
  ls ~/.config/operator-mcp/default/
  ```

  If you would rather start clean, `rm -rf ~/.config/openproject-mcp` and run
  `npx operator-mcp setup` after the plan is done.

- [ ] **1.3 Commit or stash what is uncommitted.** `git status` currently shows
  modified `CLAUDE.md`, `src/client.ts`, `test/client.test.ts` and the two doc
  files, plus untracked `.claude/` and `.codegraph/`. The `client.ts` change —
  Bearer → HTTP Basic — is a real fix and must not be lost.

  ```bash
  git add CLAUDE.md src/client.ts test/client.test.ts docs/
  git commit -m "fix: authenticate personal api keys over http basic"
  git add .claude/skills
  git commit -m "chore: project skills"
  ```

  Leave `.claude/settings.local.json` and `.codegraph/` untracked — Task 1 of
  the plan adds them to `.gitignore`.

- [ ] **1.4 Note the live-test credentials you will need later.** Part 7 asks you
  to run the live smoke suite. Have a **scratch** OpenProject project ready — the
  suite creates and modifies work packages in it.

---

## Part 2 — Run the implementation plan

- [ ] **2.1** Hand the plan to an agent, or work through it yourself:

  ```
  Execute docs/superpowers/plans/2026-08-21-public-release-hardening.md
  ```

  Fifteen tasks, each ending green with its own commit. Task 1 asks you for
  `<GITHUB_USER>`; everything else is mechanical.

- [ ] **2.2** Confirm Task 15 passed before continuing. In particular
  `npm run pack:check` and the stdio smoke test — a broken stdout stream is the
  one failure mode that makes the server look dead in every client at once.

---

## Part 3 — Create the GitHub repository

- [ ] **3.1 Create it, public, with no auto-generated files.**

  ```bash
  cd /home/analista/Documents/Proyects/OPerator
  gh repo create operator-mcp \
    --public \
    --source=. \
    --remote=origin \
    --description "MCP server that lets agents work inside your OpenProject instance, following your workplace's written conventions" \
    --push
  ```

  If you prefer the browser: github.com → New repository → name `operator-mcp`,
  Public, **no** README, **no** .gitignore, **no** licence (the repo has all
  three). Then:

  ```bash
  git remote add origin https://github.com/<GITHUB_USER>/operator-mcp.git
  git push -u origin main
  ```

- [ ] **3.2 Set the repository topics** so it is findable:

  ```bash
  gh repo edit --add-topic mcp,model-context-protocol,openproject,project-management,claude,ai-agents
  ```

- [ ] **3.3 Confirm nothing private went up.**

  ```bash
  git ls-files | grep -E '\.codegraph|settings\.local|\.env' ; echo "(empty is correct)"
  gh repo view --web
  ```

  Check the file list in the browser too. If `.claude/settings.local.json` or
  `.codegraph/` did get committed, remove them now, while the history is short:

  ```bash
  git rm -r --cached .codegraph .claude/settings.local.json
  git commit -m "chore: stop tracking local files"
  git push
  ```

---

## Part 4 — Validate the CI workflows

Do this **before** you tag anything. A workflow that fails to parse never runs,
and GitHub gives you no warning until you push it.

- [ ] **4.1 Local parse check** (already in the plan, repeat it here after any edit):

  ```bash
  docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color
  ```

  No output means clean.

- [ ] **4.2 Confirm GitHub registered them.**

  ```bash
  gh workflow list
  ```
  Expected: `CI`, `CodeQL`, `Release`.

- [ ] **4.3 Trigger CI by hand and watch it.**

  ```bash
  gh workflow run ci.yml
  sleep 10 && gh run watch
  ```

  All five jobs must be green: `test (ubuntu-latest)`, `test (macos-latest)`,
  `test (windows-latest)`, `audit`, `secrets`. The Windows job is the one most
  likely to surprise you — it is also the one that proves the path handling.

- [ ] **4.4 Prove it catches a real failure.** A pipeline nobody has seen fail is
  not a pipeline.

  ```bash
  git checkout -b ci-proof
  printf '\nexport const broken: number = "not a number";\n' >> src/version.ts
  git commit -am "test: deliberately break the build"
  git push -u origin ci-proof
  gh pr create --fill
  gh run watch
  ```

  The `typecheck` step must fail. Then:

  ```bash
  gh pr close --delete-branch
  git checkout main && git branch -D ci-proof
  ```

- [ ] **4.5 Check the CodeQL result.** Repository → Security → Code scanning.
  Triage anything it reports before publishing. `security-extended` is noisier
  than the default suite; a finding you disagree with should be dismissed with a
  written reason, not ignored.

---

## Part 5 — Harden the repository settings

All in the GitHub web UI, or by API where shown.

- [ ] **5.1 Restrict what Actions can do.**
  Settings → Actions → General:
  - Workflow permissions → **Read repository contents and packages permissions**
    (the workflows request more where they need it).
  - Uncheck **Allow GitHub Actions to create and approve pull requests**.

- [ ] **5.2 Turn on the free security features.**
  Settings → Advanced Security (or Code security and analysis):
  - **Private vulnerability reporting** — on. This is the form `SECURITY.md`
    points people at.
  - **Dependabot alerts** and **Dependabot security updates** — on.
  - **Secret scanning** and **Push protection** — on. Push protection is what
    stops you committing an API key at 1am.

- [ ] **5.3 Protect `main`.** Direct pushes are how a broken release happens.

  The endpoint wants one JSON document — build it with a heredoc rather than
  fighting `gh api`'s flag syntax for nested fields:

  ```bash
  gh api -X PUT repos/<GITHUB_USER>/operator-mcp/branches/main/protection \
    -H "Accept: application/vnd.github+json" --input - <<'JSON'
  {
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "test (ubuntu-latest)",
        "test (macos-latest)",
        "test (windows-latest)",
        "audit",
        "secrets"
      ]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": null,
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false
  }
  JSON
  ```

  The context strings must match the check names GitHub actually reported in
  step 4.3 — a matrix job called `test` shows up as `test (ubuntu-latest)`. If a
  name is wrong, the rule waits forever for a check that never arrives. Confirm
  the exact names with `gh api repos/<GITHUB_USER>/operator-mcp/commits/main/check-runs --jq '.check_runs[].name'`.

  `required_pull_request_reviews=null` because you are working alone — nobody can
  approve your PRs. Everything else still applies to you: `enforce_admins=true`
  means you cannot push a red build to `main` either.

  Verify: `gh api repos/<GITHUB_USER>/operator-mcp/branches/main/protection | head -30`

- [ ] **5.4 Create the `release` environment.** The release workflow declares
  `environment: release`; without it the job fails.
  Settings → Environments → New environment → name it `release`.
  Add yourself as a **required reviewer** — then every publish pauses for a
  one-click approval, which is a cheap last line of defence against a mistaken tag.

---

## Part 6 — npm account and Trusted Publishing

- [ ] **6.1 Secure the account.**
  npmjs.com → Account → Two-factor authentication → enable for
  **Authorization and Writes**. Save the recovery codes somewhere real.

- [ ] **6.2 Confirm the name is still free.**

  ```bash
  npm view operator-mcp version
  ```
  `404 Not Found` is what you want. If someone has taken it in the meantime, pick
  another name and re-run the `<GITHUB_USER>`-style substitution for the package
  name across `package.json`, `README.md`, `src/snippets.ts`, `src/cli.ts` and
  `src/errors.ts`.

- [ ] **6.3 Publish 1.0.0 manually — once.**

  npm's Trusted Publisher panel lives under an existing package's settings, so a
  brand-new name has to be created by a normal publish first. (Check the panel
  before you do this — if npm has since added pre-registration for names you do
  not own yet, configure it in 6.4 and let CI publish 1.0.0 instead.)

  ```bash
  npm login                    # browser flow, with 2FA
  npm whoami                   # <NPM_USER>
  npm ci && npm test && npm run build && npm run pack:check

  # publishConfig.provenance requires OIDC, which only CI has — turn it off for
  # this one manual publish.
  npm publish --no-provenance
  ```

  Expected: `+ operator-mcp@1.0.0`.

- [ ] **6.4 Configure Trusted Publishing.**
  npmjs.com → Packages → **operator-mcp** → Settings → **Trusted publishing**:

  | Field | Value |
  |---|---|
  | Provider | GitHub Actions |
  | Organization or user | `<GITHUB_USER>` |
  | Repository | `operator-mcp` |
  | Workflow filename | `release.yml` |
  | Environment | `release` |

  Save.

- [ ] **6.5 Lock the package to that publisher.**
  Same settings page → **Publishing access** → require two-factor authentication
  **or** a trusted publisher, and disallow classic tokens. From here on, nothing
  can publish `operator-mcp` except the workflow in your repository.

- [ ] **6.6 Check the npm page.** <https://www.npmjs.com/package/operator-mcp> —
  the README should render, the repository link should work, and the version
  should read 1.0.0.

---

## Part 7 — Prove the release pipeline

The first CI-published version is what proves the pipeline works end to end. Use
a patch bump.

- [ ] **7.1 Run the live smoke suite** against your real instance first. It is
  the only check that exercises the HTTP Basic authentication change and the
  rewritten URL construction against real OpenProject.

  ```bash
  OPENPROJECT_URL=https://your-instance \
  OPENPROJECT_API_KEY=your-key \
  OPENPROJECT_TEST_PROJECT=your-scratch-project \
  npm run test:live
  ```

- [ ] **7.2 Bump, changelog, tag, push.**

  ```bash
  npm version patch -m "chore: release v%s"      # 1.0.1, commits and tags
  # add a "## [1.0.1]" section to CHANGELOG.md describing what changed
  git add CHANGELOG.md && git commit --amend --no-edit
  git tag -f v1.0.1
  git push origin main --follow-tags
  ```

- [ ] **7.3 Approve and watch.**

  ```bash
  gh run watch
  ```
  The job pauses for your approval (Part 5.4). Approve it, then confirm every
  step is green — especially **Tag must match package.json**, which is the guard
  against publishing a version nobody meant to.

- [ ] **7.4 Confirm provenance landed.**

  ```bash
  npm view operator-mcp version           # 1.0.1
  npm view operator-mcp dist.attestations # present
  ```

  On <https://www.npmjs.com/package/operator-mcp> there should now be a
  **Provenance** panel naming your repository, the workflow, and the commit.
  That badge is the thing that lets a stranger trust the tarball.

- [ ] **7.5 Check the GitHub Release** at
  `https://github.com/<GITHUB_USER>/operator-mcp/releases` — generated notes,
  correct tag.

---

## Part 8 — Verify what the world gets

- [ ] **8.1 Install as a stranger would**, in a clean directory:

  ```bash
  cd $(mktemp -d)
  npx -y operator-mcp --version     # 1.0.1
  npx -y operator-mcp --help
  npx -y operator-mcp doctor        # "Not configured", exit 1 — correct here
  ```

- [ ] **8.2 Run the wizard end to end from the registry**, not from your working
  tree:

  ```bash
  npx -y operator-mcp setup --profile fresh
  npx -y operator-mcp doctor --profile fresh
  rm -rf ~/.config/operator-mcp/fresh
  ```

- [ ] **8.3 Register it in a real client** using the block the wizard printed,
  restart the client, and ask an agent to call `whoami` and `my_work`.

- [ ] **8.4 Test the switches actually switch.** Add
  `"env": { "OPENPROJECT_READ_ONLY": "1" }` to the client config, restart, and
  confirm a write is refused. Then confirm `api_request` with `DELETE` is refused
  without `OPENPROJECT_ALLOW_DELETE`.

- [ ] **8.5 Check the tarball has no surprises:**

  ```bash
  npm pack operator-mcp@1.0.1 && tar -tzf operator-mcp-1.0.1.tgz
  ```
  Only `package/dist/`, `package/templates/`, `README.md`, `LICENSE`,
  `CHANGELOG.md`, `package.json`. No `src/`, no `test/`, no `.github/`.

---

## Part 9 — After launch

- [ ] **9.1 Watch the first Dependabot pull requests.** They arrive within a week.
  Merging them is the maintenance job; ignoring them is how the `hono` and
  `fast-uri` advisories you just cleared come back.

- [ ] **9.2 Add it to the MCP directories** if you want users:
  the `modelcontextprotocol/servers` community list, `mcpservers.org`,
  Smithery, Glama. Each wants the repo URL and the npm package name.

- [ ] **9.3 Tell OpenProject's community.** The OpenProject forum and their
  GitHub Discussions are where people who need this actually are.

---

## If something goes wrong

**Published a broken 1.0.x.** You have 72 hours to unpublish a version with no
dependents. Prefer deprecating and shipping a fix.

```bash
npm deprecate operator-mcp@1.0.1 "Broken — use 1.0.2 or later"
# or, within 72 hours and only if nothing depends on it:
npm unpublish operator-mcp@1.0.1
```

Never republish the same version number — npm forbids it, and tooling caches it.

**A secret reached the repository.** Rotate it first, at the source
(`<url>/my/access_token`), then clean the history. Rotation is the fix; history
rewriting is cleanup.

**The release workflow cannot authenticate.** Check, in order: `id-token: write`
is on the job, the `release` environment name matches the Trusted Publisher
config exactly, the workflow filename in the npm panel is `release.yml`, and the
runner's npm is ≥ 11.5.1 (`npm -v` in a workflow step).

**The tag/version guard fails.** The tag and `package.json` disagree. Delete the
tag, fix the version, tag again:

```bash
git tag -d v1.0.1 && git push origin :refs/tags/v1.0.1
```

**A user says "it doesn't show up in my client."** Ask for
`npx operator-mcp doctor` output — that is what the bug template requests, and it
answers the question nine times out of ten.
