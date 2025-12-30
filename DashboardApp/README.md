# Dashboard App

React Native + Expo mobile frontend for the STRC Tracker dashboard.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Expo
```bash
npm start
```

### 3. Run the App

**iOS Simulator:**
- Press `i` in the Expo terminal, or
- `npm run ios`

**Android Emulator:**
- Press `a` in the Expo terminal, or
- `npm run android`

**Physical Device:**
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

## Features

- ✅ TypeScript with full type safety
- ✅ Bottom tab navigation
- ✅ Authentication context
- ✅ API service ready for backend
- ✅ Victory Native for charts
- ✅ Formatters for currency, dates, percentages

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

### Can't connect to backend from device
- Use computer's IP address instead of `localhost` in `app.json`
- Verify backend is running: `curl http://localhost:8000/health`
- Check phone and computer are on same WiFi

### TypeScript errors
```bash
npx tsc --noEmit
```

## Next Steps

- ⏳ Implement HomeScreen to fetch dashboard data
- ⏳ Build charts for portfolio performance
- ⏳ Implement ActivityScreen with activity feed
- ⏳ Add authentication flow (if needed)

## Backend Setup

Make sure the backend is running:
```bash
cd ../backend
python3 -m uvicorn app.main:app --reload
```

Backend should be at: `http://localhost:8000`
