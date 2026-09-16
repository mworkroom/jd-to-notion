# AGENTS.md

## Supported Platform and Browser Validation

This application is used exclusively on desktop PCs. Mobile and responsive layouts are not supported targets.

- Treat desktop Google Chrome as the only supported browser-validation target.
- Use the existing desktop viewport of 1280 × 900 unless a task requires another specific desktop resolution.
- Run the browser regression suite with `npm.cmd run test:browser`. The Playwright configuration must contain only the `desktop-chrome` project.
- Use `npm.cmd run test:browser -- --grep "<scenario>"` when focused validation is sufficient.
- Do not run, add, maintain, or report mobile viewport scenarios unless J explicitly requests mobile validation.
- Do not treat mobile-only layout issues, horizontal overflow, or interaction failures as blockers.
- Preserve fixture isolation: browser regression tests must not perform live Notion, Google Sheets, Word, download-folder, or other external writes.
- In completion reports, state only the desktop Chrome coverage that was actually performed.
