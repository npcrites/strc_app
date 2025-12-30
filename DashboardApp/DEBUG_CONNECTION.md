# Debug Connection Issues

## What to Check in Expo Console

When the app starts, look for these logs:

### 1. Device Detection
```
🔍 Device detection: {
  isDevice: true/false,
  platform: 'ios'/'android'/'web',
  __DEV__: true,
  useDeviceUrl: true/false,
  apiUrlDevice: 'http://192.168.1.107:8000/api'
}
```

### 2. API URL Selection
```
📱 Using device API URL: http://192.168.1.107:8000/api
   OR
💻 Using localhost API URL: http://localhost:8000/api
```

### 3. Health Check (runs automatically)
```
🧪 Testing API URL connectivity...
✅ Backend health check successful: {"status":"healthy"}
   OR
❌ Backend health check failed: [error message]
```

### 4. Login Attempt
```
🔐 Attempting login for: demo@example.com
🌐 API Base URL: http://192.168.1.107:8000/api
🔗 Full login URL: http://192.168.1.107:8000/api/users/login
🌐 Making login request to: http://192.168.1.107:8000/api/users/login
```

## Common Issues

### Issue: Health check fails immediately
**Problem**: Backend not running or wrong URL
**Solution**: 
```bash
cd backend
source venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Issue: Using localhost URL on physical device
**Problem**: `Constants.isDevice` is false
**Solution**: The code now has a fallback - if on iOS/Android, it uses device URL anyway

### Issue: Network error with correct URL
**Problem**: Firewall or network issue
**Solution**: 
1. Test from phone browser: `http://192.168.1.107:8000/health`
2. Check both devices on same WiFi
3. Check macOS firewall settings

## Manual Override (if needed)

If device detection isn't working, you can temporarily hardcode the URL in `src/services/api.ts`:

```typescript
constructor() {
  // TEMPORARY: Force device URL for testing
  this.baseUrl = 'http://192.168.1.107:8000/api';
  console.log('🔧 FORCED device URL:', this.baseUrl);
}
```

## Next Steps

1. **Restart Expo** with cleared cache:
   ```bash
   npm start -- --clear
   ```

2. **Check console logs** - Look for the health check result

3. **Try login** - Watch for detailed error messages

4. **Share logs** - If still failing, share the console output

