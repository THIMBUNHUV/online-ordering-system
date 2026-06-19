# routes/ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import jwt, JWTError

from config import SECRET_KEY, ALGORITHM
from ws_manager import ws_manager

router = APIRouter(tags=["WebSockets"])

@router.websocket("/ws/notifications/{token}")
async def websocket_notifications(websocket: WebSocket, token: str):
    # ត្រួតពិនិត្យថា Token ត្រឹមត្រូវហើយអត់
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        if not user_id:
            await websocket.close(code=1008)
            return
    except (JWTError, ValueError):
        await websocket.close(code=1008) # បដិសេធការតភ្ជាប់ប្រសិនបើ Token ខុស
        return

    # ដាក់អ្នកប្រើចូលទៅក្នុងបញ្ជីអ្នកតភ្ជាប់
    await ws_manager.connect(user_id, websocket)
    try:
        # ទុកការតភ្ជាប់នេះឲ្យនៅតែពេលដែលអ្នកប្រើមិនបានបិទគេហទំពរ
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        # ពេលអ្នកប្រើបិទ Tab ឬ Browser ដកវាចេញពីបញ្ជី
        await ws_manager.disconnect(user_id, websocket)