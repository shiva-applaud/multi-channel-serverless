/**
 * Test script for reading emails via Gmail OAuth2
 * 
 * Usage:
 *   npx ts-node src/gmail-oauth/test-read.ts
 */

import { GmailClient } from './gmail-client';

async function testReadEmails() {
  try {
    console.log('📧 Gmail OAuth2 Read Email Test\n');

    const client = new GmailClient();

    // Example 1: List recent emails
    console.log('📋 Listing recent emails...');
    const recentEmails = await client.listEmails(undefined, 10);
    console.log(`Found ${recentEmails.length} emails\n`);

    if (recentEmails.length === 0) {
      console.log('No emails found. Try sending yourself an email first.');
      return;
    }

    // Example 2: List unread emails
    console.log('📋 Listing unread emails...');
    const unreadEmails = await client.listEmails('is:unread', 10);
    console.log(`Found ${unreadEmails.length} unread emails\n`);

    // Example 3: List emails from a specific sender
    console.log('📋 Listing emails from specific sender...');
    const senderEmails = await client.listEmails('from:example@gmail.com', 5);
    console.log(`Found ${senderEmails.length} emails from sender\n`);

    // Example 4: Read a specific email
    if (recentEmails.length > 0) {
      const firstEmailId = recentEmails[0].id!;
      console.log(`📖 Reading email: ${firstEmailId}`);
      
      const email = await client.readEmail(firstEmailId);
      
      // Get headers
      const headers = client.getEmailHeaders(email);
      console.log('\n📧 Email Details:');
      console.log(`   From: ${headers.from || 'Unknown'}`);
      console.log(`   To: ${headers.to || 'Unknown'}`);
      console.log(`   Subject: ${headers.subject || '(No Subject)'}`);
      console.log(`   Date: ${headers.date || 'Unknown'}`);
      if (headers.cc) console.log(`   CC: ${headers.cc}`);
      
      // Get body
      const body = client.decodeBase64Email(email);
      console.log('\n📝 Email Body:');
      if (body.text) {
        console.log('   Text:');
        console.log(`   ${body.text.substring(0, 200)}${body.text.length > 200 ? '...' : ''}`);
      }
      if (body.html) {
        console.log('   HTML:');
        console.log(`   ${body.html.substring(0, 200)}${body.html.length > 200 ? '...' : ''}`);
      }
      
      console.log(`\n   Snippet: ${email.snippet || 'N/A'}`);
      console.log(`   Labels: ${email.labelIds?.join(', ') || 'N/A'}`);
    }

    // Example 5: List emails with date filter
    console.log('\n📋 Listing emails from last 7 days...');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateQuery = `after:${sevenDaysAgo.getFullYear()}/${sevenDaysAgo.getMonth() + 1}/${sevenDaysAgo.getDate()}`;
    const recentEmailsByDate = await client.listEmails(dateQuery, 10);
    console.log(`Found ${recentEmailsByDate.length} emails from last 7 days\n`);

    // Example 6: List emails with attachments
    console.log('📋 Listing emails with attachments...');
    const emailsWithAttachments = await client.listEmails('has:attachment', 5);
    console.log(`Found ${emailsWithAttachments.length} emails with attachments\n`);

    console.log('✅ All tests completed successfully!');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testReadEmails();

