"""
FastAPI Backend for Realtime Voice Agent
Run with: uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Realtime Voice Agent API")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

class ChatMessage(BaseModel):
    message: str

@app.get("/")
async def root():
    return {"status": "ok", "message": "Realtime Voice Agent API is running"}

@app.post("/api/realtime-session")
async def create_realtime_session():
    """
    Create an ephemeral token for OpenAI Realtime API WebRTC connection
    """
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/realtime/sessions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-realtime-preview-2024-12-17",
                    "voice": "shimmer",
                    "instructions": """You are a friendly and helpful AI IT Support Agent named Aria. You have a warm, sweet, and polite personality.

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
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.text)
            
            return response.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai-chat")
async def ai_chat(request: ChatMessage):
    """
    Simple text chat with AI (non-realtime)
    """
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")
    
    try:
        async with httpx.AsyncClient() as client:
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
                            "content": "You are Aria, a friendly IT support agent. Be helpful, warm, and concise."
                        },
                        {
                            "role": "user",
                            "content": request.message
                        }
                    ]
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.text)
            
            data = response.json()
            return {"response": data["choices"][0]["message"]["content"]}
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
