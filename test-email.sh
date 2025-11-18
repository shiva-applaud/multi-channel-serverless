#!/bin/bash
# Bash script to test email sending locally
# Usage: ./test-email.sh [to] [subject] [body]

BASE_URL="http://localhost:3000"
TO="${1:-your-email@example.com}"
SUBJECT="${2:-Local Test Email}"
BODY="${3:-This is a test email from local serverless offline.}"

echo "========================================"
echo "Email Testing Script"
echo "========================================"
echo ""

# Check if server is running
echo "Checking if server is running..."
if curl -s -f "$BASE_URL" > /dev/null 2>&1; then
    echo "✓ Server is running"
else
    echo "✗ Server is not running. Please start it with: npm run start"
    exit 1
fi

echo ""
echo "Sending test email..."
echo "  To: $TO"
echo "  Subject: $SUBJECT"
echo ""

# Create JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
  "to": "$TO",
  "subject": "$SUBJECT",
  "body": "$BODY"
}
EOF
)

# Send request
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/email/send" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo ""
if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✓ Email sent successfully!"
    echo ""
    echo "Response:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    
    MESSAGE_ID=$(echo "$BODY" | jq -r '.messageId' 2>/dev/null)
    if [ "$MESSAGE_ID" != "null" ] && [ -n "$MESSAGE_ID" ]; then
        echo ""
        echo "Message ID: $MESSAGE_ID"
    fi
else
    echo "✗ Error sending email"
    echo ""
    echo "HTTP Status: $HTTP_CODE"
    echo "Response: $BODY"
    exit 1
fi

echo ""
echo "========================================"
echo "Test completed!"
echo "========================================"

