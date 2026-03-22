@echo off
REM Build Ceol.exe for Windows distribution.
REM Run this from the repo root:  desktop\build-windows.bat
REM
REM Requirements:
REM   pip install -r requirements.txt -r desktop\requirements.txt

echo =^> Changing to desktop directory...
pushd "%~dp0"

echo =^> Installing / updating Python dependencies...
pip install -q -r ..\requirements.txt -r requirements.txt
if errorlevel 1 (
    echo ERROR: pip install failed.
    popd & exit /b 1
)

echo =^> Running PyInstaller...
pyinstaller ceol-win.spec --noconfirm
if errorlevel 1 (
    echo ERROR: PyInstaller failed.
    popd & exit /b 1
)

if not exist "dist\Ceol.exe" (
    echo ERROR: build failed - dist\Ceol.exe not found.
    popd & exit /b 1
)

echo.
echo =^> Done!  Distributable: desktop\dist\Ceol.exe
echo.
echo ----------------------------------------------------------------
echo  To open on a Windows PC showing a security warning:
echo    Click "More info" then "Run anyway".
echo ----------------------------------------------------------------
echo.

popd
