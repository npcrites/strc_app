#!/bin/bash
# Script to start both backend and frontend services

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting STRC Tracker Services${NC}\n"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/DashboardApp"

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Check if ports are already in use
if check_port 8000; then
    echo -e "${YELLOW}⚠️  Port 8000 is already in use. Backend may already be running.${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Start Backend
echo -e "${GREEN}📦 Starting Backend Server...${NC}"
cd "$BACKEND_DIR"

# Check if venv exists, create if not
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
    source venv/bin/activate
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Warning: .env file not found in backend directory${NC}"
    echo -e "${YELLOW}   Make sure to create one with your configuration${NC}"
fi

# Start backend in background
echo -e "${GREEN}✅ Backend starting on http://0.0.0.0:8000${NC}"
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Check if backend started successfully
if ps -p $BACKEND_PID > /dev/null; then
    echo -e "${GREEN}✅ Backend is running (PID: $BACKEND_PID)${NC}"
else
    echo -e "${YELLOW}⚠️  Backend may have failed to start. Check backend.log for errors.${NC}"
fi

# Start Frontend
echo -e "\n${GREEN}📱 Starting Frontend (Expo)...${NC}"
cd "$FRONTEND_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing npm dependencies...${NC}"
    npm install
fi

# Start Expo
echo -e "${GREEN}✅ Frontend starting...${NC}"
echo -e "${BLUE}   Press 'i' for iOS simulator or 'a' for Android emulator${NC}"
echo -e "${BLUE}   Or scan the QR code with Expo Go app${NC}\n"

# Start Expo in foreground (so user can interact with it)
npm start

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        echo -e "${GREEN}✅ Backend stopped${NC}"
    fi
    exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT SIGTERM

