# <Workplace> — OpenProject conventions

Replace <Workplace> with your organization and edit the rules below. Everything
in this file is sent to the agent at the start of every session, so keep it under
roughly 200 lines and delete anything that no longer applies.

## Git / GitLab
- Branch: `{type}/{wp-id}-{slug}`  →  `bug/1234-fix-login-redirect`
- Commit subject: `[#1234] <imperative summary>`
- MR title must contain `#1234` so GitLab links back to the work package.

## Workflow
- Move to `In progress` only once a branch exists.
- Never close a work package yourself — set `Developed`, QA closes it.

## Fields
- `Version` is required on every Bug.
- Log time the same day, in hours.

## Etiquette
- Comment on the work package when you push. Don't just push.
