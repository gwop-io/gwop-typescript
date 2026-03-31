# Changelog

All notable changes to `@gwop/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `validateWebhook()` reads `GWOP_WEBHOOK_SECRET` from environment (Node.js, Deno, Bun)
- Webhook secret test coverage (synthetic, no network)

## [0.2.2] - 2026-03-29

### Changed
- README streamlined — compressed auth, webhook, and config sections; moved concepts below the fold
- Added CI badge and yarn/pnpm/bun install options
- Quick start now uses `new Gwop()` (env var auto-detection)

## [0.2.1] - 2026-03-29

### Fixed
- Repository URL for npm OIDC trusted publishing
- Repo renamed from `gwop-typescript` to `gwop-node`

## [0.2.0] - 2026-03-29

### Added
- Biome for linting and formatting
- Type checking (`tsc --noEmit`) in CI
- Lint and format checks in CI
- Automated npm publish on GitHub Release (OIDC provenance)
- `npm test` script — runs all 10 integration tests
- `npm run typecheck`, `lint`, `lint:fix`, `format`, `format:check` scripts
- `tests/.env.example` for developer onboarding
- `files` field in package.json — explicit allowlist for published package
- `engines` field requiring Node >= 20

### Fixed
- Tests now use `GWOP_MERCHANT_API_KEY` (matching the SDK's env var), not `GWOP_CHECKOUT_API_KEY`
- CI integration job now runs all 10 tests (was 5)
- Published package no longer includes `tests/`, `FUNCTIONS.md`, `RUNTIMES.md`

### Removed
- `.npmignore` (replaced by `files` field)

## [0.1.1] - 2026-03-26

### Fixed
- `validateWebhook()` HMAC verification and schema parsing

### Added
- Production integration test suite
- Agent-native positioning in README

## [0.1.0] - 2026-03-26

### Added
- Initial SDK release
- Invoice CRUD operations
- Auth intent creation and exchange
- Session management
- JWKS fetching for local JWT verification
- Webhook validation (HMAC-SHA256)
- x402 protocol support

[0.2.2]: https://github.com/gwop-io/gwop-node/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/gwop-io/gwop-node/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/gwop-io/gwop-node/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/gwop-io/gwop-node/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/gwop-io/gwop-node/releases/tag/v0.1.0
