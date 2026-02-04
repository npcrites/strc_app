#!/bin/bash

# Script to find current IP address and update API configuration

echo "🔍 Finding your current IP address..."

# Try different methods to get IP
IP=""
if command -v ipconfig &> /dev/null; then
    IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
fi

if [ -z "$IP" ] && command -v ifconfig &> /dev/null; then
    IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
fi

if [ -z "$IP" ]; then
    echo "❌ Could not automatically detect IP address"
    echo ""
    echo "Please find your IP address manually:"
    echo "  - macOS: System Preferences > Network (or run: ipconfig getifaddr en0)"
    echo "  - Or check your router's admin panel"
    echo ""
    read -p "Enter your IP address (e.g., 192.168.1.100): " IP
fi

if [ -z "$IP" ]; then
    echo "❌ No IP address provided. Exiting."
    exit 1
fi

echo "✅ Found IP address: $IP"
echo ""
echo "📝 Updating configuration files..."

# Update app.json
if [ -f "DashboardApp/app.json" ]; then
    # Use sed to update the IP in app.json
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/\"apiUrlDevice\": \"http:\/\/[0-9.]*:8000\/api\"/\"apiUrlDevice\": \"http:\/\/${IP}:8000\/api\"/" DashboardApp/app.json
    else
        # Linux
        sed -i "s/\"apiUrlDevice\": \"http:\/\/[0-9.]*:8000\/api\"/\"apiUrlDevice\": \"http:\/\/${IP}:8000\/api\"/" DashboardApp/app.json
    fi
    echo "✅ Updated DashboardApp/app.json"
fi

# Update api.ts
if [ -f "DashboardApp/src/services/api.ts" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|http://192.168.[0-9.]*:8000/api|http://${IP}:8000/api|g" DashboardApp/src/services/api.ts
    else
        sed -i "s|http://192.168.[0-9.]*:8000/api|http://${IP}:8000/api|g" DashboardApp/src/services/api.ts
    fi
    echo "✅ Updated DashboardApp/src/services/api.ts"
fi

echo ""
echo "✅ Configuration updated!"
echo ""
echo "📱 Your API URL is now: http://${IP}:8000/api"
echo ""
echo "⚠️  Important:"
echo "   1. Make sure your backend is running: cd backend && ./start_server.sh"
echo "   2. Make sure both devices are on the same WiFi network"
echo "   3. Restart your Expo app to pick up the new configuration"
echo ""

