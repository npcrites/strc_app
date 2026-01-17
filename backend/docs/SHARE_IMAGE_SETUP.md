# Share Image with Deep Linking Setup

## Overview
This feature allows users to share asset chart images that, when clicked, open the app directly to that asset via deep links.

## Implementation

### Backend Endpoints

1. **POST `/api/assets/share-image`**
   - Uploads a chart image
   - Returns a shareable URL
   - Requires authentication

2. **GET `/api/assets/share/asset/{ticker}?id={file_id}`**
   - Displays the shared image in an HTML page
   - Includes Universal Link metadata
   - Auto-redirects to app via deep link: `strctracker://asset/{ticker}`

3. **GET `/api/assets/share-image/{filename}`**
   - Serves the uploaded image file

### Frontend

- Updated `AssetDetailScreen` to:
  - Capture chart as PNG image
  - Upload image to backend
  - Share the URL (which shows rich preview in iMessage)
  - Fallback to direct image share if upload fails

## Configuration

### Environment Variables

Add to `.env`:
```bash
SHARE_IMAGE_BASE_URL=http://localhost:8000  # For development
# For production: SHARE_IMAGE_BASE_URL=https://strctracker.com
```

### Upload Directory

Images are stored in `backend/uploads/share_images/`
- Directory is created automatically
- Added to `.gitignore` (images are not committed)

## Universal Links Setup (Production)

For full Universal Links support (making images clickable in iMessage), you need:

### 1. iOS Configuration

Add to `app.json`:
```json
{
  "expo": {
    "ios": {
      "associatedDomains": ["applinks:strctracker.com"]
    }
  }
}
```

### 2. Apple App Site Association File

Create and host at: `https://strctracker.com/.well-known/apple-app-site-association`

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.dashboardapp.app",
        "paths": ["/api/assets/share/asset/*"]
      }
    ]
  }
}
```

**Important:**
- File must be served with `Content-Type: application/json`
- Must be accessible via HTTPS
- No file extension
- Must return 200 status code

### 3. Android App Links

Add to `app.json`:
```json
{
  "expo": {
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [
            {
              "scheme": "https",
              "host": "strctracker.com",
              "pathPrefix": "/api/assets/share/asset"
            }
          ]
        }
      ]
    }
  }
}
```

### 4. Backend Server Configuration

For production, you'll need to:
1. Serve the HTML page with proper headers
2. Host the `apple-app-site-association` file
3. Ensure HTTPS is enabled
4. Configure CORS properly

## Testing

### Development
1. Start backend: `cd backend && python -m uvicorn app.main:app --reload`
2. Set `SHARE_IMAGE_BASE_URL=http://localhost:8000` in `.env`
3. Share an asset chart from the app
4. The URL will be shared and can be opened in a browser
5. Deep link `strctracker://asset/{ticker}` will work if app is installed

### Production
1. Deploy backend with HTTPS
2. Configure Universal Links as described above
3. Test by sharing and clicking the link in iMessage
4. Should open app directly (if installed) or show web page with "Open in App" button

## Current Status

✅ Image capture and upload working
✅ Share URL generation working
✅ HTML page with image display working
✅ Deep link URL format: `strctracker://asset/{ticker}`
⏳ Universal Links (requires production domain with HTTPS)
⏳ App navigation handling (needs to be added to App.tsx)

## Next Steps

1. Add deep link handling in `App.tsx` to navigate to AssetDetail screen
2. Set up production domain with HTTPS
3. Configure Universal Links files on server
4. Test end-to-end flow

