@echo off
echo ============================================
echo   Aria - Realtime Voice Agent Launcher
echo ============================================
echo.

cd backend

if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate

echo Installing dependencies...
pip install -r requirements.txt -q

if not exist ".env" (
    echo.
    echo ERROR: .env file not found!
    echo Please copy .env.example to .env and add your OPENAI_API_KEY
    echo.
    pause
    exit /b 1
)

echo.
echo Starting server...
echo.
python main.py

pause
