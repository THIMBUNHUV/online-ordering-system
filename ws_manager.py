# ws_manager.py
from fastapi import WebSocket
from typing import List, Dict
import asyncio

class ConnectionManager:
    def __init__(self):
        # រក្សាទុកអ្នកប្រើតាម id ដែលតភ្ជាប់តាម WebSocket
        self.active_connections: Dict[int, List[WebSocket]] = {}
        self.lock = asyncio.Lock()

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        async with self.lock:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = []
            self.active_connections[user_id].append(websocket)

    async def disconnect(self, user_id: int, websocket: WebSocket):
        async with self.lock:
            if user_id in self.active_connections:
                self.active_connections[user_id].remove(websocket)
                # លុបចេញពី dict ប្រសិនបើគ្មានអ្នកប្រើនៅក្នុងបន្ទប់ហើយ
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]

    async def send_to_user(self, user_id: int, message: dict):
        # ផ្ញើសារទៅកាន់អ្នកប្រើតែមួយរូបតាម ID
        async with self.lock:
            if user_id in self.active_connections:
                disconnected = []
                for ws in self.active_connections[user_id]:
                    try:
                        await ws.send_json(message)
                    except:
                        disconnected.append(ws)
                # សម្អាតការតភ្ជាប់ដែលមិនដំណើរការ (បិទ Browser បន្ថែមម្តងទៀតជាដើម)
                for ws in disconnected:
                    self.active_connections[user_id].remove(ws)

ws_manager = ConnectionManager()