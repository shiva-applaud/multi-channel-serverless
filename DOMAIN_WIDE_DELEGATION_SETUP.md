# Domain-Wide Delegation Setup Guide

## Error: "unauthorized_client: Client is unauthorized to retrieve access tokens"

This error occurs when domain-wide delegation is not properly configured for your Google Service Account. Follow these steps to fix it.

## Step-by-Step Setup

### Step 1: Enable Domain-Wide Delegation in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: **emails-478608**
3. Navigate to **IAM & Admin** → **Service Accounts**
4. Find your service account: **applaud-email@emails-478608.iam.gserviceaccount.com**
5. Click on the service account to open details
6. Click **Show Domain-Wide Delegation** checkbox
7. Click **SAVE**
8. Note the **Client ID**: `118265021709709238179`

### Step 2: Add Service Account to Google Workspace Admin Console

1. Go to [Google Admin Console](https://admin.google.com/)
2. Navigate to **Security** → **API Controls** → **Domain-wide Delegation**
3. Click **Add new**
4. Enter the **Client ID**: `118265021709709238179`
5. In **OAuth Scopes**, add these scopes (one per line):
   ```
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.readonly
   ```
6. Click **Authorize**

### Step 3: Verify Configuration

After completing the above steps, wait a few minutes for the changes to propagate, then test again:

```bash
npm run test:email-poll
```

## Required Scopes

Your service account needs these OAuth scopes in Google Workspace Admin Console:

- `https://www.googleapis.com/auth/gmail.send` - To send emails
- `https://www.googleapis.com/auth/gmail.readonly` - To read/list emails

## Troubleshooting

### "Client is unauthorized" Error Still Appears

If you've completed the steps but still get the error, check these common issues:

#### 1. Verify Client ID is Exact Match
- **Common mistake**: Extra spaces, wrong number, or copy-paste errors
- **Your Client ID**: `118265021709709238179`
- **Check**: In Google Workspace Admin, the Client ID must match EXACTLY (no spaces before/after)

#### 2. Verify Scopes are Entered Correctly
The scopes MUST be entered exactly like this (one per line, no extra spaces):

```
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.readonly
```

**Common mistakes:**
- ❌ Extra spaces: ` https://www.googleapis.com/auth/gmail.send` (leading space)
- ❌ Wrong scope: `https://www.googleapis.com/auth/gmail` (incomplete)
- ❌ All on one line: `https://... https://...` (must be separate lines)
- ❌ Missing `https://` prefix
- ❌ Typos in the scope URLs

**Correct format:**
- ✅ Each scope on its own line
- ✅ No leading/trailing spaces
- ✅ Exact match (case-sensitive)

#### 3. Double-Check Domain-Wide Delegation is Enabled
In Google Cloud Console:
1. Go to **IAM & Admin** → **Service Accounts**
2. Click on `applaud-email@emails-478608.iam.gserviceaccount.com`
3. Scroll down to **Domain-wide delegation** section
4. **Verify** the checkbox is checked
5. **Verify** the Client ID shown matches: `118265021709709238179`
6. If not checked, check it and click **SAVE**

#### 4. Try Removing and Re-adding
Sometimes removing and re-adding helps:
1. In Google Workspace Admin → Domain-wide Delegation
2. **Delete** the existing entry for Client ID `118265021709709238179`
3. Wait 2-3 minutes
4. **Add new** entry with the same Client ID and scopes
5. Wait 10-15 minutes before testing

#### 5. Propagation Delay
- Changes can take **5-10 minutes** to propagate (sometimes up to 24 hours)
- After making changes, wait at least 10 minutes before testing
- Try testing again after 30 minutes if it still doesn't work

#### 6. Verify Gmail API is Enabled
1. Go to [Google Cloud Console APIs](https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=emails-478608)
2. Verify **Gmail API** shows "API enabled"
3. If not, click **Enable**

#### 7. Check Google Workspace Admin Permissions
- You need **Super Admin** or **delegated admin** rights
- Regular users cannot configure domain-wide delegation
- Verify you have the correct permissions

#### 8. Verify Workspace Email Domain
- Your workspace email: `hr-help-demo@applaudhr.com`
- Domain: `applaudhr.com`
- Make sure this matches your Google Workspace domain exactly
- The service account can only impersonate users in the same domain

### Verify Service Account Email

Your service account email should be:
```
applaud-email@emails-478608.iam.gserviceaccount.com
```

### Verify Workspace Email

Your workspace email should be:
```
hr-help-demo@applaudhr.com
```

Make sure this email exists in your Google Workspace and the service account has permission to impersonate it.

## Quick Checklist

- [ ] Domain-wide delegation enabled in Google Cloud Console
- [ ] Service account Client ID noted: `118265021709709238179`
- [ ] Service account added in Google Workspace Admin Console
- [ ] Both scopes added correctly in Google Workspace Admin Console
- [ ] Waited 5-10 minutes for changes to propagate
- [ ] Tested again with `npm run test:email-poll`

## Additional Resources

- [Google Workspace Domain-Wide Delegation Documentation](https://developers.google.com/identity/protocols/oauth2/service-account#delegatingauthority)
- [Gmail API Scopes](https://developers.google.com/gmail/api/auth/scopes)

