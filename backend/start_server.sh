#!/bin/bash
# Script to start the FastAPI backend server

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
    echo "✅ Activated virtual environment"
else
    echo "⚠️  No virtual environment found. Creating one..."
    python3 -m venv venv
    source venv/bin/activate
    echo "✅ Created and activated virtual environment"
    echo "📦 Installing dependencies..."
    pip install -r requirements.txt
    echo "✅ Dependencies installed"
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found. Copying from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file. Please update it with your configuration."
fi

# Run the FastAPI application with Uvicorn
# --reload enables auto-reloading on code changes
# --host 0.0.0.0 makes the server accessible from other devices on the network
echo "🚀 Starting server on http://0.0.0.0:8000"
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
