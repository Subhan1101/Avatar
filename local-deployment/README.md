# 🎙️ Aria - Realtime Voice Agent (Local Deployment)

A complete local deployment of the Aria AI Voice Assistant using FastAPI and OpenAI's Realtime API with WebRTC.

## 📁 Project Structure

```
local-deployment/
├── backend/
│   ├── main.py              # FastAPI server with all API endpoints
│   ├── requirements.txt     # Python dependencies
│   └── .env.example         # Environment variables template
├── frontend/
│   └── index.html           # Complete standalone web application
└── README.md                # This file
```

## 🔧 Prerequisites

Before you begin, make sure you have:

1. **Python 3.9 or higher** installed
   - Check with: `python --version`
   - Download: https://www.python.org/downloads/

2. **OpenAI API Key** with Realtime API access
   - Get one at: https://platform.openai.com/api-keys
   - Note: Realtime API requires a paid account

3. **A modern web browser** (Chrome, Firefox, or Edge recommended)

## 🚀 Quick Start Guide

### Step 1: Open in VS Code

Open the `local-deployment` folder in Visual Studio Code.

### Step 2: Set Up the Backend

Open a terminal in VS Code (Terminal → New Terminal) and run:

```bash
# Navigate to backend folder
cd backend

# Create a virtual environment
python -m venv venv

# Activate the virtual environment
# On Windows (Command Prompt):
venv\Scripts\activate
# On Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create your .env file
cp .env.example .env
```

### Step 3: Add Your OpenAI API Key

Edit the `.env` file and replace the placeholder with your actual API key:

```
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
```

### Step 4: Start the Backend Server

```bash
# Make sure you're in the backend folder with venv activated
python main.py
```

You should see:
```
==================================================
🚀 Starting Aria - Realtime Voice Agent
==================================================
📡 API: http://localhost:8000
🎨 App: http://localhost:8000/app
📖 Docs: http://localhost:8000/docs
==================================================
```

### Step 5: Open the App

**Option A** - Use the built-in route:
- Open http://localhost:8000/app in your browser

**Option B** - Open the HTML file directly:
- Open `frontend/index.html` in your browser

### Step 6: Start Talking!

1. Click **"Start Conversation"**
2. Allow microphone access when prompted
3. Start speaking to Aria!

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/api/health` | GET | Detailed health status |
| `/api/realtime-session` | POST | Get ephemeral token for WebRTC |
| `/api/ai-chat` | POST | Text chat fallback |
| `/docs` | GET | Interactive API documentation |
| `/app` | GET | Serve frontend application |

## 🎨 Customization

### Change Aria's Voice

Available voices: `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`

Edit `backend/main.py` and change the `voice` parameter in the `create_realtime_session` function.

### Modify Aria's Personality

Edit the `default_instructions` string in `backend/main.py` to customize how Aria behaves and responds.

### Change the UI Theme

The frontend uses Tailwind CSS. Edit `frontend/index.html` to customize colors, layout, and styling.

## 🐛 Troubleshooting

### "OPENAI_API_KEY is not configured"

Make sure you:
1. Created the `.env` file in the `backend` folder
2. Added your actual OpenAI API key
3. Restarted the server after adding the key

### "Failed to get session token"

- Check that the FastAPI server is running on port 8000
- Check the terminal for error messages
- Verify your OpenAI API key has Realtime API access

### "Microphone access denied"

- Click the lock/camera icon in your browser's address bar
- Allow microphone permissions
- Refresh the page

### No audio output

- Check your speaker volume and settings
- Make sure no other app is using the audio output
- Try a different browser

### WebRTC connection fails

- Make sure you're using HTTPS or localhost
- Check if a firewall is blocking WebRTC
- Try disabling VPN if you're using one

## 🏗️ Architecture

```
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│                  │        │                  │        │                  │
│     Browser      │───────▶│     FastAPI      │───────▶│   OpenAI API     │
│   (Frontend)     │  HTTP  │    (Backend)     │  HTTP  │                  │
│                  │◀───────│                  │◀───────│                  │
└────────┬─────────┘        └──────────────────┘        └────────┬─────────┘
         │                                                        │
         │              WebRTC Audio Stream (Direct)              │
         └────────────────────────────────────────────────────────┘
```

**Flow:**
1. Frontend requests an ephemeral token from FastAPI
2. FastAPI calls OpenAI to create a session
3. Frontend uses the token to establish WebRTC connection
4. Audio streams directly between browser and OpenAI

## 📄 License

MIT License - Feel free to use and modify!

## 🆘 Need Help?

If you run into issues:
1. Check the browser console (F12 → Console tab)
2. Check the FastAPI terminal for error messages
3. Verify all prerequisites are installed
4. Make sure your OpenAI API key is valid and has credits
