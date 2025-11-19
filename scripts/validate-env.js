/**
 * Helper script to validate .env file configuration
 * Checks if GOOGLE_SERVICE_ACCOUNT_KEY is properly formatted
 */

const fs = require('fs');
const path = require('path');

console.log('=== Validating .env Configuration ===\n');

// Check if .env exists
if (!fs.existsSync('.env')) {
  console.error('❌ ERROR: .env file not found!');
  console.log('\nPlease create a .env file with:');
  console.log('GOOGLE_SERVICE_ACCOUNT_KEY=./path/to/your-service-account-key.json');
  console.log('GOOGLE_WORKSPACE_EMAIL=your-email@yourdomain.com');
  process.exit(1);
}

console.log('✓ .env file found\n');

// Try to load dotenv
try {
  require('dotenv').config();
} catch (e) {
  console.error('❌ ERROR: Could not load dotenv. Install it with: npm install dotenv');
  process.exit(1);
}

// Check required variables
const requiredVars = {
  'GOOGLE_SERVICE_ACCOUNT_KEY': process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  'GOOGLE_WORKSPACE_EMAIL': process.env.GOOGLE_WORKSPACE_EMAIL
};

let hasErrors = false;

for (const [varName, varValue] of Object.entries(requiredVars)) {
  if (!varValue) {
    console.error(`❌ ${varName} is not set`);
    hasErrors = true;
  } else {
    console.log(`✓ ${varName} is set`);
  }
}

if (hasErrors) {
  console.log('\n❌ Validation failed. Please set all required environment variables.');
  process.exit(1);
}

console.log('');

// Validate GOOGLE_SERVICE_ACCOUNT_KEY format
const creds = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
console.log(`Validating GOOGLE_SERVICE_ACCOUNT_KEY format...`);

if (creds.startsWith('{')) {
  // It's a JSON string
  console.log('  Format: JSON string');
  try {
    const parsed = JSON.parse(creds);
    if (parsed.client_email && parsed.private_key) {
      console.log('  ✓ Valid JSON with required fields');
    } else {
      console.error('  ❌ JSON missing required fields (client_email, private_key)');
      hasErrors = true;
    }
  } catch (e) {
    console.error(`  ❌ Invalid JSON: ${e.message}`);
    console.log(`  First 100 characters: ${creds.substring(0, 100)}`);
    hasErrors = true;
  }
} else if (creds.includes('\\') || creds.includes('/') || creds.includes(':')) {
  // It's a file path
  console.log(`  Format: File path`);
  const resolvedPath = path.resolve(creds);
  console.log(`  Path: ${resolvedPath}`);
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(`  ❌ File does not exist: ${resolvedPath}`);
    hasErrors = true;
  } else {
    console.log('  ✓ File exists');
    
    // Try to read and parse the file
    try {
      const fileContent = fs.readFileSync(resolvedPath, 'utf8');
      const trimmed = fileContent.trim();
      
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.client_email && parsed.private_key) {
          console.log('  ✓ File contains valid JSON with required fields');
        } else {
          console.error('  ❌ JSON file missing required fields (client_email, private_key)');
          hasErrors = true;
        }
      } catch (e) {
        console.error(`  ❌ File contains invalid JSON: ${e.message}`);
        console.log(`  First 100 characters: ${trimmed.substring(0, 100)}`);
        hasErrors = true;
      }
    } catch (e) {
      console.error(`  ❌ Could not read file: ${e.message}`);
      hasErrors = true;
    }
  }
} else {
  console.warn('  ⚠ Format unclear. Expected JSON string (starting with {) or file path.');
  console.log(`  Value preview: ${creds.substring(0, 50)}...`);
  
  // Try to parse it anyway
  try {
    const trimmed = creds.trim();
    const parsed = JSON.parse(trimmed);
    if (parsed.client_email && parsed.private_key) {
      console.log('  ✓ Valid JSON (after trimming)');
    } else {
      console.error('  ❌ JSON missing required fields');
      hasErrors = true;
    }
  } catch (e) {
    console.error(`  ❌ Could not parse as JSON: ${e.message}`);
    hasErrors = true;
  }
}

console.log('');

if (hasErrors) {
  console.log('❌ Validation failed. Please fix the issues above.');
  console.log('\nExample .env file format:');
  console.log('---');
  console.log('# Option 1: File path (recommended for local testing)');
  console.log('GOOGLE_SERVICE_ACCOUNT_KEY=./credentials/google-service-account.json');
  console.log('GOOGLE_WORKSPACE_EMAIL=your-email@yourdomain.com');
  console.log('---');
  console.log('# Option 2: JSON string (for AWS Lambda)');
  console.log('GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}');
  console.log('GOOGLE_WORKSPACE_EMAIL=your-email@yourdomain.com');
  process.exit(1);
} else {
  console.log('✅ All validations passed!');
  console.log(`\nYou can now run: npm run test:email-poll`);
}

