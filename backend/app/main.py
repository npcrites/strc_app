"""
FastAPI entrypoint for strc_tracker backend
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.routes import positions, dividends, users, dashboard, portfolio
from app.core.config import settings
from app.services.portfolio_scheduler import start_scheduler as start_portfolio_scheduler, stop_scheduler as stop_portfolio_scheduler
import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    logger.info("Starting application...")
    
    # Start Portfolio scheduler (price updates and snapshots)
    try:
        start_portfolio_scheduler()
    except Exception as e:
        logger.error(f"Failed to start Portfolio scheduler: {str(e)}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down application...")
    stop_portfolio_scheduler()


app = FastAPI(
    title="STRC Tracker API",
    description="Backend API for tracking stock positions and dividends",
    version="1.0.0",
    lifespan=lifespan
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
app.include_router(dashboard.router)
app.include_router(portfolio.router)


@app.get("/")
async def root():
    return {"message": "STRC Tracker API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


