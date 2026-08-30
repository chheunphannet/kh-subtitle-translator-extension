@echo off
title Manga Translation Server
echo Starting Manga Translation Server...
cd /d "%~dp0"

IF EXIST ".venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call .venv\Scripts\activate.bat
) ELSE (
    echo Virtual environment not found. Make sure you have installed dependencies.
)

echo Starting Uvicorn...
uvicorn main:app --host 0.0.0.0 --port 8000
pause
