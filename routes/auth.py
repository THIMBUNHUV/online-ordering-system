from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException , Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db, User, UserRole
from security import hash_password, verify_password, create_access_token, get_user_from_token
from schemas import RegisterInput, LoginInput, UpdateProfileInput, ChangePasswordInput
import os
import secrets
import httpx
from fastapi.responses import RedirectResponse
from urllib.parse import urlencode
from json import dumps
import json
from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI



router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/register")
async def register(data: RegisterInput, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        phone=data.phone,
        role=UserRole.customer
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {
        "token": token,
        "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role.value}
    }


@router.post("/login")
async def login(data: LoginInput, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {
        "token": token,
        "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role.value}
    }


@router.get("/me")
async def get_me(authorization: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    user = await get_user_from_token(authorization, db)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role.value,
        "phone": user.phone
    }


# ══════════════════════════════════════════════════════
# Profile Endpoints
# ══════════════════════════════════════════════════════
@router.put("/profile")
async def update_profile(
    data: UpdateProfileInput,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_from_token(authorization, db)

    if not data.name or data.name.strip() == "":
        raise HTTPException(status_code=400, detail="Name is required")

    user.name = data.name.strip()
    user.phone = data.phone.strip() if data.phone and data.phone.strip() else None

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {
        "message": "Profile updated successfully",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role.value,
            "phone": user.phone
        }
    }


@router.put("/change-password")
async def change_password(
    data: ChangePasswordInput,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_from_token(authorization, db)

    # Verify current password
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # Validate new password
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    # Check passwords match
    if data.new_password != data.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")

    # Don't allow same password
    if verify_password(data.new_password, user.password_hash):
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    # Update password
    user.password_hash = hash_password(data.new_password)
    db.add(user)
    await db.commit()

    return {"message": "Password changed successfully"}

@router.get("/google")
async def google_login():
    state = secrets.token_urlsafe(16)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
    }
    google_auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url=google_auth_url)


@router.get("/google/callback")
async def google_callback(request: Request, code: str, db: AsyncSession = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        # 1. យក Code ទៅចាត់ទឹកប្រាក់ Access Token
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code"
            }
        )
        token_data = token_res.json()
        if "access_token" not in token_data:
            raise HTTPException(status_code=400, detail="Failed to get Google access token")
            
        # 2. យក Access Token ទៅសួររក Profile អ្នកប្រើ
        user_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"}
        )
        google_user = user_res.json()

    # 3. ស្វែងរកអ្នកប្រើក្នុង Database របស់យើង ថាមានអត់
    result = await db.execute(select(User).where(User.email == google_user["email"]))
    user = result.scalar_one_or_none()
    
    if not user:
        # ប្រសិនបានគេអត់មានទេ គេបង្កើត Account ថ្មីឲ្យស្វ័យប្រវត្តិ
        user = User(
            name=google_user.get("name", "Google User"),
            email=google_user["email"],
            password_hash=hash_password(os.urandom(32).hex()), # ពាក្យសម្ងាត់សម្រាប់ Google User
            phone=None,
            role=UserRole.customer
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # 4. បង្កើត JWT Token របស់យើង
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    
    # 5. ស្ត្រូវទៅកាន់ Frontend ជាមួយ Token
    user_data = {"id": user.id, "name": user.name, "email": user.email, "role": user.role.value, "phone": user.phone}
    params = {"token": token, "user": dumps(user_data)}
    
    frontend_url = f"http://{request.url.netloc}/?{urlencode(params)}"
    return RedirectResponse(url=frontend_url)


@router.post("/facebook")
async def facebook_login(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    try:
        body = await request.json()
        fb_token = body.get("access_token")

        if not fb_token:
            raise HTTPException(
                status_code=400,
                detail="Missing Facebook access token"
            )

        async with httpx.AsyncClient() as client:
            fb_res = await client.get(
                "https://graph.facebook.com/me",
                params={
                    "fields": "id,name,email,picture",
                    "access_token": fb_token
                }
            )

        if fb_res.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail="Failed to verify Facebook token"
            )

        fb_user = fb_res.json()

        if "error" in fb_user:
            raise HTTPException(
                status_code=400,
                detail=fb_user["error"].get("message", "Facebook error")
            )

        fb_id = fb_user.get("id")
        email = fb_user.get("email")
        name = fb_user.get("name", "Facebook User")

        # Facebook account ខ្លះមិនមាន email
        if not email:
            email = f"{fb_id}@facebook.local"

        result = await db.execute(
            select(User).where(User.email == email)
        )
        user = result.scalar_one_or_none()

        if not user:
            user = User(
                name=name,
                email=email,
                password_hash=hash_password(
                    os.urandom(32).hex()
                ),
                phone=None,
                role=UserRole.customer
            )

            db.add(user)
            await db.commit()
            await db.refresh(user)

        token = create_access_token({
            "sub": str(user.id),
            "role": user.role.value
        })

        return {
            "success": True,
            "token": token,
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role.value,
                "phone": user.phone
            }
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Facebook Login Error:", str(e))

        raise HTTPException(
            status_code=500,
            detail=f"Facebook login failed: {str(e)}"
        )


@router.get("/telegram/generate-link")
async def generate_telegram_link(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_from_token(authorization, db)
    
    # បង្កើតកូដសម្ងាត់ ៦ តួអក្សរ
    link_token = secrets.token_urlsafe(6)
    user.telegram_link_token = link_token
    await db.commit()
    
    # បង្កើតតំណភ្ជាប់ឲ្យចុច
    telegram_link = f"https://t.me/Vee_Zee_bot?start={link_token}"
    
    return {
        "telegram_link": telegram_link,
        "is_linked": bool(user.telegram_chat_id)
    }