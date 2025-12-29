"""
FastAPI entrypoint for strc_tracker backend
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import positions, dividends, users
from app.core.config import settings

app = FastAPI(
    title="STRC Tracker API",
    description="Backend API for tracking stock positions and dividends",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users.router, prefix="/api", tags=["users"])
app.include_router(positions.router, prefix="/api", tags=["positions"])
app.include_router(dividends.router, prefix="/api", tags=["dividends"])


@app.get("/")
async def root():
    return {"message": "STRC Tracker API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


