# Network Connection Troubleshooting

## Current Configuration
- **Backend Server**: Running on `http://0.0.0.0:8000` (accessible at `http://10.50.218.180:8000`)
- **API URL**: `http://10.50.218.180:8000/api`
- **CORS**: Set to allow all origins (`*`)

## Steps to Fix Connection Issues

### 1. Verify Backend is Running
```bash
curl http://localhost:8000/health
# Should return: {"status":"healthy"}
```

### 2. Verify Network Accessibility
```bash
curl http://10.50.218.180:8000/health
# Should return: {"status":"healthy"}
```

### 3. Check Your Phone's Network
- Make sure your phone is on the **same WiFi network** as your computer
- The network IP should be in the same range (e.g., 10.50.218.x)

### 4. Reload Expo App
- Shake your device and tap "Reload"
- Or press `r` in the Expo terminal
- The app needs to reload to pick up the new API configuration

### 5. Check Expo Console Logs
Look for these log messages in your Expo terminal:
- `🔍 Device detection:` - Shows device detection info
- `📱 Using device API URL:` - Should show `http://10.50.218.180:8000/api`
- `🧪 Testing API URL connectivity...` - Shows connection test results

### 6. Test from Phone's Browser
Try opening this URL in your phone's browser:
```
http://10.50.218.180:8000/health
```
If this works, the network is fine. If not, check:
- Both devices on same WiFi
- Firewall isn't blocking port 8000
- Router allows device-to-device communication

### 7. Update IP Address (if changed)
If your IP address changes, run:
```bash
./update_ip.sh
```

### 8. Check Firewall Settings
On macOS, make sure port 8000 isn't blocked:
```bash
# Check firewall status
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# If firewall is on, you may need to allow Python through firewall
# System Preferences > Security & Privacy > Firewall > Firewall Options
```

### 9. Alternative: Use ngrok for Testing
If local network doesn't work, you can use ngrok:
```bash
# Install ngrok: brew install ngrok
ngrok http 8000
# Use the ngrok URL in app.json apiUrlDevice
```

## Common Issues

### "Network request failed"
- **Cause**: Phone can't reach the server
- **Fix**: Ensure both devices on same WiFi, check firewall

### "Connection timeout"
- **Cause**: Server not running or wrong IP
- **Fix**: Verify server is running and IP is correct

### "CORS error"
- **Cause**: Backend CORS not configured correctly
- **Fix**: Already set to `*` - should not be an issue

### Wrong API URL in logs
- **Cause**: App hasn't reloaded with new config
- **Fix**: Reload Expo app (shake device > Reload)

