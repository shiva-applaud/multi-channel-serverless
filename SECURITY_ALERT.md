# ⚠️ SECURITY ALERT - Credentials Exposed

## Critical Issue Found

**Real credentials were found hardcoded in `scripts/setup-gmail-watch.js`:**

1. ✅ **FIXED**: Google OAuth2 Client ID and Secret have been removed from the code
2. ⚠️ **ACTION REQUIRED**: You must rotate/revoke these credentials immediately

## Exposed Credentials

The following credentials were exposed in the code:

- **Google OAuth2 Client ID**: `903516254980-r45tb1cpu9ln9n8jhfhdl71nf4h0s51t.apps.googleusercontent.com`
- **Google OAuth2 Client Secret**: `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`
- **Google Cloud Project ID**: `emails-478608` (from topic name)

## Immediate Actions Required

### 1. Revoke/Rotate Google OAuth2 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Find the OAuth 2.0 Client ID: `903516254980-r45tb1cpu9ln9n8jhfhdl71nf4h0s51t`
4. **Delete or regenerate** the client secret
5. Create a new OAuth 2.0 Client ID if needed

### 2. Check Git History

If this code was committed to Git:

```bash
# Check if credentials are in git history
git log --all --full-history -- scripts/setup-gmail-watch.js

# If committed, you need to:
# 1. Remove from git history (using git filter-branch or BFG Repo-Cleaner)
# 2. Force push (if already pushed to remote)
# 3. Rotate credentials anyway
```

### 3. Update Environment Variables

The file has been fixed to use environment variables. Update your `.env` file:

```env
GOOGLE_CLIENT_ID=your_new_client_id_here
GOOGLE_CLIENT_SECRET=your_new_client_secret_here
GOOGLE_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/YOUR_TOPIC_NAME
```

### 4. Check for Other Exposed Secrets

Review your entire codebase for any other hardcoded credentials:

```bash
# Search for potential secrets
grep -r "GOCSPX-" .
grep -r "client_secret" .
grep -r "private_key" .
```

## Prevention

### Best Practices

1. ✅ **Never commit credentials** to version control
2. ✅ **Use environment variables** for all secrets
3. ✅ **Add `.env` to `.gitignore`**
4. ✅ **Use AWS Secrets Manager** or similar for production
5. ✅ **Use pre-commit hooks** to scan for secrets
6. ✅ **Review code before committing**

### Recommended Tools

- **git-secrets** - Prevents committing secrets
- **truffleHog** - Scans for secrets in git history
- **AWS Secrets Manager** - For production secrets
- **GitGuardian** - Continuous secret scanning

## Status

- ✅ Code fixed to use environment variables
- ⚠️ **YOU MUST ROTATE THE EXPOSED CREDENTIALS**

## Additional Resources

- [Google Cloud Security Best Practices](https://cloud.google.com/security/best-practices)
- [OWASP Secrets Management](https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_cryptographic_key)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)

