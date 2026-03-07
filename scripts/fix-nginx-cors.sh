#!/bin/bash
# Fix nginx CORS for admin.tableshare.ai portal
# Run this ON THE SERVER (SSH in first): sudo bash fix-nginx-cors.sh
# Removes nginx's CORS headers so Node.js handles CORS (with correct origin for credentials)

set -e

echo "=== Nginx CORS Fix for TableShare Portal ==="
echo ""

# Find config files that contain CORS headers
echo "1. Finding nginx configs with CORS headers..."
FILES=$(grep -rl "Access-Control\|add_header" /etc/nginx/ 2>/dev/null | grep -v "\.default\|\.bak" || true)

if [ -z "$FILES" ]; then
  echo "   No CORS headers found in nginx. Checking all enabled sites..."
  FILES="/etc/nginx/sites-enabled/*"
fi

# Backup
BACKUP_DIR="/root/nginx-backup-$(date +%Y%m%d-%H%M%S)"
echo ""
echo "2. Creating backup at $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
for f in /etc/nginx/sites-enabled/* /etc/nginx/sites-available/* 2>/dev/null; do
  [ -f "$f" ] && cp "$f" "$BACKUP_DIR/" 2>/dev/null || true
done
echo "   Backup done."

# Comment out add_header lines that set CORS (so Node handles it)
echo ""
echo "3. Commenting out nginx CORS headers (Node will handle CORS)..."
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null; do
  if [ -f "$f" ] && grep -q "add_header.*Access-Control\|add_header.*access-control" "$f" 2>/dev/null; then
    echo "   Editing: $f"
    sed -i.bak -E '/add_header.*[Aa]ccess-[Cc]ontrol/s/^([[:space:]]*)([^#].*)/\1# CORS disabled - Node handles: \2/' "$f"
  fi
done

# Also handle "if ($request_method = OPTIONS)" blocks that return 204 with CORS
# These prevent OPTIONS from reaching Node - we need to remove or modify them
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null; do
  if [ -f "$f" ] && grep -q "request_method.*OPTIONS" "$f" 2>/dev/null; then
    echo "   Found OPTIONS handler in: $f"
    echo "   NOTE: If OPTIONS returns 204 with CORS, it blocks Node. You may need to remove that block manually."
  fi
done

echo ""
echo "4. Testing nginx config..."
if nginx -t 2>/dev/null; then
  echo ""
  echo "5. Reloading nginx..."
  systemctl reload nginx
  echo ""
  echo "=== Done! Test the portal at admin.tableshare.ai ==="
else
  echo ""
  echo "!!! nginx -t FAILED. Restoring backup..."
  for f in "$BACKUP_DIR"/*; do
    [ -f "$f" ] && cp "$f" /etc/nginx/sites-enabled/ 2>/dev/null || cp "$f" /etc/nginx/sites-available/ 2>/dev/null || true
  done
  echo "   Restored. Fix the config manually and run: sudo nginx -t && sudo systemctl reload nginx"
  exit 1
fi
