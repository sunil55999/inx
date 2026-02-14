@echo off
echo ========================================
echo Frontend Setup Script
echo ========================================
echo.

echo Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

echo Checking npm installation...
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm is not installed!
    pause
    exit /b 1
)

echo npm version:
npm --version
echo.

echo ========================================
echo Step 1: Cleaning old installation
echo ========================================
if exist node_modules (
    echo Removing node_modules...
    rmdir /s /q node_modules
)
if exist package-lock.json (
    echo Removing package-lock.json...
    del package-lock.json
)
echo Clean complete!
echo.

echo ========================================
echo Step 2: Creating .env file
echo ========================================
if not exist .env (
    echo Creating .env from .env.example...
    copy .env.example .env
    echo .env file created!
) else (
    echo .env file already exists
)
echo.

echo ========================================
echo Step 3: Installing dependencies
echo ========================================
echo This may take a few minutes...
echo.
npm install --legacy-peer-deps

if errorlevel 1 (
    echo.
    echo ERROR: Installation failed!
    echo.
    echo Trying alternative method...
    npm install --force
    
    if errorlevel 1 (
        echo.
        echo ERROR: Installation still failed!
        echo.
        echo Please try manually:
        echo   npm install --legacy-peer-deps
        echo.
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo To start the development server, run:
echo   npm start
echo.
echo Or press any key to start now...
pause >nul

echo.
echo Starting development server...
npm start
