# Domain-Wide Delegation Troubleshooting Guide

## Still Getting "unauthorized_client" Error?

If you've followed the setup steps but still get the error, use this checklist:

## Quick Verification

Run this command to see your current configuration:
```bash
npm run verify-delegation
```

## Step-by-Step Verification

### Step 1: Verify Google Cloud Console Settings

1. **Go to**: https://console.cloud.google.com/iam-admin/serviceaccounts?project=emails-478608
2. **Find**: `applaud-email@emails-478608.iam.gserviceaccount.com`
3. **Click** on the service account
4. **Scroll down** to "Domain-wide delegation" section
5. **Verify**:
   - ✅ Checkbox is **checked**
   - ✅ Client ID shown is: `118265021709709238179`
   - ✅ Status shows as enabled

**If checkbox is NOT checked:**
- Check the box
- Click **SAVE**
- Wait 2-3 minutes

### Step 2: Verify Google Workspace Admin Console

1. **Go to**: https://admin.google.com/ac/owl
2. **Navigate to**: Security → API Controls → Domain-wide Delegation
3. **Look for** Client ID: `118265021709709238179`

**If entry exists:**
- Click on it to edit
- **Verify scopes** are exactly:
  ```
  https://www.googleapis.com/auth/gmail.send
  https://www.googleapis.com/auth/gmail.readonly
  ```
- Each scope should be on its own line
- No extra spaces before/after
- No typos

**If entry does NOT exist:**
- Click **Add new**
- Enter Client ID: `118265021709709238179`
- Add scopes (one per line):
  ```
  https://www.googleapis.com/auth/gmail.send
  https://www.googleapis.com/auth/gmail.readonly
  ```
- Click **Authorize**

### Step 3: Common Mistakes to Avoid

#### ❌ Wrong: Client ID with spaces
```
118265021709709238179  ← extra space at end
```

#### ✅ Correct: Client ID exact match
```
118265021709709238179
```

#### ❌ Wrong: Scopes with extra spaces
```
 https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.readonly 
```

#### ✅ Correct: Scopes exactly as shown
```
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.readonly
```

#### ❌ Wrong: Scopes on one line
```
https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly
```

#### ✅ Correct: Each scope on separate line
```
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.readonly
```

### Step 4: Try This Fix Sequence

1. **Remove** the delegation entry in Google Workspace Admin
2. **Wait** 2-3 minutes
3. **Verify** domain-wide delegation is enabled in Google Cloud Console
4. **Re-add** the delegation entry in Google Workspace Admin
5. **Double-check** Client ID and scopes are exact
6. **Wait** 10-15 minutes
7. **Test** again: `npm run test:email-poll`

### Step 5: Verify Gmail API is Enabled

1. Go to: https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=emails-478608
2. Verify it shows "API enabled"
3. If not, click **Enable** and wait 2-3 minutes

### Step 6: Check Propagation Time

- **Minimum wait**: 5-10 minutes after making changes
- **Recommended wait**: 15-30 minutes
- **Maximum wait**: Up to 24 hours in rare cases

If it still doesn't work after 30 minutes, try:
- Removing and re-adding the delegation
- Verifying all settings again
- Checking if you have Super Admin rights

## Still Not Working?

### Option 1: Create New Service Account

Sometimes starting fresh helps:
1. Create a new service account in Google Cloud Console
2. Enable domain-wide delegation
3. Note the new Client ID
4. Add it to Google Workspace Admin with the scopes
5. Update your `.env` file with the new service account JSON

### Option 2: Verify Workspace Email

Make sure `shiva.prabhakar@applaudhr.com`:
- Exists in your Google Workspace
- Is an active account
- Domain matches your Google Workspace domain exactly

### Option 3: Check Admin Permissions

- You need **Super Admin** rights in Google Workspace
- Regular admin or user accounts cannot configure domain-wide delegation
- Verify your account has the correct permissions

## Test After Fixes

After making any changes:
```bash
npm run build
npm run test:email-poll
```

## Need More Help?

1. Run verification: `npm run verify-delegation`
2. Check the error message - it should show your Client ID
3. Double-check all settings match exactly
4. Wait at least 15 minutes after making changes

