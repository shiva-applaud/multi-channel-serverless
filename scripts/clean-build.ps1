# PowerShell script to clean .build directory on Windows
# This helps avoid EBUSY errors during deployment

Write-Host "Cleaning .build directory..." -ForegroundColor Yellow

if (Test-Path ".build") {
    try {
        # Close any handles that might be locking files
        Start-Sleep -Milliseconds 500
        
        # Remove directory with retry logic
        $maxRetries = 3
        $retryCount = 0
        $removed = $false
        
        while ($retryCount -lt $maxRetries -and -not $removed) {
            try {
                Remove-Item -Path ".build" -Recurse -Force -ErrorAction Stop
                $removed = $true
                Write-Host "Successfully removed .build directory" -ForegroundColor Green
            } catch {
                $retryCount++
                if ($retryCount -lt $maxRetries) {
                    Write-Host "Retry $retryCount/$maxRetries - Waiting before retry..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 2
                } else {
                    Write-Host "Warning: Could not remove .build directory. You may need to close file explorer or other processes accessing it." -ForegroundColor Red
                    Write-Host "Error: $_" -ForegroundColor Red
                }
            }
        }
    } catch {
        Write-Host "Error cleaning .build directory: $_" -ForegroundColor Red
    }
} else {
    Write-Host ".build directory does not exist, skipping cleanup" -ForegroundColor Green
}

