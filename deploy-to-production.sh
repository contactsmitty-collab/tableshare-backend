#!/bin/bash

# TableShare Backend - Production Deployment Script
# Server: 165.227.179.81

set -e

SERVER_IP="165.227.179.81"
SERVER_USER="root"
DEPLOY_PATH="/opt/tableshare-backend"
BACKUP_PATH="/opt/tableshare-backend-backup-$(date +%Y%m%d_%H%M%S)"

echo "🚀 Deploying TableShare Backend to Production"
echo "=============================================="
echo "Server: $SERVER_IP"
echo "Path: $DEPLOY_PATH"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Run this from tableshare-backend directory."
    exit 1
fi

# Create deployment package (exclude .env so server keeps its own secrets)
echo "📦 Creating deployment package..."
tar --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='logs' \
    --exclude='uploads' \
    --exclude='*.log' \
    -czf /tmp/tableshare-backend-deploy.tar.gz .

echo "✅ Package created: /tmp/tableshare-backend-deploy.tar.gz"
echo ""

# Check SSH connection
echo "🔍 Checking SSH connection..."
if ! ssh -o ConnectTimeout=5 $SERVER_USER@$SERVER_IP "echo 'SSH connection successful'" 2>/dev/null; then
    echo "❌ SSH connection failed!"
    echo "Please ensure:"
    echo "  1. SSH key is set up: ssh-copy-id $SERVER_USER@$SERVER_IP"
    echo "  2. Server is accessible"
    exit 1
fi

echo "✅ SSH connection successful"
echo ""

# Backup existing deployment
echo "💾 Backing up existing deployment..."
ssh $SERVER_USER@$SERVER_IP "
    if [ -d '$DEPLOY_PATH' ]; then
        echo 'Creating backup...'
        cp -r $DEPLOY_PATH $BACKUP_PATH
        echo 'Backup created: $BACKUP_PATH'
    else
        echo 'No existing deployment found'
    fi
"

# Create deployment directory
echo "📁 Creating deployment directory..."
ssh $SERVER_USER@$SERVER_IP "
    mkdir -p $DEPLOY_PATH
    mkdir -p $DEPLOY_PATH/uploads
    mkdir -p $DEPLOY_PATH/logs
"

# Copy files to server
echo "📤 Uploading files to server..."
scp /tmp/tableshare-backend-deploy.tar.gz $SERVER_USER@$SERVER_IP:/tmp/

# Extract on server
echo "📂 Extracting files on server..."
ssh $SERVER_USER@$SERVER_IP "
    cd $DEPLOY_PATH
    tar -xzf /tmp/tableshare-backend-deploy.tar.gz
    rm /tmp/tableshare-backend-deploy.tar.gz
    echo 'Files extracted'
"

# Install dependencies
echo "📥 Installing dependencies..."
ssh $SERVER_USER@$SERVER_IP "
    cd $DEPLOY_PATH
    npm install --production
    echo 'Dependencies installed'
"

# Run migrations
echo "🗄️  Running database migrations..."
ssh $SERVER_USER@$SERVER_IP "
    cd $DEPLOY_PATH
    npm run migrate
    echo 'Migrations completed'
"

# Restart PM2 service
echo "🔄 Restarting PM2 service..."
ssh $SERVER_USER@$SERVER_IP "
    cd $DEPLOY_PATH
    pm2 restart tableshare-api || pm2 start src/server.js --name tableshare-api
    pm2 save
    echo 'PM2 service restarted'
"

# Check service status
echo "📊 Checking service status..."
ssh $SERVER_USER@$SERVER_IP "pm2 status tableshare-api"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Test the API:"
echo "   curl http://$SERVER_IP:3000/health"
echo ""
echo "📋 View logs:"
echo "   ssh $SERVER_USER@$SERVER_IP 'pm2 logs tableshare-api'"
echo ""
echo "🔄 Restart service:"
echo "   ssh $SERVER_USER@$SERVER_IP 'pm2 restart tableshare-api'"
