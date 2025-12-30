# Quick Start Guide - Backend Server

## Prerequisites
- Python 3.9+ installed
- PostgreSQL installed and running

## Setup Steps

### 1. Create Virtual Environment (if not exists)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# OR
venv\Scripts\activate  # On Windows
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure Environment
```bash
# Copy example env file if .env doesn't exist
cp .env.example .env

# Edit .env with your settings:
# - DATABASE_URL (e.g., postgresql://user:password@localhost/strc_tracker)
# - SECRET_KEY (generate a random string)
# - PLAID_CLIENT_ID and PLAID_SECRET (if using Plaid)
```

### 4. Setup Database
```bash
# Run migrations
python3 -m alembic upgrade head

# (Optional) Seed sample data
python3 scripts/seed_sample_data.py
```

### 5. Start Server

**Option A: Using the start script (recommended)**
```bash
./start_server.sh
```

**Option B: Manual start**
```bash
source venv/bin/activate  # Activate venv first
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Verify Server is Running

Open your browser or use curl:
```bash
curl http://localhost:8000/health
```

Should return: `{"status":"healthy"}`

## Common Issues

### "No module named uvicorn"
- Make sure virtual environment is activated
- Run: `pip install -r requirements.txt`

### "Connection refused" (database)
- Make sure PostgreSQL is running
- Check DATABASE_URL in .env file
- Verify database exists: `psql -l | grep strc_tracker`

### "Port 8000 already in use"
- Kill the process: `lsof -ti:8000 | xargs kill`
- Or use a different port: `--port 8001`

### PEP 668 Error (macOS)
- Always use a virtual environment
- Never install packages globally with `pip install` on macOS
- Use `python3 -m venv venv` then `source venv/bin/activate`

## Accessing from Mobile Device

1. Find your computer's IP address:
   ```bash
   # macOS/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   
   # Or
   ipconfig getifaddr en0  # macOS
   ```

2. Update `DashboardApp/app.json`:
   ```json
   "extra": {
     "apiUrlDevice": "http://YOUR_IP:8000/api"
   }
   ```

3. Make sure both devices are on the same WiFi network

