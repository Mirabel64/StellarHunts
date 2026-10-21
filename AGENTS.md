# Development Guidelines

## Pre-commit Hooks

This project uses pre-commit hooks to prevent security issues and maintain code quality:

### Security Hooks
- **Gitleaks**: Detects hardcoded secrets, API keys, and credentials before they're committed
- **detect-private-key**: Identifies accidentally committed private keys

### Code Quality Hooks
- **trailing-whitespace**: Removes trailing whitespace
- **end-of-file-fixer**: Ensures files end with a newline
- **check-yaml/check-json/check-toml**: Validates configuration files
- **check-added-large-files**: Prevents committing files >1MB
- **mixed-line-ending**: Enforces LF line endings

### Setup

```bash
# Install pre-commit (one-time)
python3 -m pip install pre-commit

# Install git hooks
pre-commit install
```

### Manual Usage

```bash
# Run all hooks on all files
pre-commit run --all-files

# Run a specific hook
pre-commit run gitleaks --all-files
```

### Bypassing Hooks

To skip hooks temporarily (not recommended for security hooks):

```bash
git commit --no-verify
```

### Configuration Files
- `.pre-commit-config.yaml` - Hook definitions and versions
- `.gitleaks.toml` - Gitleaks detection rules and allowlists

## Build Commands

```bash
# Full CI pipeline
npm run ci

# Individual checks
npm run lint          # Lint backend and frontend
npm run test          # Run all tests
npm run build         # Build backend and frontend
npm run fmt:onchain   # Check Rust formatting
```

## Project Structure

- `backend/` - NestJS backend API
- `frontend/` - Next.js frontend
- `onchain/` - Rust smart contracts (Soroban)
- `.github/workflows/` - CI/CD workflows
