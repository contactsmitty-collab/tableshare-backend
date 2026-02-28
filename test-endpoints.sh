#!/bin/bash

# TableShare API - Endpoint Testing Script
# Tests all endpoints after deployment

API_BASE="http://165.227.179.81:3000"
# Or use: API_BASE="https://tableshare.pixelcheese.com"

echo "🧪 Testing TableShare API Endpoints"
echo "===================================="
echo "Base URL: $API_BASE"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -n "Testing $description... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$API_BASE$endpoint")
    elif [ "$method" = "POST" ] || [ "$method" = "PUT" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$API_BASE$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓${NC} (HTTP $http_code)"
    elif [ "$http_code" -eq 401 ]; then
        echo -e "${YELLOW}⚠${NC} (HTTP $http_code - Auth required)"
    else
        echo -e "${RED}✗${NC} (HTTP $http_code)"
        echo "   Response: $body"
    fi
}

# Health check
echo "1. Health Check"
test_endpoint "GET" "/health" "" "Health endpoint"
echo ""

# Root endpoint
echo "2. Root Endpoint"
test_endpoint "GET" "/" "" "Root endpoint (list all endpoints)"
echo ""

# Restaurants (public)
echo "3. Restaurants (Public Endpoints)"
test_endpoint "GET" "/api/v1/restaurants" "" "Get all restaurants"
test_endpoint "GET" "/api/v1/restaurants/featured" "" "Get featured restaurants"
echo ""

# Auth endpoints
echo "4. Authentication"
test_endpoint "POST" "/api/v1/auth/signup" \
    '{"email":"test@example.com","password":"test123","firstName":"Test","lastName":"User"}' \
    "Sign up"
echo ""

# Note: For authenticated endpoints, you'll need to get a token first
echo ""
echo "📝 To test authenticated endpoints:"
echo "   1. Sign up or login to get a token"
echo "   2. Use: curl -H 'Authorization: Bearer YOUR_TOKEN' $API_BASE/api/v1/users/me"
echo ""
echo "✅ Basic endpoint tests complete!"
