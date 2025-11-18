# Troubleshooting Guide

## Windows File Lock Error (EBUSY)

### Problem
When deploying on Windows, you may encounter:
```
Error: EBUSY: resource busy or locked, rmdir 'C:\Users\...\.build\node_modules\...'
```

### Solution

The deployment script now automatically cleans the `.build` directory before deploying. If you still encounter this issue:

1. **Close File Explorer**: If you have the project folder open in Windows File Explorer, close it.

2. **Close IDE/Editor**: Close any IDE or editor windows that might have files open from the `.build` directory.

3. **Disable Antivirus Temporarily**: Some antivirus software locks files during scanning. Temporarily disable real-time scanning for the project directory.

4. **Manual Cleanup**: Run the cleanup script manually:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/clean-build.ps1
   ```

5. **Force Remove**: If the script doesn't work, manually delete the `.build` folder:
   ```powershell
   Remove-Item -Path ".build" -Recurse -Force
   ```

6. **Restart and Retry**: After cleaning, try deploying again:
   ```bash
   npm run deploy
   ```

### Prevention

The following have been configured to prevent this issue:
- ✅ `.build` directory added to `.gitignore`
- ✅ Pre-deploy script automatically cleans `.build` directory
- ✅ TypeScript plugin configuration optimized

## Other Common Issues

### Environment Variables Not Loading

**Problem**: Lambda functions don't have environment variables set.

**Solution**:
1. Verify `.env` file exists in root directory
2. Check that `serverless-dotenv-plugin` is in `plugins` section
3. Ensure `.env` file has no syntax errors
4. Verify variables are set (no empty values)

### AWS Credentials Not Configured

**Problem**: Deployment fails with AWS authentication errors.

**Solution**:
```bash
aws configure
```

Provide:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (e.g., `us-east-1`)
- Default output format (e.g., `json`)

### TypeScript Compilation Errors

**Problem**: TypeScript compilation fails during deployment.

**Solution**:
1. Build locally first to see errors:
   ```bash
   npm run build
   ```
2. Fix any TypeScript errors
3. Try deploying again

### API Gateway Endpoints Not Working

**Problem**: Deployed endpoints return errors.

**Solution**:
1. Check CloudWatch Logs:
   ```bash
   serverless logs -f functionName -t
   ```
2. Verify environment variables are set in AWS Console
3. Check API Gateway configuration in AWS Console
4. Verify CORS settings if calling from browser

### Lambda Timeout Errors

**Problem**: Functions timeout before completing.

**Solution**:
- Increase timeout in `serverless.yml`:
  ```yaml
  provider:
    timeout: 60  # Increase from 30 to 60 seconds
  ```

### Memory Errors

**Problem**: Functions run out of memory.

**Solution**:
- Increase memory in `serverless.yml`:
  ```yaml
  provider:
    memorySize: 512  # Increase from 256 to 512 MB
  ```

## Getting Help

- Check CloudWatch Logs for detailed error messages
- Review AWS Lambda function logs in AWS Console
- Verify all environment variables are set correctly
- Ensure Twilio credentials are valid

