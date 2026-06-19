from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db, Category, FoodItem

router = APIRouter(prefix="/api/menu", tags=["Menu"])


@router.get("/categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).order_by(Category.sort_order))
    categories = result.scalars().all()
    return [{"id": c.id, "name": c.name, "icon": c.icon} for c in categories]


@router.get("/items")
async def get_menu_items(
    category_id: Optional[int] = None,
    available_only: bool = True,
    db: AsyncSession = Depends(get_db)
):
    query = select(FoodItem).options(selectinload(FoodItem.category))
    if available_only:
        query = query.where(FoodItem.is_available == True)
    if category_id:
        query = query.where(FoodItem.category_id == category_id)
    query = query.order_by(FoodItem.id)

    result = await db.execute(query)
    items = result.scalars().all()
    return [
        {
            "id": i.id, "name": i.name, "description": i.description,
            "price": i.price, "image_url": i.image_url,
            "category_id": i.category_id, "is_available": i.is_available,
            "category_name": i.category.name if i.category else None
        }
        for i in items
    ]


@router.get("/search")
async def search_items(q: str, db: AsyncSession = Depends(get_db)):
    query = select(FoodItem).where(
        FoodItem.is_available == True,
        (FoodItem.name.ilike(f"%{q}%") | FoodItem.description.ilike(f"%{q}%"))
    )
    result = await db.execute(query)
    items = result.scalars().all()
    return [
        {
            "id": i.id, "name": i.name, "description": i.description,
            "price": i.price, "image_url": i.image_url, "category_id": i.category_id,
            "category_name": i.category.name if i.category else None
        }
        for i in items
    ]