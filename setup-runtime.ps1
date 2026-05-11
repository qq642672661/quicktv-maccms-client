$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

Write-Host "Killing ADB server..." -ForegroundColor Yellow
& $ADB kill-server
Start-Sleep -Seconds 2

Write-Host "Starting ADB server..." -ForegroundColor Yellow
& $ADB start-server
Start-Sleep -Seconds 2

Write-Host "Connecting to box (192.168.10.122)..." -ForegroundColor Yellow
& $ADB connect 192.168.10.122
Start-Sleep -Seconds 3

Write-Host "Configuring debug server (192.168.10.133)..." -ForegroundColor Yellow
& $ADB shell am broadcast -a com.extscreen.runtime.ACTION_CHANGE_DEBUG_SERVER --es ip 192.168.10.133

Write-Host ""
Write-Host "Done! Now open QuickTVUI Runtime on your box and click '加载测试代码'" -ForegroundColor Green
