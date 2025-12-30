# Dashboard App Setup Guide

## Initial Setup

1. **Install dependencies:**
```bash
cd DashboardApp
npm install
```

2. **Install Expo CLI globally (if not already installed):**
```bash
npm install --global expo-cli
```

## Running the App

1. **Start the Expo development server:**
```bash
npm start
```

2. **Run on iOS Simulator:**
```bash
npm run ios
```

3. **Run on Android Emulator:**
```bash
npm run android
```

4. **Run on Web:**
```bash
npm run web
```

## Project Structure

```
DashboardApp/
├── App.tsx                 # Entry point with NavigationContainer
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── babel.config.js         # Babel configuration for Expo
├── app.json                # Expo configuration
├── .gitignore             # Git ignore rules
├── assets/                 # Images, fonts, etc.
│   ├── icon.png           # App icon (required)
│   ├── splash.png         # Splash screen (required)
│   ├── adaptive-icon.png  # Android adaptive icon (required)
│   └── favicon.png        # Web favicon (required)
└── src/
    ├── screens/
    │   ├── HomeScreen.tsx      # Dashboard with charts
    │   └── ActivityScreen.tsx  # Activity feed
    ├── navigation/
    │   └── BottomTabs.tsx       # Bottom tab navigator
    └── components/
        └── Chart.tsx            # Reusable Victory chart component
```

## Required Assets

You'll need to add the following image files to the `assets/` directory:

- `icon.png` - App icon (1024x1024px recommended)
- `splash.png` - Splash screen (1242x2436px recommended)
- `adaptive-icon.png` - Android adaptive icon (1024x1024px)
- `favicon.png` - Web favicon (48x48px)

You can use placeholder images for development, or generate them using tools like:
- [Expo Asset Generator](https://www.npmjs.com/package/expo-asset-generator)
- [App Icon Generator](https://www.appicon.co/)

## Dependencies

### Core
- `expo` - Expo SDK
- `react` & `react-native` - React Native framework

### Navigation
- `@react-navigation/native` - Core navigation library
- `@react-navigation/bottom-tabs` - Bottom tab navigator
- `@react-navigation/native-stack` - Stack navigator
- `react-native-screens` - Native screen components
- `react-native-safe-area-context` - Safe area handling
- `react-native-gesture-handler` - Gesture handling
- `react-native-reanimated` - Animations

### Charts
- `react-native-svg` - SVG support for React Native
- `victory-native` - Chart library for React Native

## Next Steps

1. **Connect to Backend API:**
   - Create API service to fetch dashboard data
   - Add authentication context
   - Implement data fetching hooks

2. **Implement Dashboard Charts:**
   - Portfolio value over time (total series)
   - Position values vs cash flows (separate series)
   - Asset allocation pie chart
   - Performance metrics (delta, max, min)

3. **Build Activity Feed:**
   - List of trades, dividends, upcoming dividends
   - Filter by activity type
   - Sort chronologically
   - Show details (ticker, amount, date)

4. **Add Time Range Selector:**
   - 1M, 3M, 1Y, ALL options
   - Update dashboard data based on selection

5. **Enhance UI/UX:**
   - Add loading states
   - Error handling
   - Pull-to-refresh
   - Empty states

## Troubleshooting

### Metro bundler issues
```bash
# Clear cache and restart
npm start -- --reset-cache
```

### TypeScript errors
```bash
# Ensure types are installed
npm install --save-dev @types/react @types/react-native
```

### Victory Native not rendering
- Ensure `react-native-svg` is properly linked
- Check that `react-native-reanimated` plugin is in `babel.config.js`

