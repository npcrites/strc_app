# Dashboard App

React Native + Expo mobile frontend for the STRC Tracker dashboard.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the Expo development server:
```bash
npm start
```

3. Run on iOS:
```bash
npm run ios
```

4. Run on Android:
```bash
npm run android
```

## Project Structure

```
DashboardApp/
├── App.tsx                 # Entry point with AuthProvider & NavigationContainer
├── package.json
├── tsconfig.json
├── app.json               # Expo configuration
├── assets/                 # Images, fonts, etc.
└── src/
    ├── screens/
    │   ├── HomeScreen.tsx      # Dashboard with charts
    │   └── ActivityScreen.tsx  # Activity feed
    ├── navigation/
    │   └── BottomTabs.tsx       # Bottom tab navigator
    ├── components/
    │   └── Chart.tsx            # Reusable Victory chart component
    ├── context/
    │   └── AuthContext.tsx      # Authentication context & hooks
    ├── services/
    │   ├── api.ts               # Base API service
    │   └── dashboard.ts         # Dashboard-specific API endpoints
    ├── types/
    │   └── index.ts             # TypeScript type definitions
    └── utils/
        └── formatters.ts        # Currency, date, number formatters
```

## Features

- **Bottom Tab Navigation**: Home and Activity screens
- **TypeScript**: Full TypeScript support with type definitions
- **Authentication**: AuthContext with token management and user state
- **API Integration**: Type-safe API service ready for backend connection
- **Charts**: Victory Native for data visualization
- **Formatters**: Utility functions for currency, dates, percentages
- **Modular Structure**: Clean separation of concerns

## Next Steps

- ✅ Authentication context integrated
- ✅ API service ready
- ✅ Type definitions match backend DTOs
- ⏳ Implement dashboard data fetching in HomeScreen
- ⏳ Build dashboard charts (portfolio value, performance, allocation)
- ⏳ Build activity feed list with trades and dividends
- ⏳ Add login screen (if needed)
- ⏳ Add time range selector (1M, 3M, 1Y, ALL)

