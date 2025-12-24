#!/bin/bash

echo "============================================"
echo "  Aria - Realtime Voice Agent Launcher"
echo "============================================"
echo ""

cd backend

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install -r requirements.txt -q

if [ ! -f ".env" ]; then
    echo ""
    echo "ERROR: .env file not found!"
    echo "Please copy .env.example to .env and add your OPENAI_API_KEY"
    echo ""
    exit 1
fi

echo ""
echo "Starting server..."
echo ""
python main.py
