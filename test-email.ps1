# PowerShell script to test email sending locally
# Usage: .\test-email.ps1

param(
    [string]$To = "your-email@example.com",
    [string]$Subject = "Local Test Email",
    [string]$Body = "This is a test email from local serverless offline.",
    [switch]$Html = $false
)

$baseUrl = "http://localhost:3000"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Email Testing Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if server is running
Write-Host "Checking if server is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl" -Method GET -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✓ Server is running" -ForegroundColor Green
} catch {
    Write-Host "✗ Server is not running. Please start it with: npm run start" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Sending test email..." -ForegroundColor Yellow
Write-Host "  To: $To" -ForegroundColor Gray
Write-Host "  Subject: $Subject" -ForegroundColor Gray
Write-Host "  HTML: $Html" -ForegroundColor Gray
Write-Host ""

$emailBody = @{
    to = $To
    subject = $Subject
    body = $Body
    html = $Html
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/email/send" `
        -Method POST `
        -ContentType "application/json" `
        -Body $emailBody
    
    Write-Host "✓ Email sent successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    Write-Host ($response | ConvertTo-Json -Depth 10)
    
    if ($response.success -and $response.messageId) {
        Write-Host ""
        Write-Host "Message ID: $($response.messageId)" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Error sending email:" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
        Write-Host "Response: $responseBody" -ForegroundColor Red
    } else {
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
    
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test completed!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

