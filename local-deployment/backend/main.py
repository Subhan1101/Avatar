"""
FastAPI Backend for Aria - Realtime AI Avatar Agent
====================================================
Includes: D-ID Avatar + OpenAI Realtime Voice
Run with: uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Aria - Realtime AI Avatar Agent",
    description="FastAPI backend with D-ID Avatar + OpenAI Realtime Voice",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
DID_API_KEY = os.getenv("DID_API_KEY")

# Your D-ID Agent ID
DID_AGENT_ID = os.getenv("DID_AGENT_ID", "v2_agt_8rjurqlQ")


class ChatMessage(BaseModel):
    message: str


class DIDStreamRequest(BaseModel):
    action: str
    stream_id: str = None
    session_id: str = None
    answer: dict = None
    candidate: dict = None
    text: str = None


@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Aria Realtime AI Avatar Agent is running",
        "version": "1.0.0",
        "features": ["D-ID Avatar", "OpenAI Realtime Voice"]
    }


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "openai_configured": bool(OPENAI_API_KEY),
        "did_configured": bool(DID_API_KEY),
        "agent_id": DID_AGENT_ID
    }


# =============================================
# OpenAI Realtime Session (Voice Only)
# =============================================
@app.post("/api/realtime-session")
async def create_realtime_session():
    """Create ephemeral token for OpenAI Realtime API"""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/realtime/sessions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-realtime-preview-2024-12-17",
                    "voice": "shimmer",
                    "instructions": """You are Aria, a friendly AI IT Support Agent. Be warm, helpful, and concise."""
                }
            )

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.text)

            return response.json()

    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================
# D-ID Avatar Streaming
# =============================================
@app.post("/api/did-stream")
async def did_stream(request: DIDStreamRequest):
    """Handle D-ID avatar streaming operations"""
    if not DID_API_KEY:
        raise HTTPException(status_code=500, detail="DID_API_KEY not configured")

    headers = {
        "Authorization": f"Basic {DID_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            
            # CREATE STREAM - Initialize D-ID agent conversation
            if request.action == "create-stream":
                print(f"Creating D-ID stream for agent: {DID_AGENT_ID}")
                response = await client.post(
                    f"https://api.d-id.com/agents/{DID_AGENT_ID}/chat",
                    headers=headers,
                    json={}
                )
                
                if response.status_code != 200 and response.status_code != 201:
                    print(f"D-ID create error: {response.text}")
                    raise HTTPException(status_code=response.status_code, detail=response.text)
                
                data = response.json()
                print(f"Stream created: {data}")
                return {
                    "success": True,
                    "id": data.get("id") or data.get("chat_id"),
                    "session_id": data.get("session_id"),
                    "offer": data.get("offer")
                }

            # SUBMIT SDP - Send WebRTC answer
            elif request.action == "submit-sdp":
                print(f"Submitting SDP for stream: {request.stream_id}")
                response = await client.post(
                    f"https://api.d-id.com/agents/{DID_AGENT_ID}/chat/{request.stream_id}/sdp",
                    headers=headers,
                    json={
                        "answer": request.answer,
                        "session_id": request.session_id
                    }
                )
                
                if response.status_code != 200:
                    print(f"D-ID SDP error: {response.text}")
                    raise HTTPException(status_code=response.status_code, detail=response.text)
                
                return {"success": True}

            # SUBMIT ICE - Send ICE candidate
            elif request.action == "submit-ice":
                print(f"Submitting ICE for stream: {request.stream_id}")
                response = await client.post(
                    f"https://api.d-id.com/agents/{DID_AGENT_ID}/chat/{request.stream_id}/ice",
                    headers=headers,
                    json={
                        "candidate": request.candidate,
                        "session_id": request.session_id
                    }
                )
                
                if response.status_code != 200:
                    print(f"D-ID ICE error: {response.text}")
                
                return {"success": True}

            # SPEAK - Make avatar speak
            elif request.action == "speak":
                print(f"Making avatar speak: {request.text[:50]}...")
                response = await client.post(
                    f"https://api.d-id.com/agents/{DID_AGENT_ID}/chat/{request.stream_id}",
                    headers=headers,
                    json={
                        "streamId": request.stream_id,
                        "sessionId": request.session_id,
                        "messages": [
                            {
                                "role": "user", 
                                "content": request.text,
                                "created_at": ""
                            }
                        ]
                    }
                )
                
                if response.status_code != 200:
                    print(f"D-ID speak error: {response.text}")
                    raise HTTPException(status_code=response.status_code, detail=response.text)
                
                return {"success": True, "data": response.json()}

            # CLOSE STREAM
            elif request.action == "close-stream":
                print(f"Closing stream: {request.stream_id}")
                response = await client.delete(
                    f"https://api.d-id.com/agents/{DID_AGENT_ID}/chat/{request.stream_id}",
                    headers=headers
                )
                return {"success": True}

            else:
                raise HTTPException(status_code=400, detail=f"Unknown action: {request.action}")

    except httpx.RequestError as e:
        print(f"D-ID request error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================
# AI Chat (Text fallback)
# =============================================
@app.post("/api/ai-chat")
async def ai_chat(request: ChatMessage):
    """Simple text chat with AI"""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": "You are Aria, a friendly IT support agent."},
                        {"role": "user", "content": request.message}
                    ]
                }
            )

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.text)

            data = response.json()
            return {"response": data["choices"][0]["message"]["content"]}

    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=str(e))


# Serve frontend
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

    @app.get("/app")
    async def serve_frontend():
        return FileResponse(os.path.join(frontend_path, "index.html"))


if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 50)
    print("🚀 Aria - Realtime AI Avatar Agent")
    print("=" * 50)
    print(f"📡 API: http://localhost:8000")
    print(f"🎨 App: http://localhost:8000/app")
    print(f"📖 Docs: http://localhost:8000/docs")
    print(f"🤖 D-ID Agent: {DID_AGENT_ID}")
    print("=" * 50 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
