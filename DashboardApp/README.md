# Dashboard App

React Native + Expo mobile frontend for the STRC Tracker dashboard.

## Quick Start

### 1. Start Expo
```bash
npm start
```

### 2. Open iOS Simulator
**Press `i` in the Expo terminal**

This will:
- Launch iOS Simulator
- Build and install the app
- Automatically open the app

**First time?** Make sure Xcode is installed and command line tools are configured:
```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

### 3. Alternative: Run Directly
```bash
npm run ios    # iOS Simulator
npm run android  # Android Emulator
```

### 4. Physical Device
1. Install [Expo Go](https://expo.dev/client) on your phone
2. Scan the QR code from the terminal
3. Make sure phone and computer are on the same WiFi

## Project Structure

```
DashboardApp/
├── App.tsx                 # Entry point with AuthProvider
├── src/
│   ├── screens/            # HomeScreen, ActivityScreen
│   ├── navigation/         # BottomTabs navigator
│   ├── components/         # Chart component
│   ├── context/            # AuthContext
│   ├── services/           # API services (api.ts, dashboard.ts)
│   ├── types/              # TypeScript definitions
│   └── utils/              # Formatters
```

## Configuration

### API URL

Configured in `app.json`:
- **Simulator**: `http://localhost:8000/api`
- **Physical Device**: `http://192.168.1.107:8000/api` (your computer's IP)

To update for your network, find your IP:
```bash
ipconfig getifaddr en0  # macOS
```

Then update `app.json` → `extra.apiUrlDevice`

## Backend Setup

Make sure the backend is running:
```bash
cd ../backend
source venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Important**: Must use `--host 0.0.0.0` (not `127.0.0.1`) for mobile devices!

Backend should be at: `http://localhost:8000`

## Troubleshooting

### "EMFILE: too many open files" Error
**Fixed!** Watchman is installed. If you see this error:
```bash
watchman watch-del-all
npm start -- --reset-cache
```

### Expo won't start
```bash
npm start -- --reset-cache
```

### Connection Issues

#### 1. Verify Backend is Running
```bash
# From your computer
curl http://localhost:8000/health

# From your network IP
curl http://192.168.1.107:8000/health
```

#### 2. Check Your IP Address
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

#### 3. Network Requirements
- ✅ Both devices (computer + phone) on **same WiFi network**
- ✅ Backend running with `--host 0.0.0.0`
- ✅ Firewall not blocking port 8000
- ✅ Correct IP address in `app.json`

#### 4. Test from Mobile Device
1. Open Safari/Chrome on your phone
2. Navigate to: `http://YOUR_IP:8000/health`
3. Should see: `{"status":"healthy"}`

If this doesn't work, the phone can't reach your computer - check firewall/network settings.

#### 5. Check Expo Console Logs
When you try to login, look for:
- `📱 Physical device detected - Using device API URL: ...`
- `🌐 API Base URL: ...`
- `🔗 Full login URL: ...`
- `✅ Backend health check successful` or `❌ Backend health check failed`

#### 6. Firewall Settings (macOS)
If phone can't connect, check firewall:
```bash
# Check firewall status
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# Allow Python through firewall (if needed)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /opt/homebrew/Cellar/python@3.14/3.14.2/Frameworks/Python.framework/Versions/3.14/Resources/Python.app/Contents/MacOS/Python
```

### TypeScript errors
```bash
npx tsc --noEmit
```

### Still Not Working?
1. **Check Expo console logs** - Look for the API URL being used
2. **Verify IP address** - Run `ipconfig getifaddr en0` and update `app.json`
3. **Test from phone browser** - Try accessing `http://YOUR_IP:8000/health` in Safari
4. **Restart everything** - Backend, Expo, and your phone's Expo Go app
5. **Restart Expo with cleared cache**: `npm start -- --clear`
