# Quick Start Guide

## 🚀 Get Started in 3 Steps

### 1. Install Dependencies
```bash
cd DashboardApp
npm install
```

### 2. Start Expo
```bash
npm start
```

### 3. Run on Device/Simulator
- Press `i` for iOS Simulator
- Press `a` for Android Emulator
- Scan QR code with Expo Go app on your phone

## ✅ Verification Checklist

After running `npm start`, verify:

- [ ] Bottom tabs show "Home" and "Activity"
- [ ] Home screen renders placeholder text
- [ ] Activity screen renders placeholder text
- [ ] Navigation between tabs works
- [ ] No TypeScript errors in console

## 📱 Next Steps

1. **Add Assets** (required for production):
   - Add `icon.png` (1024x1024) to `assets/`
   - Add `splash.png` to `assets/`
   - Add `adaptive-icon.png` to `assets/`

2. **Connect Backend**:
   - Create API service in `src/services/`
   - Add authentication context
   - Fetch dashboard data from `/api/dashboard/snapshot`

3. **Build Charts**:
   - Use `Chart.tsx` component with Victory Native
   - Display portfolio performance series
   - Show asset allocation

4. **Build Activity Feed**:
   - List activity items from dashboard response
   - Filter by type (DIVIDEND, UPCOMING_DIVIDEND, BUY, SELL)
   - Show chronological timeline

## 🐛 Troubleshooting

**Metro bundler won't start:**
```bash
npm start -- --reset-cache
```

**TypeScript errors:**
```bash
npm install --save-dev @types/react @types/react-native
```

**Victory Native not working:**
- Ensure `react-native-svg` is installed
- Check `babel.config.js` has `react-native-reanimated/plugin`

**Expo CLI not found:**
```bash
npm install --global expo-cli
```

