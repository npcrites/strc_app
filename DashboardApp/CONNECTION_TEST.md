# Connection Test Guide

## Step 1: Verify Backend is Running
```bash
cd backend
source venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Must use `--host 0.0.0.0`** (not `127.0.0.1`)!

## Step 2: Test from Your Computer
```bash
# Should return: {"status":"healthy"}
curl http://localhost:8000/health

# Should return: {"status":"healthy"}
curl http://192.168.1.107:8000/health
```

## Step 3: Test from Your Phone's Browser
1. Open Safari or Chrome on your iPhone
2. Navigate to: `http://192.168.1.107:8000/health`
3. Should see: `{"status":"healthy"}`

**If this doesn't work**, your phone can't reach your computer. Check:
- Both devices on same WiFi network
- Firewall settings on your Mac
- Router settings (some routers block device-to-device communication)

## Step 4: Check Expo Console Logs
When you try to login, look for these logs:
- `📱 Physical device detected - Using device API URL: http://192.168.1.107:8000/api`
- `🌐 API Base URL: http://192.168.1.107:8000/api`
- `🔗 Full login URL: http://192.168.1.107:8000/api/users/login`

## Step 5: Update IP if Needed
If your IP changed, update `DashboardApp/app.json`:
```json
"apiUrlDevice": "http://YOUR_NEW_IP:8000/api"
```

Then restart Expo: `npm start -- --clear`

## Common Solutions

### Solution 1: Restart Backend with Correct Host
```bash
# Kill existing server
lsof -ti:8000 | xargs kill

# Start with correct host
cd backend
source venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Solution 2: Check Firewall (macOS)
```bash
# Check firewall status
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# If firewall is on, you may need to allow Python
# Or temporarily disable firewall for testing
```

### Solution 3: Verify Network IP
```bash
# Get your current IP
ipconfig getifaddr en0

# Update app.json if different
```

### Solution 4: Test Network Connectivity
From your phone's browser, try:
- `http://192.168.1.107:8000/health` - Should work
- `http://192.168.1.107:8000/docs` - Should show API docs

If these don't work, it's a network/firewall issue, not a code issue.

