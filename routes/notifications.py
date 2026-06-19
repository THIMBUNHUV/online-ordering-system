from typing import Optional, List

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_

from database import get_db, Notification
from security import get_user_from_token

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("")
async def get_notifications(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_from_token(authorization, db)
    
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(desc(Notification.created_at))
        .limit(50)
    )
    notifications = result.scalars().all()
    
    unread_count = sum(1 for n in notifications if not n.is_read)
    
    return {
        "notifications": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "is_read": n.is_read,
                "related_id": n.related_id,
                "created_at": n.created_at.isoformat() if n.created_at else None
            }
            for n in notifications
        ],
        "unread_count": unread_count
    }


@router.put("/read")
async def mark_as_read(
    notification_ids: List[int] = Query(...),
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_from_token(authorization, db)
    
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.id.in_(notification_ids),
                Notification.user_id == user.id
            )
        )
    )
    notifications = result.scalars().all()
    
    for n in notifications:
        n.is_read = True
        
    await db.commit()
    return {"message": f"Marked {len(notifications)} notifications as read"}


@router.put("/read-all")
async def mark_all_as_read(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_from_token(authorization, db)
    
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.user_id == user.id,
                Notification.is_read == False
            )
        )
    )
    notifications = result.scalars().all()
    
    for n in notifications:
        n.is_read = True
        
    await db.commit()
    return {"message": "Marked all as read"}