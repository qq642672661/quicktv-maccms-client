@echo off
set ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe

echo Killing ADB server...
"%ADB%" kill-server
timeout /t 2 /nobreak >nul

echo Starting ADB server...
"%ADB%" start-server
timeout /t 2 /nobreak >nul

echo Connecting to box...
"%ADB%" connect 192.168.10.122
timeout /t 3 /nobreak >nul

echo Configuring debug server...
"%ADB%" shell am broadcast -a com.extscreen.runtime.ACTION_CHANGE_DEBUG_SERVER --es ip 192.168.10.133

echo.
echo Done! Now open QuickTVUI Runtime on your box and click "加载测试代码"
pause
