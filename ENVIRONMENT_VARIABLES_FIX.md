# Environment Variables 4KB Limit Fix

## Problem

Lambda environment variables exceeded the 4KB limit due to `GOOGLE_SERVICE_ACCOUNT_KEY` being a large JSON string containing private keys.

**Error:**
```
UPDATE_FAILED: QueryApiLambdaFunction (AWS::Lambda::Function)
1 validation error detected: Value 'Lambda was unable to configure your environment variables because the environment variables you have provided exceeded the 4KB limit.
```

## Solution

Moved `GOOGLE_SERVICE_ACCOUNT_KEY` to AWS Secrets Manager to avoid the 4KB limit.

## Changes Made

### 1. Removed from `serverless.yml`
- Removed `GOOGLE_SERVICE_ACCOUNT_KEY` from Lambda environment variables
- Added comment explaining it's now in Secrets Manager

### 2. Updated `src/utils/secretsManager.ts`
- `getSecret()` now automatically parses JSON secrets
- `getGoogleServiceAccount()` checks Secrets Manager first, then falls back to environment variables (for local dev)
- Supports both `google-service-account-key` and `gmail-service-account` secret names (backward compatibility)

### 3. Updated `scripts/store-secrets.ts`
- Now reads `GOOGLE_SERVICE_ACCOUNT_KEY` from environment variables
- Stores it in Secrets Manager as `google-service-account-key`
- Priority: Environment variables > Files

### 4. Code Already Supports Secrets Manager
- `src/utils/gmail.ts` already uses `getGoogleServiceAccount()` which checks Secrets Manager first
- No changes needed to handlers - they automatically use Secrets Manager

## How to Deploy

### Step 1: Store Service Account Key in Secrets Manager

Run the script to store credentials:

```bash
npm run gmail:store-secrets
```

Or manually store it:

```bash
# If you have GOOGLE_SERVICE_ACCOUNT_KEY in .env
npx ts-node scripts/store-secrets.ts

# Or use AWS CLI
aws secretsmanager create-secret \
  --name google-service-account-key \
  --secret-string file://google-service-account.json \
  --region eu-central-1
```

### Step 2: Verify Secrets Manager Access

Ensure your Lambda execution role has Secrets Manager permissions (already configured in `serverless.yml`):

```yaml
iam:
  role:
    statements:
      - Effect: Allow
        Action:
          - secretsmanager:GetSecretValue
          - secretsmanager:PutSecretValue
          - secretsmanager:CreateSecret
          - secretsmanager:UpdateSecret
        Resource: '*'
```

### Step 3: Deploy

```bash
npm run deploy
```

The Lambda functions will now automatically retrieve `GOOGLE_SERVICE_ACCOUNT_KEY` from Secrets Manager instead of environment variables.

## How It Works

### Priority Order (for `GOOGLE_SERVICE_ACCOUNT_KEY`):

1. **AWS Secrets Manager** (`google-service-account-key` or `gmail-service-account`)
2. **Environment Variable** (`GOOGLE_SERVICE_ACCOUNT_KEY`) - for local development only
3. **File Path** - if env var is a file path (local development)

### Code Flow:

```typescript
// In src/utils/gmail.ts
const key = await getGoogleServiceAccount(); // Checks Secrets Manager first
// Falls back to GOOGLE_SERVICE_ACCOUNT_KEY env var if not in Secrets Manager
```

## Benefits

✅ **No 4KB Limit**: Large credentials stored in Secrets Manager  
✅ **Secure**: Credentials encrypted at rest in Secrets Manager  
✅ **Backward Compatible**: Still supports environment variables for local dev  
✅ **Automatic**: Code automatically checks Secrets Manager first  
✅ **No Code Changes**: Existing handlers work without modification  

## Verification

After deployment, check CloudWatch logs to verify:

```
✓ Loaded service account from Secrets Manager
```

If you see this message, Secrets Manager is working correctly.

## Troubleshooting

### "Secret not found in Secrets Manager"

**Solution:** Run `npm run gmail:store-secrets` to store the credentials.

### "Failed to parse service account from Secrets Manager"

**Solution:** Ensure the secret is stored as valid JSON:
```bash
aws secretsmanager get-secret-value --secret-id google-service-account-key
```

### Local Development Still Works

The code still supports `GOOGLE_SERVICE_ACCOUNT_KEY` environment variable for local development. Secrets Manager is only required in AWS Lambda.

## Related Files

- `serverless.yml` - Removed `GOOGLE_SERVICE_ACCOUNT_KEY` from environment
- `src/utils/secretsManager.ts` - Updated to parse JSON automatically
- `src/utils/gmail.ts` - Already uses Secrets Manager (no changes needed)
- `scripts/store-secrets.ts` - Updated to store from env vars

