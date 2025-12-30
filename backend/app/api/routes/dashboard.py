"""
Dashboard API endpoints
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import get_current_user
from app.services.dashboard.dashboard_service import DashboardService
from app.services.dashboard.models.time_range import TimeRange

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/snapshot")
async def get_dashboard_snapshot(
    time_range: str = Query("1M", regex="^(1M|3M|1Y|ALL)$", description="Time range: 1M, 3M, 1Y, or ALL"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Get dashboard snapshot for authenticated user.
    
    Args:
        time_range: Time range shorthand (1M, 3M, 1Y, ALL)
        db: Database session
        user: Authenticated user from JWT
    
    Returns:
        DashboardSnapshot with portfolio metrics
    """
    try:
        # Convert shorthand to TimeRange
        tr = TimeRange.from_shorthand(time_range)
        
        # Get user_id from authenticated user
        user_id = int(user.get("user_id"))
        
        # Build dashboard
        snapshot = DashboardService.build_dashboard(db, user_id, tr)
        
        return snapshot
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error building dashboard: {str(e)}"
        )

