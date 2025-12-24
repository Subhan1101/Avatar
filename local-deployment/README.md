# Aria - Realtime Voice Agent (Local Deployment)

A local FastAPI-based deployment of the Aria AI Voice Assistant using OpenAI's Realtime API.

## Prerequisites

- Python 3.9+
- OpenAI API Key with Realtime API access
- Modern browser (Chrome, Firefox, Edge)

## Quick Start

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Run the server
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

Simply open `frontend/index.html` in your browser, or serve it with a simple HTTP server:

```bash
cd frontend

# Using Python
python -m http.server 3000

# Or using Node.js (if installed)
npx serve -p 3000
```

Then open http://localhost:3000 in your browser.

## Usage

1. Make sure the FastAPI backend is running on port 8000
2. Open the frontend in your browser
3. Click "Start Conversation"
4. Allow microphone access when prompted
5. Start speaking to Aria!

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Browser      │────▶│    FastAPI      │────▶│  OpenAI API     │
│   (Frontend)    │     │   (Backend)     │     │  (Realtime)     │
│                 │◀────│                 │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        │         WebRTC Audio Stream                   │
        └───────────────────────────────────────────────┘
```

## API Endpoints

- `GET /` - Health check
- `POST /api/realtime-session` - Get ephemeral token for WebRTC connection
- `POST /api/ai-chat` - Text-based chat (non-realtime)

## Customization

### Change Voice
Edit `backend/main.py` and change the `voice` parameter:
- Options: `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`

### Modify System Prompt
Edit the `instructions` in `backend/main.py` to customize Aria's personality and capabilities.

## Troubleshooting

### "OPENAI_API_KEY is not configured"
Make sure you've created the `.env` file and added your API key.

### "Failed to get session token"
Check that the FastAPI server is running on port 8000.

### No audio output
Make sure your browser has permission to play audio and your speakers are working.

### Microphone not working
Check browser permissions and ensure no other application is using the microphone.

## Files Structure

```
local-deployment/
├── backend/
│   ├── main.py           # FastAPI server
│   ├── requirements.txt  # Python dependencies
│   └── .env.example      # Environment template
├── frontend/
│   └── index.html        # Single-page app
└── README.md             # This file
```

## License

MIT License
