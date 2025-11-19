# PowerShell script to test webhookEmail Lambda function locally
# Simulates an EventBridge scheduled event

param(
    [int]$MaxResults = 10,
    [string]$Query = "",
    [switch]$IncludeFullBody
)

Write-Host "=== Testing webhookEmail Lambda Locally ===" -ForegroundColor Green
Write-Host ""

# Build the project first
Write-Host "Building TypeScript project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Invoking handler with EventBridge event..." -ForegroundColor Yellow
Write-Host ""

# Create the test event JSON
$eventDetail = @{
    maxResults = $MaxResults
}

if ($Query) {
    $eventDetail.query = $Query
}

if ($IncludeFullBody) {
    $eventDetail.includeFullBody = $true
}

$mockEvent = @{
    version = "0"
    id = "test-event-id-$(Get-Date -Format 'yyyyMMddHHmmss')"
    "detail-type" = "Scheduled Event"
    source = "aws.events"
    account = "123456789012"
    time = (Get-Date).ToUniversalTime().ToString("o")
    region = "eu-central-1"
    resources = @(
        "arn:aws:events:eu-central-1:123456789012:rule/test-rule"
    )
    detail = $eventDetail
} | ConvertTo-Json -Depth 10

Write-Host "EventBridge Event:" -ForegroundColor Cyan
Write-Host $mockEvent
Write-Host ""

# Run the Node.js test script
node scripts/test-webhookEmail-local.js --maxResults $MaxResults @(
    if ($Query) { "--query"; $Query }
    if ($IncludeFullBody) { "--includeFullBody" }
)

