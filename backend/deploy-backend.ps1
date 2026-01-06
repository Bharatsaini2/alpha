# PowerShell deployment script for Windows

Write-Host "🚀 Deploying Backend Changes..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray

# Build TypeScript
Write-Host "📦 Building TypeScript..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build successful!" -ForegroundColor Green

# Check if PM2 is available
$pm2Exists = Get-Command pm2 -ErrorAction SilentlyContinue

if ($pm2Exists) {
    Write-Host "🔄 Restarting with PM2..." -ForegroundColor Yellow
    pm2 restart all
    Write-Host "✅ PM2 restart complete!" -ForegroundColor Green
    pm2 list
} else {
    Write-Host "⚠️  PM2 not found. Please restart manually:" -ForegroundColor Yellow
    Write-Host "   npm run prod" -ForegroundColor White
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🔍 Test the new endpoints:" -ForegroundColor Cyan
Write-Host "   curl http://localhost:5000/api/v1/alerts/health" -ForegroundColor White
Write-Host ""
