#!/bin/bash
# Backend server startup script

cd "$(dirname "$0")"

# Check if virtual environment exists and activate it
if [ -d ".venv" ]; then
    echo "Activating virtual environment..."
    source .venv/bin/activate
elif [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
fi

# Start the server
echo "Starting FastAPI server..."
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

