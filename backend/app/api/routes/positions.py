"""
Positions API endpoints
Returns current positions (not historical snapshots)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.position import Position
from pydantic import BaseModel

router = APIRouter(prefix="/positions", tags=["positions"])


class PositionResponse(BaseModel):
    """Position response model"""
    id: int
    ticker: str
    name: Optional[str]
    shares: float
    cost_basis: float
    market_value: Optional[float]
    asset_type: Optional[str]
    average_cost_per_share: float
    current_price_per_share: Optional[float]
    unrealized_gain_loss: Optional[float]
    unrealized_gain_loss_percent: Optional[float]
    
    class Config:
        from_attributes = True


@router.get("/", response_model=dict)
async def get_positions(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """Get all current positions for the current user"""
    try:
        user_id = int(user.get("user_id"))
        
        # Query current positions (not historical)
        query = db.query(Position).filter(
            Position.user_id == user_id,
            Position.shares > 0
        )
        
        total = query.count()
        positions = query.offset(skip).limit(limit).all()
        
        positions_data = [
            PositionResponse(
                id=pos.id,
                ticker=pos.ticker,
                name=pos.name,
                shares=float(pos.shares),
                cost_basis=float(pos.cost_basis),
                market_value=float(pos.market_value) if pos.market_value else None,
                asset_type=pos.asset_type,
                average_cost_per_share=pos.average_cost_per_share,
                current_price_per_share=pos.current_price_per_share,
                unrealized_gain_loss=pos.unrealized_gain_loss,
                unrealized_gain_loss_percent=pos.unrealized_gain_loss_percent
            )
            for pos in positions
        ]
        
        return {
            "positions": [p.dict() for p in positions_data],
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching positions: {str(e)}"
        )


@router.get("/{position_id}", response_model=PositionResponse)
async def get_position(
    position_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific position by ID"""
    try:
        user_id = int(user.get("user_id"))
        
        position = db.query(Position).filter(
            Position.id == position_id,
            Position.user_id == user_id
        ).first()
        
        if not position:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Position not found"
            )
        
        return PositionResponse(
            id=position.id,
            ticker=position.ticker,
            name=position.name,
            shares=float(position.shares),
            cost_basis=float(position.cost_basis),
            market_value=float(position.market_value) if position.market_value else None,
            asset_type=position.asset_type,
            average_cost_per_share=position.average_cost_per_share,
            current_price_per_share=position.current_price_per_share,
            unrealized_gain_loss=position.unrealized_gain_loss,
            unrealized_gain_loss_percent=position.unrealized_gain_loss_percent
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching position: {str(e)}"
        )


@router.post("/")
async def create_position(
    position_data: dict,
    user: dict = Depends(get_current_user)
):
    """Create a new position"""
    # TODO: Implement database insert
    return {
        "id": 1,
        "message": "Position created successfully",
        **position_data
    }


@router.put("/{position_id}")
async def update_position(
    position_id: int,
    position_data: dict,
    user: dict = Depends(get_current_user)
):
    """Update an existing position"""
    # TODO: Implement database update
    return {
        "id": position_id,
        "message": "Position updated successfully",
        **position_data
    }


@router.delete("/{position_id}")
async def delete_position(
    position_id: int,
    user: dict = Depends(get_current_user)
):
    """Delete a position"""
    # TODO: Implement database delete
    return {"message": "Position deleted successfully"}


