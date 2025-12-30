# Troubleshooting: "Could not connect to server"

## Quick Checks

### 1. Backend is Running
```bash
cd backend
source venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Important**: Must use `--host 0.0.0.0` (not `127.0.0.1`) for mobile devices!

### 2. Verify Backend is Accessible
```bash
# From your computer
curl http://localhost:8000/health

# From your network IP (should work if backend is on 0.0.0.0)
curl http://192.168.1.107:8000/health
```

### 3. Check Your IP Address
```bash
# macOS
ipconfig getifaddr en0

# Or
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Update `DashboardApp/app.json`:
```json
"apiUrlDevice": "http://YOUR_IP:8000/api"
```

### 4. Network Requirements
- ✅ Both devices (computer + phone) on **same WiFi network**
- ✅ Backend running with `--host 0.0.0.0`
- ✅ Firewall not blocking port 8000
- ✅ Correct IP address in `app.json`

### 5. Check Console Logs
In Expo, look for:
- `📱 Physical device detected - Using device API URL: ...`
- `🌐 API Base URL: ...`
- `🔗 Full login URL: ...`

## Common Issues

### Issue: "Network error: Could not reach server"
**Solution**: 
1. Verify backend is running: `curl http://localhost:8000/health`
2. Check IP address matches your computer's current IP
3. Ensure both devices on same WiFi
4. Try restarting backend with `--host 0.0.0.0`

### Issue: CORS Error
**Solution**: Backend CORS is configured, but if you see CORS errors:
1. Check `backend/app/core/config.py` - `CORS_ORIGINS` includes your Expo URLs
2. Restart backend after changing CORS settings

### Issue: Wrong API URL
**Solution**: 
1. Check console logs for "Using device API URL" or "Using localhost API URL"
2. If on physical device, should use `192.168.1.107:8000`
3. If on simulator, should use `localhost:8000`

## Testing Connection

### Test from Terminal (on your computer)
```bash
# Test localhost
curl http://localhost:8000/health

# Test network IP
curl http://192.168.1.107:8000/health

# Test login endpoint
curl -X POST http://192.168.1.107:8000/api/users/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=demo@example.com&password=demo123"
```

### Test from Mobile Device
1. Open Safari/Chrome on your phone
2. Navigate to: `http://192.168.1.107:8000/health`
3. Should see: `{"status":"healthy"}`

If this doesn't work, the phone can't reach your computer - check firewall/network settings.

## Firewall Settings (macOS)

If phone can't connect, check firewall:
```bash
# Check firewall status
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# Allow Python through firewall (if needed)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /opt/homebrew/Cellar/python@3.14/3.14.2/Frameworks/Python.framework/Versions/3.14/Resources/Python.app/Contents/MacOS/Python
```

## Still Not Working?

1. **Check Expo console logs** - Look for the API URL being used
2. **Verify IP address** - Run `ipconfig getifaddr en0` and update `app.json`
3. **Test from phone browser** - Try accessing `http://YOUR_IP:8000/health` in Safari
4. **Restart everything** - Backend, Expo, and your phone's Expo Go app

