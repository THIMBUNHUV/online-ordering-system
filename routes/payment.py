from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import DeliveryTracking, get_db, Order, Payment, OrderStatus, PaymentStatus
from security import get_user_from_token

# ── QR Code Support (Optional bakong_khqr) ────────────────
try:
    from bakong_khqr import KHQR
    BAKONG_AVAILABLE = True
except ImportError:
    BAKONG_AVAILABLE = False

import qrcode

router = APIRouter(prefix="/api/payment", tags=["Payment"])



@router.post("/generate-qr/{order_id}")
async def generate_payment_qr(
    order_id: int,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_from_token(authorization, db)
    result = await db.execute(select(Order).where(Order.id == order_id, Order.user_id == user.id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    pay_result = await db.execute(select(Payment).where(Payment.order_id == order_id))
    payment = pay_result.scalar_one_or_none()

    if payment and payment.qr_code_path:
        return {
            "qr_code_path": payment.qr_code_path,
            "amount": payment.amount,
            "status": payment.status.value
        }

    amount = order.total_amount

    # បង្កើត QR ពិតប្រាកដតែមួយ (លុប test_mode ចេញ)
    if BAKONG_AVAILABLE:
        khqr = KHQR()
        qr_string = khqr.create_qr(
            bank_account="soeun_sovannarith@aclb",
            merchant_name="Ventro",
            merchant_city="Phnom Penh",
            amount=amount,
            currency="KHR",
            store_label="Ventro",
            phone_number="85516992144",
            terminal_label=f"Web Order #{order_id}",
        )
    else:
        qr_string = f"ventro://pay?order={order_id}&amount={amount}&currency=KHR"
        
    file_name = f"ORDER_{order_id}.png"
    file_path = f"qr_codes/{file_name}"
    img = qrcode.make(qr_string)
    img.save(file_path)

    if not payment:
        payment = Payment(
            order_id=order_id,
            amount=amount,
            status=PaymentStatus.pending,
            qr_code_path=f"/qr_codes/{file_name}",
            khqr_string=qr_string
        )
        db.add(payment)
    else:
        payment.qr_code_path = f"/qr_codes/{file_name}"
        payment.khqr_string = qr_string

    await db.commit()

    return {
        "qr_code_path": f"/qr_codes/{file_name}",
        "amount": amount,
        "status": PaymentStatus.pending.value
    }
