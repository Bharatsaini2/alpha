# Start Backend Locally with V2 Parser Configuration
Write-Host "🚀 Starting Backend Locally with V2 Parser..." -ForegroundColor Cyan

# Step 1: Build the TypeScript code
Write-Host "`n📦 Building TypeScript code..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

# Step 2: Apply V2 parser configuration
Write-Host "`n🔧 Ensuring V2 parser configuration is applied..." -ForegroundColor Yellow
node fix-parser-to-v2-only.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ V2 configuration failed!" -ForegroundColor Red
    exit 1
}

# Step 3: Check Redis is running
Write-Host "`n🔍 Checking Redis status..." -ForegroundColor Yellow
$redisProcess = Get-Process -Name "redis-server" -ErrorAction SilentlyContinue
if (-not $redisProcess) {
    Write-Host "⚠️  Redis not running. Starting Redis..." -ForegroundColor Yellow
    Start-Process -FilePath "redis-server" -WindowStyle Hidden
    Start-Sleep -Seconds 3
} else {
    Write-Host "✅ Redis is already running" -ForegroundColor Green
}

# Step 4: Start the backend
Write-Host "`n🚀 Starting backend with V2 parser..." -ForegroundColor Green
Write-Host "📊 Parser Configuration:" -ForegroundColor Cyan
Write-Host "  - Version: V2 ONLY" -ForegroundColor Green
Write-Host "  - Core Token Suppression: ENABLED" -ForegroundColor Green
Write-Host "  - Rent Refund Filtering: ENABLED" -ForegroundColor Green
Write-Host "  - Multi-hop Collapse: ENABLED" -ForegroundColor Green
Write-Host "  - Enhanced Amount Normalization: ENABLED" -ForegroundColor Green

Write-Host "`n🔍 Watch for these improvements in the logs:" -ForegroundColor Yellow
Write-Host "  ✅ 'V2 parser' or 'ShyftParserV2' messages" -ForegroundColor Gray
Write-Host "  ✅ Reduced 'Unknown' token symbols" -ForegroundColor Gray
Write-Host "  ✅ Better SOL/WSOL handling" -ForegroundColor Gray
Write-Host "  ✅ Proper stable coin splitting" -ForegroundColor Gray
Write-Host "  ✅ More accurate amount calculations" -ForegroundColor Gray

Write-Host "`n🎯 Starting backend now..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the backend`n" -ForegroundColor Yellow

# Start the backend
npm run dev