# Server Setup Instructions

## ✅ Server Status
Your server should now be running! Verify with:
```bash
curl http://localhost:8000/health
```

## Quick Start (If Server Stops)

### 1. Activate Virtual Environment
```bash
cd backend
source venv/bin/activate
```

### 2. Start Server
```bash
# Option A: Use the start script
./start_server.sh

# Option B: Manual start
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## If Dependencies Are Missing

If you see "No module named uvicorn" or similar errors:

```bash
cd backend
source venv/bin/activate

# Install core dependencies first
pip install --upgrade pip setuptools wheel
pip install psycopg2-binary
pip install 'uvicorn[standard]'
pip install fastapi pydantic pydantic-settings

# Then install the rest
pip install -r requirements.txt
```

## Troubleshooting

### Port Already in Use
```bash
# Find and kill the process
lsof -ti:8000 | xargs kill
```

### Database Connection Issues
1. Make sure PostgreSQL is running:
   ```bash
   brew services list | grep postgresql
   # OR
   pg_isready
   ```

2. Check your `.env` file has correct DATABASE_URL:
   ```
   DATABASE_URL=postgresql://user:password@localhost/strc_tracker
   ```

### Module Not Found Errors
- Always activate the virtual environment first: `source venv/bin/activate`
- If packages are missing, reinstall: `pip install -r requirements.txt`

## Accessing from Mobile Device

1. Find your computer's IP:
   ```bash
   ipconfig getifaddr en0
   ```

2. Update `DashboardApp/app.json`:
   ```json
   "apiUrlDevice": "http://YOUR_IP:8000/api"
   ```

3. Make sure server is started with `--host 0.0.0.0` (not just localhost)

## Server URLs

- **Local**: http://localhost:8000
- **Network**: http://YOUR_IP:8000
- **Health Check**: http://localhost:8000/health
- **API Docs**: http://localhost:8000/docs

