# Repository guidance for coding agents

## Before editing

- Start from the latest `origin/main`, or continue the feature branch explicitly under review. Never commit or push directly to `main`.
- Read the affected code, its callers, tests, and relevant documentation before changing behavior. Follow the actual execution path.
- Prefer the smallest complete change. Reuse existing modules, dependencies, and test utilities; do not add a framework or dependency without a demonstrated need.
- Preserve correctness, validation, security, accessibility, compatibility, and test coverage. Do not weaken checks to make a change pass.

## Implementing and verifying

- Add or update tests for nontrivial logic and state transitions. Preserve seeded determinism, action ordering, export compatibility, and replay behavior unless the change explicitly versions those contracts.
- Run the relevant checks from `CONTRIBUTING.md` and `.github/workflows/ci.yml`. Report checks that could not run; never describe a skipped check as passed.
- Update `README.md` for user-visible behavior, setup, commands, architecture, or status changes. Update `CHANGELOG.md` for user-visible changes and the relevant architecture or performance documentation when those areas change.
- Keep implemented, experimental, planned, and unsupported features distinct. State benchmark environment, fixture, method, baseline, results, and caveats; never infer browser or GPU performance from a stubbed renderer.
- Review the surrounding code and complete diff. Record unresolved shortcuts with their reason and the condition for revisiting them.

## Pull requests and releases

- Use a descriptive feature branch and a focused pull request targeting `main`. Review the diff and verify required checks before merging; do not bypass branch protection.
- Do not publish a release as part of an ordinary feature change. A release requires a separate final review of compatibility, versions, documentation, CI, deployment, and release notes.

These rules adapt the small-change, code-understanding, and validation principles in [Ponytail](https://github.com/DietrichGebert/ponytail) to this repository. No Ponytail code or tooling is required here.
