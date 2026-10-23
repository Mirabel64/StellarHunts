# Changelog

All notable changes to StellarHunts are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release sections are generated from [Conventional Commits](https://www.conventionalcommits.org/)
by `scripts/changelog.mjs`; the release procedure is documented in
[RELEASE.md](RELEASE.md).

## [Unreleased]

## [0.1.0] - 2026-10-18

### Added

- Puzzle gameplay with on-chain NFT rewards on Stellar / Soroban.
- Stellar wallet signature login with single-use challenges, replay protection,
  expiring session tokens, and proof-based wallet linking.
- GDPR-style JSON export of a signed-in user's personal data, with credential
  redaction and per-account rate limiting.
- WCAG 2.1 AA accessibility pass for the core flows: skip link, one main
  landmark per page, labelled navigation controls, keyboard-operable mobile
  menu, accessible search and pagination controls, and live-region status
  messages.
- Semver release process with an automated conventional-commit changelog and a
  tag-aware release workflow.
