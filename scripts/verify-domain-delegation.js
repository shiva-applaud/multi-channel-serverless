/**
 * Verification script to check domain-wide delegation setup
 * Helps diagnose why domain-wide delegation might not be working
 */

const fs = require('fs');
const path = require('path');

console.log('=== Domain-Wide Delegation Verification ===\n');

// Load environment variables
try {
  if (fs.existsSync('.env')) {
    require('dotenv').config();
  }
} catch (e) {
  console.warn('Could not load .env file');
}

// Get service account info
let serviceAccountEmail = 'unknown';
let clientId = 'unknown';
let workspaceEmail = process.env.GOOGLE_WORKSPACE_EMAIL || 'not set';

try {
  const credsPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credsPath) {
    console.error('❌ GOOGLE_SERVICE_ACCOUNT_KEY is not set');
    process.exit(1);
  }

  let keyContent;
  if (credsPath.startsWith('{')) {
    keyContent = credsPath;
  } else {
    const resolvedPath = path.resolve(credsPath);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`❌ Service account file not found: ${resolvedPath}`);
      process.exit(1);
    }
    keyContent = fs.readFileSync(resolvedPath, 'utf8');
  }

  const key = JSON.parse(keyContent.trim());
  serviceAccountEmail = key.client_email;
  clientId = key.client_id;

  console.log('✓ Service Account Configuration:');
  console.log(`  Email: ${serviceAccountEmail}`);
  console.log(`  Client ID: ${clientId}`);
  console.log(`  Project ID: ${key.project_id}`);
  console.log(`  Workspace Email: ${workspaceEmail}\n`);

} catch (error) {
  console.error('❌ Error reading service account:', error.message);
  process.exit(1);
}

console.log('=== Verification Checklist ===\n');

console.log('1. Google Cloud Console - Service Account Settings:');
console.log(`   [ ] Go to: https://console.cloud.google.com/iam-admin/serviceaccounts?project=${serviceAccountEmail.split('@')[1].split('.')[0]}`);
console.log(`   [ ] Find service account: ${serviceAccountEmail}`);
console.log(`   [ ] Click on the service account`);
console.log(`   [ ] Check "Show Domain-Wide Delegation" checkbox`);
console.log(`   [ ] Click "SAVE"`);
console.log(`   [ ] Verify Client ID matches: ${clientId}\n`);

console.log('2. Google Workspace Admin Console - Domain-Wide Delegation:');
console.log('   [ ] Go to: https://admin.google.com/ac/owl');
console.log('   [ ] Navigate to: Security → API Controls → Domain-wide Delegation');
console.log(`   [ ] Click "Add new"`);
console.log(`   [ ] Enter Client ID: ${clientId}`);
console.log('   [ ] In OAuth Scopes, add these EXACTLY (one per line, no spaces):');
console.log('        https://www.googleapis.com/auth/gmail.send');
console.log('        https://www.googleapis.com/auth/gmail.readonly');
console.log('   [ ] Click "Authorize"\n');

console.log('3. Common Issues to Check:');
console.log('   [ ] Client ID entered correctly (no spaces, exact match)');
console.log('   [ ] Scopes entered exactly as shown above (copy-paste recommended)');
console.log('   [ ] Each scope on a separate line');
console.log('   [ ] No extra spaces or characters');
console.log('   [ ] Waited at least 5-10 minutes after making changes');
console.log(`   [ ] Workspace email "${workspaceEmail}" exists and is active`);
console.log(`   [ ] Workspace email domain matches your Google Workspace domain\n`);

console.log('4. Verification Steps:');
console.log('   a) Double-check Client ID in Google Cloud Console matches:');
console.log(`      ${clientId}`);
console.log('   b) Double-check Client ID in Google Workspace Admin matches exactly');
console.log('   c) Verify scopes are entered correctly (case-sensitive)');
console.log('   d) Try removing and re-adding the delegation');
console.log('   e) Wait 10-15 minutes and test again\n');

console.log('=== Quick Test ===\n');
console.log('After completing the above steps, run:');
console.log('  npm run build');
console.log('  npm run test:email-poll\n');

console.log('=== If Still Not Working ===\n');
console.log('1. Verify the service account email domain matches your project:');
console.log(`   Service Account: ${serviceAccountEmail}`);
console.log(`   Project: ${serviceAccountEmail.split('@')[1].split('.')[0]}\n`);

console.log('2. Check if you have Super Admin or delegated admin rights in Google Workspace');
console.log('3. Try creating a new service account and setting it up from scratch');
console.log('4. Verify Gmail API is enabled in Google Cloud Console:\n');
console.log(`   https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=${serviceAccountEmail.split('@')[1].split('.')[0]}\n`);

console.log('=== Current Configuration Summary ===');
console.log(`Service Account: ${serviceAccountEmail}`);
console.log(`Client ID: ${clientId}`);
console.log(`Workspace Email: ${workspaceEmail}`);
console.log(`Required Scopes:`);
console.log(`  - https://www.googleapis.com/auth/gmail.send`);
console.log(`  - https://www.googleapis.com/auth/gmail.readonly`);

