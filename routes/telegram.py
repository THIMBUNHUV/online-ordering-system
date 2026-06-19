import secrets
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from database import get_db, User
from config import TELEGRAM_BOT_TOKEN

router = APIRouter(tags=["Telegram"])

TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

async def send_telegram_message(chat_id: str, text: str):
    """អនុញ្ញាតឲ្យ Backend ផ្ញើសារទៅកាន់ Telegram User"""
    if not chat_id:
        return
    try:
        async with httpx.AsyncClient() as client:
            await client.post(f"{TELEGRAM_API}/sendMessage", json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML"
            })
    except Exception as e:
        print("Failed to send Telegram message:", e)


@router.post("/webhook")
async def telegram_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """ទទួល Webhook ពី Telegram ពេល User ចុច Start ឬបញ្ជាទិញ"""
    data = await request.json()
    
    if "message" in data:
        chat_id = str(data["message"]["chat"]["id"])
        text = data["message"].get("text", "")
        
        # ពេល User ចុច /start <code>
        if text.startswith("/start "):
            token = text.split(" ")[1]
            result = await db.execute(select(User).where(User.telegram_link_token == token))
            user = result.scalar_one_or_none()
            
            if user:
                user.telegram_chat_id = chat_id
                user.telegram_link_token = None # លុប Token បន្ទាប់ពីប្រើរួច
                await db.commit()
                
                # ផ្ញើសារស្វាគមន៍
                await send_telegram_message(chat_id, f"សូមស្វាគមន៍ <b>{user.name}</b>! 🎉\nអ្នកនឹងទទួលបានការជូនដំណឹងពីការបញ្ជាទិញតាម Telegram នេះ។")
            else:
                await send_telegram_message(chat_id, "កូដភ្ជាប់មិនត្រឹមត្រូវទេ សូមពិនិត្យម្តងទៀត។")
                
    return {"ok": True}