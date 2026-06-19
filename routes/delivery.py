from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db, DeliveryTracking

router = APIRouter(prefix="/api/delivery", tags=["Delivery"])


@router.get("/track/{order_id}")
async def track_delivery(order_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DeliveryTracking)
        .where(DeliveryTracking.order_id == order_id)
        .order_by(DeliveryTracking.timestamp)
    )
    records = result.scalars().all()
    return [
        {"status": r.status.value, "note": r.note, "timestamp": r.timestamp.isoformat()}
        for r in records
    ]