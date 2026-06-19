from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from routes import payment
from routes.telegram import send_telegram_message
from ws_manager import ws_manager
from database import PaymentStatus, get_db, User, Order, OrderItem, FoodItem, DeliveryTracking, Payment, OrderStatus, Notification, UserRole
from security import get_user_from_token
from schemas import CreateOrderInput
from datetime import datetime

router = APIRouter(prefix="/api/orders", tags=["Orders"])


@router.post("")
async def create_order(
    data: CreateOrderInput,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_from_token(authorization, db)

    order_items = []
    total = 0.0
    for item in data.items:
        result = await db.execute(select(FoodItem).where(FoodItem.id == item.food_item_id))
        food = result.scalar_one_or_none()
        if not food or not food.is_available:
            raise HTTPException(status_code=400, detail=f"Food item {item.food_item_id} not available")
        total += food.price * item.quantity
        order_items.append({"food": food, "quantity": item.quantity, "price": food.price})

    order = Order(
        user_id=user.id,
        total_amount=total,
        delivery_address=data.delivery_address,
        phone=data.phone,
        notes=data.notes,
        status=OrderStatus.pending
    )
    db.add(order)
    await db.flush()

    for oi in order_items:
        item = OrderItem(
            order_id=order.id,
            food_item_id=oi["food"].id,
            quantity=oi["quantity"],
            price=oi["price"]
        )
        db.add(item)

    tracking = DeliveryTracking(
        order_id=order.id,
        status=OrderStatus.pending,
        note="Order placed successfully"
    )
    db.add(tracking)

     # ── ផ្ញើសារជូន Admin តាម WebSocket ──
    admins_result = await db.execute(select(User).where(User.role == UserRole.admin))
    admins = admins_result.scalars().all()
    
    # រៀបចំសារដែលនឹងផ្ញើ
    ws_message = {
        "type": "order",
        "title": "មានការបញ្ជាទិញថ្មី",
        "message": f"ការបញ្ជាទិញ #{order.id} ពី {user.name} - ចំនួន ${order.total_amount}$",
        "related_id": order.id
    }
    
    # 1. ផ្ញើភ្លាមៗទៅកាន់ Admin ដែលកំពុងកុំព្យូទ័រ (Online)
    for admin_user in admins:
        await ws_manager.send_to_user(admin_user.id, ws_message)
    
    # ដាក់ក្នុង loop ផ្ញើដល់ Admin
    for admin_user in admins:
        if admin_user.telegram_chat_id:
            await send_telegram_message(
                admin_user.telegram_chat_id, 
                f"🛒 <b>មានការបញ្ជាទិញថ្មី!</b>\nOrder #{order.id} ពី {user.name}\nចំនួន: ${order.total_amount}"
            )
        
    # 2. រក្សាទុកចូល Database សម្រាប់ Admin ដែលមិននៅក្នុងគេហទំពរ (Offline)
    for admin_user in admins:
        notif = Notification(
            user_id=admin_user.id, 
            title=ws_message["title"], 
            message=ws_message["message"], 
            type="order", 
            related_id=order.id
        )
        db.add(notif)
    await db.commit()
    await db.refresh(order)

  # ═══════════════════════════════════════════════════
    # ផ្ញើសារជូនដំណឹងដល់ Admin តាម WebSocket និង Database
    # ═══════════════════════════════════════════════════
    try:
        admins_result = await db.execute(select(User).where(User.role == UserRole.admin))
        admins = admins_result.scalars().all()
        
        ws_message = {
            "type": "order",
            "title": "មានការបញ្ជាទិញថ្មី",
            "message": f"ការបញ្ជាទិញ #{order.id} ពី {user.name} - ${order.total_amount}",
            "related_id": order.id
        }
        
        # 1. ផ្ញើដោយស្វ័យប្រវត្តិទៅ Admin ដែលកំពុងកុំព្យូទ័រ (WebSocket)
        for admin_user in admins:
            await ws_manager.send_to_user(admin_user.id, ws_message)
            
        # 2. រក្សាទុកចូល Database សម្រាប់ Admin ដែលមិននៅលើគេហទំពរ (Offline)
        for admin_user in admins:
            notif = Notification(
                user_id=admin_user.id, 
                title=ws_message["title"], 
                message=ws_message["message"], 
                type="order", 
                related_id=order.id
            )
            db.add(notif)
        await db.commit()
    except Exception as e:
        print("Notification error:", e) # ប្រសិនបើមានបញ្ហា កុំឲ្យបំផ្លាញការបញ្ជាទិញ
    

    return {
        "id": order.id,
        "total_amount": order.total_amount,
        "status": order.status.value,
        "created_at": order.created_at.isoformat(),
        "items": [
            {
                "food_item_id": oi["food"].id,
                "name": oi["food"].name,
                "quantity": oi["quantity"],
                "price": oi["price"]
            }
            for oi in order_items
        ]
    }


@router.get("")
async def get_orders(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_from_token(authorization, db)

    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.user),
            selectinload(Order.items).selectinload(OrderItem.food_item)
        )
        .where(Order.user_id == user.id)
        .order_by(desc(Order.created_at))
    )
    orders = result.scalars().all()

    return [
        {
            "id": o.id,
            "total_amount": float(o.total_amount),
            "status": o.status.value,
            "delivery_address": o.delivery_address,
            "phone": o.phone,
            "notes": o.notes or "",
            "created_at": o.created_at.isoformat(),
            "item_count": len(o.items),
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


@router.get("/{order_id}")
async def get_order_detail(
    order_id: int,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_from_token(authorization, db)

    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.food_item),
            selectinload(Order.user)
        )
        .where(Order.id == order_id, Order.user_id == user.id)
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
                "name": oi.food_item.name if oi.food_item else "Unknown Item",
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

@router.post("/{order_id}/cancel-unpaid")
async def cancel_unpaid_order(
    order_id: int,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_from_token(authorization, db)
    result = await db.execute(select(Order).where(Order.id == order_id, Order.user_id == user.id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    # អនុញ្ញាតឲ្យបោះបង់តែពេលស្ថានភាពជា Pending ទេ
    if order.status != OrderStatus.pending:
        raise HTTPException(status_code=400, detail="Order cannot be cancelled anymore")
        
    pay_result = await db.execute(select(Payment).where(Payment.order_id == order_id))
    payment = pay_result.scalar_one_or_none()
    if payment and payment.status != PaymentStatus.pending:
        raise HTTPException(status_code=400, detail="Payment already processed")
        
    # បោះបង់ការបញ្ជាទិញ និងទឹកប្រាក់
    order.status = OrderStatus.cancelled
    order.updated_at = datetime.utcnow()
    if payment:
        payment.status = PaymentStatus.cancelled
        
    tracking = DeliveryTracking(
        order_id=order_id,
        status=OrderStatus.cancelled,
        note="Payment window closed by user"
    )
    db.add(tracking)
    
    await db.commit()
    return {"message": "Order cancelled successfully"}
  