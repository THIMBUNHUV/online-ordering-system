import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import Base, engine
from seed import seed_data
from routes import auth, menu, orders, payment, delivery, admin, notifications, ws , telegram

# ── Application Initialization ────────────────────────────────────────────
app = FastAPI(title="Vee_Zee — Online Food Ordering", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure qr_codes directory exists
os.makedirs("qr_codes", exist_ok=True)
app.mount("/qr_codes", StaticFiles(directory="qr_codes"), name="qr_codes")

# ── Include Routers ──────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(menu.router)
app.include_router(orders.router)
app.include_router(payment.router)
app.include_router(delivery.router)
app.include_router(admin.router)
app.include_router(notifications.router)
app.include_router(ws.router)
app.include_router(telegram.router) 

# ── Database Setup ────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_data()

# ── Static Files & Frontend ───────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def serve_frontend():
    return FileResponse("static/index.html")


# ── Run ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
    