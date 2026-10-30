## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] `npx tsc --noEmit && npm test && npm run build && node scripts/pack-check.mjs` pass
- [ ] New behaviour has a test that fails without the change
- [ ] Still two runtime dependencies
- [ ] Terminal output goes to the streams `runCli` passes in, never `console` or `process.stdout`
- [ ] Any caller-supplied value interpolated into an API path goes through `segment()`
- [ ] `CHANGELOG.md` updated under `## [Unreleased]`
