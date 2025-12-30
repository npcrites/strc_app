# How to Start the Backend Server

## ✅ Quick Start

```bash
cd backend
source venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Important**: Use `--host 0.0.0.0` (not `127.0.0.1`) so mobile devices can connect!

## Step-by-Step

### 1. Navigate to backend directory
```bash
cd /Users/nickcrites/strc_tracker/backend
```

### 2. Activate virtual environment
```bash
source venv/bin/activate
```

You should see `(venv)` in your terminal prompt.

### 3. Start the server
```bash
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Verify it's running
Open a new terminal and run:
```bash
curl http://localhost:8000/health
```

Should return: `{"status":"healthy"}`

## Your Network IP

Your computer's IP is: **192.168.1.107**

This is already configured in `DashboardApp/app.json` as `apiUrlDevice`.

## Common Issues

### "No module named uvicorn"
```bash
source venv/bin/activate
pip install -r requirements.txt
```

### "Port 8000 already in use"
```bash
# Kill the existing process
lsof -ti:8000 | xargs kill
```

### Server starts but mobile can't connect
- Make sure you used `--host 0.0.0.0` (not `127.0.0.1`)
- Make sure both devices are on the same WiFi network
- Check your firewall isn't blocking port 8000

## Background Process

To run in background:
```bash
cd backend
source venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > server.log 2>&1 &
```

To stop:
```bash
lsof -ti:8000 | xargs kill
```

