#!/bin/bash

echo "🚀 Deploying Backend Changes..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Build TypeScript
echo "📦 Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful!"

# Check if PM2 is available
if command -v pm2 &> /dev/null; then
    echo "🔄 Restarting with PM2..."
    pm2 restart all
    echo "✅ PM2 restart complete!"
    pm2 list
else
    echo "⚠️  PM2 not found. Please restart manually:"
    echo "   npm run prod"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment complete!"
echo ""
echo "🔍 Test the new endpoints:"
echo "   curl http://localhost:5000/api/v1/alerts/health"
echo ""
