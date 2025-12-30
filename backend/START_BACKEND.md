# Starting the Backend Server

## Quick Start

### Option 1: Using the startup script (Recommended)
```bash
cd backend
./start_server.sh
```

### Option 2: Using python3 -m uvicorn
```bash
cd backend
python3 -m uvicorn app.main:app --reload
```

### Option 3: If uvicorn is in PATH
```bash
cd backend
uvicorn app.main:app --reload
```

## Common Issues

### Issue: "command not found: uvicorn"
**Solution:** Use `python3 -m uvicorn` instead:
```bash
python3 -m uvicorn app.main:app --reload
```

### Issue: "ModuleNotFoundError: No module named 'app'"
**Solution:** Make sure you're in the `backend` directory:
```bash
cd backend
python3 -m uvicorn app.main:app --reload
```

### Issue: Port 8000 already in use
**Solution:** Kill the process or use a different port:
```bash
# Kill process on port 8000
lsof -ti:8000 | xargs kill -9

# Or use different port
python3 -m uvicorn app.main:app --reload --port 8001
```

### Issue: Database connection errors
**Solution:** Make sure PostgreSQL is running and `.env` is configured:
```bash
# Check if PostgreSQL is running
psql -l

# Verify .env file exists
ls -la backend/.env
```

### Issue: Import errors
**Solution:** Install dependencies:
```bash
cd backend
pip3 install -r requirements.txt
```

## Verify Server is Running

Once started, you should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

Test the server:
```bash
curl http://localhost:8000/health
# Should return: {"status":"healthy"}
```

## Server URLs

- **API**: http://localhost:8000
- **Health Check**: http://localhost:8000/health
- **API Docs**: http://localhost:8000/docs
- **Alternative Docs**: http://localhost:8000/redoc

## Using Virtual Environment (Optional)

If you have a virtual environment:
```bash
cd backend
source .venv/bin/activate  # or: source venv/bin/activate
python3 -m uvicorn app.main:app --reload
```

