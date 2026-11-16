@echo off
chcp 949 > nul
setlocal enableextensions
title Dice Board - 개발 서버
cd /d "%~dp0"

echo.
echo  ========================================
echo    Dice Board - Dev Server
echo  ========================================
echo.

REM ── Node.js 설치 확인 ───────────────────────────────
where node >nul 2>nul
if errorlevel 1 (
    echo   [오류] Node.js가 보이지 않습니다.
    echo          https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
    echo.
    pause
    exit /b 1
)

REM ── 의존성(node_modules) 확인 · 없으면 설치 ──────────
if not exist "node_modules" (
    echo   [1/2] 패키지 설치 중... 처음 한 번만, 조금 걸려요.
    call npm install
    if errorlevel 1 (
        echo   [오류] npm install 실패. 인터넷 연결을 확인하세요.
        echo.
        pause
        exit /b 1
    )
    echo   [1/2] 설치 완료
    echo.
)

echo   [2/2] 서버 시작 중...
echo   브라우저: http://localhost:5173
echo   종료하려면 이 창에서 Ctrl+C
echo.

REM ── 3초 뒤 브라우저 자동 열기 (백그라운드) ──────────
start "" cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:5173"

REM ── Vite 개발 서버 실행 (Ctrl+C 전까지 점유) ────────
call npm run dev

echo.
echo  ----------------------------------------
echo   서버가 종료되었습니다. 아무 키나 누르면 창이 닫혀요.
pause >nul
endlocal
exit /b 0
