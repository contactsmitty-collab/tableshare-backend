#!/bin/bash
# Deploy portal files (admin + restaurant) to the server.
# Run from tableshare-backend:  bash deploy-portals.sh
# Or from anywhere:             bash /path/to/tableshare-backend/deploy-portals.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_PORTALS="${SCRIPT_DIR}/portals"
SERVER="${PORTALS_SERVER:-root@165.227.179.81}"
PORTALS_DIR="${PORTALS_REMOTE_DIR:-/opt/tableshare-backend/portals}"

echo "🚀 Deploying TableShare Portals to Server"
echo "=========================================="
echo "   From: $LOCAL_PORTALS"
echo "   To:   $SERVER:$PORTALS_DIR"
echo ""

if [ ! -d "$LOCAL_PORTALS" ]; then
    echo "❌ Portals directory not found: $LOCAL_PORTALS"
    exit 1
fi

echo "📦 Creating portals directory on server..."
ssh $SERVER "mkdir -p $PORTALS_DIR"

echo "📤 Uploading portal files..."
scp "$LOCAL_PORTALS"/* $SERVER:$PORTALS_DIR/

echo "✅ Portals deployed!"
echo ""
echo "🌐 Access: https://tableshare.pixelcheese.com (or http://165.227.179.81:3000)"
echo ""
echo "💡 Restart the backend so it serves the new files:"
echo "   ssh $SERVER 'cd /opt/tableshare-backend && (pm2 restart tableshare-api 2>/dev/null || npm run start)'"
