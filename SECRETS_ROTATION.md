# Secrets Rotation Guide

## Historical Secrets Found

### Hardcoded Fallback Secrets (Development Only)

The following files contained hardcoded fallback secrets that have been removed:

#### 1. JWT Secret Fallbacks

**File:** `backend/src/auth/strategies/jwt.strategy.ts`
- **Issue:** Used `'your-secret-key'` as fallback if `JWT_SECRET` environment variable was not set
- **Impact:** This was a development fallback that could be used in production if env var was missing
- **Fixed:** Changed to `configService.getOrThrow('JWT_SECRET')` to require the environment variable

**File:** `backend/src/admin/admin-auth.module.ts`
- **Issue:** Used `'supersecret'` as fallback for admin JWT secret
- **Impact:** Weak hardcoded secret for admin authentication
- **Fixed:** Changed to use `ConfigService.getOrThrow()` to require environment variable

### API Key Service

**File:** `backend/src/api-key/api-key.service.ts`
- **Status:** Secure implementation
- **Details:** Uses SHA-256 hashing with constant-time comparison. Raw secrets are never stored.
- **No action needed:** This implementation follows security best practices

## Recommended Actions

### 1. Rotate JWT Secret (High Priority)

If you have deployed to production with the old fallback secrets, you should:

1. Generate a new strong JWT secret:
   ```bash
   # Generate a cryptographically secure random secret
   openssl rand -base64 64
   ```

2. Update your environment variables:
   ```bash
   # In your .env file or production environment
   JWT_SECRET=<new-64-byte-secret>
   ```

3. Rotate existing tokens:
   - Invalidate all existing JWT tokens by updating the secret
   - Users will need to re-authenticate
   - Consider implementing a grace period if needed

### 2. Environment Variable Validation

Ensure all required environment variables are set:

```bash
# Required environment variables
JWT_SECRET=<your-secure-secret>
```

See `backend/src/auth/auth.module.ts` for the complete environment variable schema.

### 3. Pre-commit and CI Protection

Now that gitleaks is configured:

- **Pre-commit hooks** will block commits containing secrets
- **CI security scan** runs on every PR and push to main
- Both use the same `.gitleaks.toml` configuration

### 4. Secret Storage Best Practices

- Never commit `.env` files (already in `.gitignore`)
- Use environment variables or secret management services
- Rotate secrets regularly (quarterly or upon compromise)
- Use different secrets for development, staging, and production
- Never hardcode secrets in code

### 5. Audit Git History

The pre-commit and CI gitleaks scans will scan the full git history. If any secrets were committed previously:

1. Check if they're still in active use
2. If yes, rotate them immediately
3. Use `git filter-repo` or `BFG Repo-Cleaner` to remove from history (advanced)
4. Force push to cleaned history (coordinating with team)

## Gitleaks Configuration

The `.gitleaks.toml` file is configured to:
- Use default gitleaks rules (comprehensive secret detection)
- Allowlist common build artifacts and dependencies
- Exclude `node_modules`, `dist`, `build`, `.next`, `target`, `.git`, `.DS_Store`

If you encounter false positives, add paths to the `[allowlist]` section in `.gitleaks.toml`.

## Verification

### Test Gitleaks Locally

```bash
# Run gitleaks on current repository
./gitleaks git --redact --no-banner --exit-code=1 --config .gitleaks.toml

# Run pre-commit hooks (includes gitleaks)
pre-commit run --all-files
```

### Test Gitleaks in CI

The security workflow runs automatically on:
- Pull requests to main
- Pushes to main
- Weekly scheduled runs (Mondays at 2:30 AM UTC)

Check the "Security" tab in GitHub for scan results.

## Monitoring

Monitor the following for secret leaks:
- GitHub Security tab (for CodeQL and Gitleaks findings)
- CI workflow logs (security.yml)
- Pre-commit hook failures during development

## Response to Secret Leaks

If a secret is detected:

1. **Immediate Actions:**
   - Rotate the leaked secret immediately
   - Revoke any API keys or tokens
   - Change any exposed credentials

2. **Repository Cleanup:**
   - Remove the secret from the code
   - Commit the fix
   - Consider removing from git history if the secret is critical

3. **Post-Incident:**
   - Audit access logs for the period the secret was exposed
   - Document the incident
   - Review procedures to prevent recurrence

## References

- [Gitleaks Documentation](https://github.com/gitleaks/gitleaks)
- [OWASP Secret Scanning](https://owasp.org/www-community/Secrets_Detection_Project)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
