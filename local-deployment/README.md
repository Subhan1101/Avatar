# 🤖 Aria - Realtime AI Avatar Agent (Local Deployment)

Complete local deployment with **D-ID Avatar** + **OpenAI Realtime Voice** - exactly like your Lovable project!

## 📁 Project Structure

```
local-deployment/
├── backend/
│   ├── main.py              # FastAPI server (D-ID + OpenAI)
│   ├── requirements.txt     # Python dependencies
│   └── .env.example         # API keys template
├── frontend/
│   └── index.html           # Full avatar UI
├── run.bat                  # Windows launcher
├── run.sh                   # macOS/Linux launcher
└── README.md                # This file
```

## 🔑 Required API Keys

1. **OpenAI API Key** - For voice/chat
   - Get at: https://platform.openai.com/api-keys

2. **D-ID API Key** - For avatar video
   - Get at: https://studio.d-id.com/account-settings
   - Use the base64 encoded version

3. **D-ID Agent ID** - Your custom avatar
   - Create at: https://studio.d-id.com/agents
   - Default: `v2_agt_8rjurqlQ`

## 🚀 Quick Start

### Step 1: Setup Backend

```bash
cd local-deployment/backend

# Create virtual environment
python -m venv venv

# Activate it
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
```

### Step 2: Add Your API Keys

Edit `backend/.env`:
```
OPENAI_API_KEY=sk-your-key-here
DID_API_KEY=your-did-key-here
DID_AGENT_ID=v2_agt_8rjurqlQ
```

### Step 3: Run

```bash
python main.py
```

### Step 4: Open App

Go to **http://localhost:8000/app**

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check |
| `POST /api/realtime-session` | OpenAI voice token |
| `POST /api/did-stream` | D-ID avatar control |
| `POST /api/ai-chat` | Text chat fallback |
| `GET /docs` | API documentation |
| `GET /app` | Frontend app |

## 🎨 Features

- ✅ **Live Video Avatar** - D-ID animated avatar
- ✅ **Real-time Voice** - OpenAI Realtime API
- ✅ **Text Chat** - Type messages to avatar
- ✅ **Beautiful UI** - Tailwind CSS styling
- ✅ **WebRTC** - Low-latency streaming

## 🐛 Troubleshooting

### "DID_API_KEY not configured"
Add your D-ID API key to `.env` file

### Avatar not appearing
- Check D-ID API key is correct
- Verify Agent ID exists in your D-ID account
- Check browser console for errors

### No audio
- Allow microphone permissions
- Check speaker volume

## 📄 License

MIT License
