"""
FastAPI Backend for Aria - Realtime Voice Agent
================================================
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

# Load environment variables
load_dotenv()

app = FastAPI(
    title="Aria - Realtime Voice Agent API",
    description="FastAPI backend for OpenAI Realtime Voice API",
    version="1.0.0"
)

# CORS configuration - Allow all origins for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get API key from environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


class ChatMessage(BaseModel):
    message: str


class SessionConfig(BaseModel):
    voice: str = "shimmer"
    instructions: str = None


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "ok",
        "message": "Aria Realtime Voice Agent API is running",
        "version": "1.0.0"
    }


@app.get("/api/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "openai_configured": bool(OPENAI_API_KEY),
    }


@app.post("/api/realtime-session")
async def create_realtime_session(config: SessionConfig = None):
    """
    Create an ephemeral token for OpenAI Realtime API WebRTC connection.
    This token is used client-side to establish a direct WebRTC connection.
    """
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not configured. Please add it to your .env file."
        )

    # Default instructions for Aria
    default_instructions = """You are a friendly and helpful AI IT Support Agent named Aria. You have a warm, sweet, and polite personality.

Key behaviors:
- Greet users warmly with a cheerful tone
- Be patient, understanding, and genuinely caring
- Speak in a gentle, reassuring manner
- Use friendly phrases like "I'd be happy to help!", "No worries!", "Let me help you with that"
- Ask clarifying questions politely
- Celebrate small wins with the user ("Great job!", "That's perfect!")
- If you cannot solve an issue, apologize sincerely and offer alternatives

Your speaking style:
- Keep responses concise but warm
- Use a conversational, friendly tone
- Sound enthusiastic and positive
- Be encouraging and supportive

Common issues you can help with:
- Login and password problems
- Software installation and configuration
- Network connectivity issues
- Email and calendar problems
- VPN and remote access setup
- Basic hardware troubleshooting

Always make users feel valued and heard. End conversations on a positive note."""

    voice = "shimmer"
    instructions = default_instructions

    if config:
        voice = config.voice or "shimmer"
        instructions = config.instructions or default_instructions

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
                    "voice": voice,
                    "instructions": instructions
                }
            )

            if response.status_code != 200:
                error_detail = response.text
                print(f"OpenAI API Error: {response.status_code} - {error_detail}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenAI API error: {error_detail}"
                )

            data = response.json()
            print("Session created successfully")
            return data

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request to OpenAI timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Network error: {str(e)}")


@app.post("/api/ai-chat")
async def ai_chat(request: ChatMessage):
    """
    Simple text chat with AI (non-realtime fallback).
    Uses GPT-4o-mini for quick text responses.
    """
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not configured"
        )

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
                        {
                            "role": "system",
                            "content": "You are Aria, a friendly and helpful IT support agent. Be warm, patient, and concise in your responses."
                        },
                        {
                            "role": "user",
                            "content": request.message
                        }
                    ],
                    "max_tokens": 500
                }
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.text
                )

            data = response.json()
            return {"response": data["choices"][0]["message"]["content"]}

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request to OpenAI timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Network error: {str(e)}")


# Serve static files from frontend directory
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

    @app.get("/app")
    async def serve_frontend():
        """Serve the frontend application"""
        return FileResponse(os.path.join(frontend_path, "index.html"))


if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 50)
    print("🚀 Starting Aria - Realtime Voice Agent")
    print("=" * 50)
    print(f"📡 API: http://localhost:8000")
    print(f"🎨 App: http://localhost:8000/app")
    print(f"📖 Docs: http://localhost:8000/docs")
    print("=" * 50 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
