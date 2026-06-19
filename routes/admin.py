from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload
from routes.telegram import send_telegram_message
from ws_manager import ws_manager
from routes.telegram import send_telegram_message
from ws_manager import ws_manager

from database import (
    get_db, User, Category, FoodItem, Order, OrderItem,
    Payment, DeliveryTracking, UserRole, OrderStatus, PaymentStatus , Notification
)
from security import get_admin_user
from schemas import (
    CreateCategoryInput, CreateFoodItemInput, UpdateFoodItemInput,
    UpdateOrderStatusInput
)


router = APIRouter(prefix="/api/admin", tags=["Admin"])



# ══════════════════════════════════════════════════════════
# Dashboard
# ══════════════════════════════════════════════════════════
@router.get("/dashboard")
async def admin_dashboard(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)

    total_orders_result = await db.execute(select(func.count(Order.id)))
    total_orders = total_orders_result.scalar() or 0

    revenue_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.status == PaymentStatus.completed)
    )
    total_revenue = float(revenue_result.scalar() or 0)

    active_statuses = [
        OrderStatus.pending, OrderStatus.confirmed,
        OrderStatus.preparing, OrderStatus.ready, OrderStatus.out_for_delivery
    ]
    active_result = await db.execute(
        select(func.count(Order.id)).where(Order.status.in_(active_statuses))
    )
    pending_orders = active_result.scalar() or 0

    items_result = await db.execute(select(func.count(FoodItem.id)))
    total_menu_items = items_result.scalar() or 0

    recent_result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.user),
            selectinload(Order.items)
        )
        .order_by(desc(Order.created_at))
        .limit(10)
    )
    recent_orders = recent_result.scalars().all()

    return {
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "pending_orders": pending_orders,
        "total_menu_items": total_menu_items,
        "recent_orders": [
            {
                "id": o.id,
                "user_name": o.user.name if o.user else "Unknown",
                "total_amount": float(o.total_amount),
                "status": o.status.value,
                "created_at": o.created_at.isoformat(),
                "item_count": len(o.items) if o.items else 0,
            }
            for o in recent_orders
        ]
    }


# ══════════════════════════════════════════════════════════
# Categories
# ══════════════════════════════════════════════════════════
@router.get("/categories")
async def admin_get_categories(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)
    result = await db.execute(select(Category).order_by(Category.sort_order))
    categories = result.scalars().all()
    return [
        {"id": c.id, "name": c.name, "icon": c.icon, "sort_order": c.sort_order}
        for c in categories
    ]


@router.post("/categories")
async def admin_create_category(
    data: CreateCategoryInput,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)

    max_sort = await db.execute(select(func.coalesce(func.max(Category.sort_order), 0)))
    next_sort = (max_sort.scalar() or 0) + 1

    cat = Category(name=data.name, icon=data.icon, sort_order=next_sort)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "icon": cat.icon}


@router.delete("/categories/{category_id}")
async def admin_delete_category(
    category_id: int,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)

    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    items_check = await db.execute(
        select(func.count(FoodItem.id)).where(FoodItem.category_id == category_id)
    )
    item_count = items_check.scalar() or 0
    if item_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete category with {item_count} item(s). Move or delete items first."
        )

    await db.delete(cat)
    await db.commit()
    return {"message": "Category deleted successfully"}


# ══════════════════════════════════════════════════════════
# Menu Items
# ══════════════════════════════════════════════════════════
@router.get("/menu/items")
async def admin_get_menu_items(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)
    result = await db.execute(
        select(FoodItem)
        .options(selectinload(FoodItem.category))
        .order_by(FoodItem.id)
    )
    items = result.scalars().all()
    return [
        {
            "id": i.id,
            "name": i.name,
            "description": i.description,
            "price": float(i.price),
            "image_url": i.image_url,
            "category_id": i.category_id,
            "is_available": i.is_available,
            "category_name": i.category.name if i.category else None
        }
        for i in items
    ]


@router.post("/menu/items")
async def admin_create_item(
    data: CreateFoodItemInput,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)

    cat_result = await db.execute(select(Category).where(Category.id == data.category_id))
    if not cat_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Category not found")

    item = FoodItem(
        name=data.name,
        description=data.description,
        price=data.price,
        image_url=data.image_url,
        category_id=data.category_id,
        is_available=data.is_available
    )
    db.add(item)
     # ── ផ្ញើសារជូនអតិថិជនពីម្ហូបថ្មី ──
    customers_result = await db.execute(select(User).where(User.role == UserRole.customer))
    customers = customers_result.scalars().all()
    
    ws_message = {
        "type": "menu",
        "title": "មានម្ហូបថ្មី!",
        "message": f"សាកល្បងមើលម្ហូបថ្មី '{data.name}' តម្លៃ {data.price}$ !",
        "related_id": item.id
    }
    
    # ផ្ញើទៅគ្រប់អតិថិជនដែលកំពុង Open គេហទំពរ
    for customer in customers:
        await ws_manager.send_to_user(customer.id, ws_message)
        
    # រក្សាទុកក្នុង Database
    for customer in customers:
        notif = Notification(
            user_id=customer.id, 
            title=ws_message["title"], 
            message=ws_message["message"], 
            type="menu", 
            related_id=item.id
        )
        db.add(notif)
    await db.commit()
    await db.refresh(item)

    cat = cat_result.scalar_one_or_none()
    return {
        "id": item.id,
        "name": item.name,
        "price": float(item.price),
        "category_name": cat.name if cat else None,
        "message": "Item created successfully"
    }


@router.put("/menu/items/{item_id}")
async def admin_update_item(
    item_id: int,
    data: UpdateFoodItemInput,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)

    result = await db.execute(select(FoodItem).where(FoodItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if data.category_id is not None:
        cat_check = await db.execute(select(Category).where(Category.id == data.category_id))
        if not cat_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Category not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)

    await db.commit()
    return {"id": item.id, "name": item.name, "message": "Item updated successfully"}


@router.delete("/menu/items/{item_id}")
async def admin_delete_item(
    item_id: int,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)

    result = await db.execute(select(FoodItem).where(FoodItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    active_statuses = [
        OrderStatus.pending, OrderStatus.confirmed,
        OrderStatus.preparing, OrderStatus.ready, OrderStatus.out_for_delivery
    ]
    check_result = await db.execute(
        select(OrderItem)
        .join(Order).where(
            OrderItem.food_item_id == item_id,
            Order.status.in_(active_statuses)
        )
    )
    if check_result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Cannot delete item that is part of an active order"
        )

    await db.delete(item)
    await db.commit()
    return {"message": "Item deleted successfully"}


# ══════════════════════════════════════════════════════════
# Orders
# ══════════════════════════════════════════════════════════
@router.get("/orders")
async def admin_get_orders(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)

    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.user),
            selectinload(Order.items).selectinload(OrderItem.food_item)
        )
        .order_by(desc(Order.created_at))
    )
    orders = result.scalars().all()

    return [
        {
            "id": o.id,
            "user_name": o.user.name if o.user else "Unknown",
            "phone": o.phone,
            "total_amount": float(o.total_amount),
            "status": o.status.value,
            "delivery_address": o.delivery_address,
            "notes": o.notes or "",
            "created_at": o.created_at.isoformat(),
            "items": [
                {
                    "food_item_id": oi.food_item_id,
                    "name": oi.food_item.name if oi.food_item else "Unknown",
                    "quantity": oi.quantity,
                    "price": float(oi.price)
                }
                for oi in o.items
            ]
        }
        for o in orders
    ]


@router.get("/orders/{order_id}")
async def admin_get_order_detail(
    order_id: int,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)

    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.food_item),
            selectinload(Order.user)
        )
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    tracking_result = await db.execute(
        select(DeliveryTracking)
        .where(DeliveryTracking.order_id == order_id)
        .order_by(DeliveryTracking.timestamp)
    )
    tracking_records = tracking_result.scalars().all()

    payment_result = await db.execute(select(Payment).where(Payment.order_id == order_id))
    payment = payment_result.scalar_one_or_none()

    return {
        "id": order.id,
        "user_name": order.user.name if order.user else "Unknown",
        "user_email": order.user.email if order.user else None,
        "total_amount": float(order.total_amount),
        "status": order.status.value,
        "delivery_address": order.delivery_address,
        "phone": order.phone,
        "notes": order.notes or "",
        "created_at": order.created_at.isoformat(),
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "items": [
            {
                "id": oi.id,
                "food_item_id": oi.food_item_id,
                "name": oi.food_item.name if oi.food_item else "Unknown",
                "quantity": oi.quantity,
                "price": float(oi.price),
                "image_url": oi.food_item.image_url if oi.food_item else None
            }
            for oi in order.items
        ],
        "tracking": [
            {
                "status": t.status.value,
                "note": t.note,
                "timestamp": t.timestamp.isoformat()
            }
            for t in tracking_records
        ],
        "payment": {
            "id": payment.id,
            "status": payment.status.value,
            "qr_code_path": payment.qr_code_path,
            "amount": float(payment.amount)
        } if payment else None
    }


# @router.put("/orders/{order_id}/status")
# async def admin_update_order_status(
#     order_id: int,
#     data: UpdateOrderStatusInput,
#     authorization: Optional[str] = Header(None),
#     db: AsyncSession = Depends(get_db)
# ):
#     await get_admin_user(authorization, db)

#     result = await db.execute(
#         select(Order)
#         .options(selectinload(Order.items))
#         .where(Order.id == order_id)
#     )
#     order = result.scalar_one_or_none()
#     if not order:
#         raise HTTPException(status_code=404, detail="Order not found")

#     old_status = order.status
#     order.status = data.status
#     order.updated_at = datetime.utcnow()

#     note_messages = {
#         OrderStatus.confirmed: "Order confirmed by admin",
#         OrderStatus.preparing: "Kitchen started preparing your order",
#         OrderStatus.ready: "Order is ready for pickup/delivery",
#         OrderStatus.out_for_delivery: "Rider picked up the order",
#         OrderStatus.delivered: "Order delivered successfully",
#         OrderStatus.cancelled: "Order cancelled by admin",
#     }
#     note = data.note or note_messages.get(data.status, f"Status changed to {data.status.value}")

#     tracking = DeliveryTracking(
#         order_id=order_id,
#         status=data.status,
#         note=note
#     )
#     db.add(tracking)

#     if data.status == OrderStatus.cancelled:
#         pay_result = await db.execute(select(Payment).where(Payment.order_id == order_id))
#         payment = pay_result.scalar_one_or_none()
#         if payment and payment.status == PaymentStatus.pending:
#             payment.status = PaymentStatus.cancelled
    
#      # ── ផ្ញើសារជូនអតិថិជនពីការប្តូរស្ថានភាព ──
#     ws_message = {
#         "type": "status",
#         "title": "ធ្វើបច្ចុប្បន្នភាពការបញ្ជាទិញ",
#         "message": f"បញ្ជាទិញ #{order_id} បានប្តូរទៅជា {data.status.value.replace('_', ' ')}",
#         "related_id": order_id
#     }
#     # ផ្ញើតាម WebSocket ភ្លាមៗ
#     await ws_manager.send_to_user(order.user_id, ws_message)
    
#     # រក្សាទុកក្នុង Database សម្រាប់ប្រសិនបើអតិថិជនបិទទំព័រហើយ
#     cust_notif = Notification(
#         user_id=order.user_id,
#         title=ws_message["title"],
#         message=ws_message["message"],
#         type="status",
#         related_id=order_id
#     )
#     db.add(cust_notif)

#         # ═══════════════════════════════════════════════════
#     # ផ្ញើសារជូនដំណឹងដល់អតិថិជនពីការប្តូរស្ថានភាព
#     # ═══════════════════════════════════════════════════
#     try:
#         ws_message = {
#             "type": "status",
#             "title": "ធ្វើបច្ចុប្បន្នភាពការបញ្ជាទិញ",
#             "message": f"បញ្ជាទិញ #{order_id} បានប្តូរទៅជា {data.status.value.replace('_', ' ')}",
#             "related_id": order_id
#         }
#         # ផ្ញើតាម WebSocket ភ្លាមៗ
#         await ws_manager.send_to_user(order.user_id, ws_message)
        
#         # រក្សាទុកក្នុង Database
#         cust_notif = Notification(
#             user_id=order.user_id,
#             title=ws_message["title"],
#             message=ws_message["message"],
#             type="status",
#             related_id=order_id
#         )
#         db.add(cust_notif)
#     except Exception as e:
#         print("Notification error:", e)

#     await db.commit()

#     return {
#         "id": order.id,
#         "status": order.status.value,
#         "previous_status": old_status.value,
#         "note": note,
#         "message": f"Order #{order_id} updated to {data.status.value}"
#     }

@router.put("/orders/{order_id}/status")
async def admin_update_order_status(
    order_id: int,
    data: UpdateOrderStatusInput,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)

    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    old_status = order.status
    order.status = data.status
    order.updated_at = datetime.utcnow()

    # កំណត់សេចក្តីថ្លែងការណ៍ដោយស្វ័យប្រវត្តិ
    note_messages = {
        OrderStatus.confirmed: "Order confirmed by admin",
        OrderStatus.preparing: "Kitchen started preparing your order",
        OrderStatus.ready: "Order is ready for pickup/delivery",
        OrderStatus.out_for_delivery: "Rider picked up the order",
        OrderStatus.delivered: "Order delivered successfully",
        OrderStatus.cancelled: "Order cancelled by admin",
    }
    note = data.note or note_messages.get(data.status, f"Status changed to {data.status.value}")

    tracking = DeliveryTracking(
        order_id=order_id,
        status=data.status,
        note=note
    )
    db.add(tracking)

    # ប្រសិនបើបញ្ជាទិញត្រូវបានបោះបង់ កែសម្រួលស្ថានភាពការបង់ប្រាក់
    if data.status == OrderStatus.cancelled:
        pay_result = await db.execute(select(Payment).where(Payment.order_id == order_id))
        payment = pay_result.scalar_one_or_none()
        if payment and payment.status == PaymentStatus.pending:
            payment.status = PaymentStatus.cancelled

    # ═══════════════════════════════════════════════════
    # ផ្ញើសារជូនដំណឹងដល់អតិថិជន (WebSocket + Telegram)
    # ═══════════════════════════════════════════════════
    try:
        ws_message = {
            "type": "status",
            "title": "ធ្វើបច្ចុប្បន្នភាពការបញ្ជាទិញ",
            "message": f"បញ្ជាទិញ #{order_id} បានប្តូរទៅជា {data.status.value.replace('_', ' ')}",
            "related_id": order_id
        }
        # 1. ផ្ញើតាម WebSocket ភ្លាមៗ
        await ws_manager.send_to_user(order.user_id, ws_message)
        
        # 2. រក្សាទុកក្នុង Database
        cust_notif = Notification(
            user_id=order.user_id,
            title=ws_message["title"],
            message=ws_message["message"],
            type="status",
            related_id=order_id
        )
        db.add(cust_notif)

        # 3. ផ្ញើតាម Telegram ប្រសិនបានភ្ជាប់
        cust_result = await db.execute(select(User).where(User.id == order.user_id))
        cust_user = cust_result.scalar_one_or_none()

        if cust_user and cust_user.telegram_chat_id:
            from routes.telegram import send_telegram_message
            await send_telegram_message(
                cust_user.telegram_chat_id,
                f"🚚 <b>ធ្វើបច្ចុប្បន្នភាពការបញ្ជាទិញ</b>\nOrder #{order_id} បានប្តូរទៅជា <b>{data.status.value.replace('_', ' ').title()}</b>"
            )
    except Exception as e:
        print("Notification error:", e)

    await db.commit()

    return {
        "id": order.id,
        "status": order.status.value,
        "previous_status": old_status.value,
        "note": note,
        "message": f"Order #{order_id} updated to {data.status.value}"
    }

# ══════════════════════════════════════════════════════════
# Users
# ══════════════════════════════════════════════════════════
@router.get("/users")
async def admin_get_users(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)

    result = await db.execute(
        select(User).order_by(desc(User.created_at))
    )
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "phone": u.phone,
            "role": u.role.value,
            "created_at": u.created_at.isoformat() if u.created_at else None
        }
        for u in users
    ]


# ══════════════════════════════════════════════════════
# Admin - ផ្ទៀងផ្ទាត់ការបង់ប្រាក់ពិតប្រាកដ (Real Payment Verification)
# ══════════════════════════════════════════════════════
@router.post("/payments/verify/{order_id}")
async def admin_verify_payment(
    order_id: int,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    await get_admin_user(authorization, db)
    
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    pay_result = await db.execute(select(Payment).where(Payment.order_id == order_id))
    payment = pay_result.scalar_one_or_none()
    
    # ប្តូរស្ថានភាពទឹកប្រាក់ និងបញ្ជាទិញ
    if payment and payment.status == PaymentStatus.pending:
        payment.status = PaymentStatus.completed

    if order.status == OrderStatus.pending:
        order.status = OrderStatus.confirmed
        order.updated_at = datetime.utcnow()

        tracking = DeliveryTracking(
            order_id=order_id,
            status=OrderStatus.confirmed,
            note="Payment verified and confirmed by admin"
        )
        db.add(tracking)

        # ផ្ញើសារជូនដំណឹងដល់អតិថិជនថាទទួលបានលុយហើយ
        try:
            ws_message = {
                "type": "status",
                "title": "Payment Verified! ✅",
                "message": f"Payment for Order #{order_id} has been verified. We are preparing your food!",
                "related_id": order_id
            }
            await ws_manager.send_to_user(order.user_id, ws_message)
            
            cust_notif = Notification(
                user_id=order.user_id,
                title=ws_message["title"],
                message=ws_message["message"],
                type="status",
                related_id=order_id
            )
            db.add(cust_notif)
        except Exception as e:
            print("Notification error:", e)

    await db.commit()
    return {"message": "Payment verified successfully"}

