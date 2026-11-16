@echo off
chcp 949 > nul
setlocal enableextensions
title Dice Board - CSV 도구
cd /d "%~dp0"

REM ── Node.js 설치 확인 ───────────────────────────────
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   [오류] Node.js가 보이지 않습니다.
    echo          https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
    echo.
    pause
    exit /b 1
)

REM ── 의존성(node_modules) 확인 · 없으면 설치 ──────────
if not exist "node_modules" (
    echo.
    echo   처음 실행이네요. 필요한 패키지를 설치합니다... 잠시 걸려요.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo   [오류] npm install 실패. 인터넷 연결을 확인하고 다시 시도하세요.
        echo.
        pause
        exit /b 1
    )
)

:menu
cls
echo.
echo  ========================================
echo    Dice Board - 데이터 CSV 도구
echo  ========================================
echo.
echo    진실원은 CSV예요. 엑셀은 편집을 돕는 사본입니다.
echo    보통 흐름:  엑셀 편집  →  [2] 내보내기  →  [3] 검사  →  [1] 다시 모으기
echo.
echo    [1] CSV 를 엑셀로 모으기       (import · 드롭다운/색 최신화)
echo    [2] 엑셀을 CSV로 내보내기      (export)
echo    [3] 데이터 검사               (validate · 필수칸/참조/맵 구조)
echo    [4] CSV에 BOM 추가            (엑셀 한글 깨짐 방지)
echo    [5] CSV를 3행 헤더로 변환      (migrate)
echo    [6] 스테이지 관리             (목록/추가/삭제)
echo    [7] 선택 표 관리              (스테이지에 선택 표 추가/삭제)
echo    [0] 종료
echo.
set "choice="
set /p "choice=  번호 입력 후 Enter: "

if "%choice%"=="1" goto do_import
if "%choice%"=="2" goto do_export
if "%choice%"=="3" goto do_validate
if "%choice%"=="4" goto do_bom
if "%choice%"=="5" goto do_migrate
if "%choice%"=="6" goto do_stage
if "%choice%"=="7" goto do_table
if "%choice%"=="0" goto bye
echo.
echo   '%choice%' 은(는) 없는 선택이에요.
timeout /t 1 >nul
goto menu

:do_import
cls
echo  [import] CSV → 마스터 1개 + 도메인 워크북 4개 ...
echo.
call npm run data:import
goto done

:do_export
cls
echo  [export] 엑셀 → CSV. 어떤 워크북에서 내보낼까요?
echo.
echo    [1] 마스터 (전체)            [기본 · 그냥 Enter]
echo    [2] map       (맵: tiles/edges/generation/tile_events)
echo    [3] narrative (시나리오: events/choices/effects/conditions/endings)
echo    [4] entity    (자원/적: stats/characters/enemies/derived/thresholds/items)
echo    [5] setup     (전역: config/stages/meta/assets)
echo    [0] 뒤로
echo.
set "args="
set "ex="
set /p "ex=  번호 입력 후 Enter: "
if "%ex%"=="0" goto menu
if "%ex%"=="2" set "args=map"
if "%ex%"=="3" set "args=narrative"
if "%ex%"=="4" set "args=entity"
if "%ex%"=="5" set "args=setup"
echo.
call npm run data:export -- %args%
goto done

:do_validate
cls
echo  [validate] 헤더/필수 칸/숫자 형식 · 깨진 참조 · 맵 구조 검사 ...
echo.
call npm run data:validate
goto done

:do_bom
cls
echo  [bom] 모든 CSV에 UTF-8 BOM 입히기 ...
echo.
call npm run data:bom
goto done

:do_migrate
cls
echo  [migrate] 옛 한 줄 머리글 → 세 줄 머리글로 변환 ...
echo.
call npm run data:migrate
goto done

:do_stage
cls
echo  [스테이지 관리] 전역 표(stats/generation/...)는 data/ 루트를 공유합니다.
echo.
echo    [1] 목록 보기                 (stage:list)
echo    [2] 새 스테이지 만들기        (stage:new · 폴더 골격 + stages.csv 등록)
echo    [3] 스테이지 삭제             (stage:rm · 폴더 + stages.csv 행 제거)
echo    [0] 뒤로
echo.
set "sc="
set /p "sc=  번호 입력 후 Enter: "
if "%sc%"=="0" goto menu
if "%sc%"=="1" goto stage_list
if "%sc%"=="2" goto stage_new
if "%sc%"=="3" goto stage_rm
echo.
echo   '%sc%' 은(는) 없는 선택이에요.
timeout /t 1 >nul
goto do_stage

:stage_list
cls
call node tools/csv-sync.mjs stage:list
goto done

:stage_new
set "sid="
set /p "sid=  새 스테이지 id (영문/숫자/_): "
if not defined sid goto do_stage
cls
call node tools/csv-sync.mjs stage:new "%sid%"
goto done

:stage_rm
set "sid="
set /p "sid=  삭제할 스테이지 id: "
if not defined sid goto do_stage
echo.
echo   [경고] '%sid%' 폴더와 stages.csv 행을 지웁니다. 되돌릴 수 없어요.
set "ok="
set /p "ok=  정말 삭제하려면 yes 입력: "
if /i not "%ok%"=="yes" goto do_stage
cls
call node tools/csv-sync.mjs stage:rm "%sid%"
goto done

:do_table
cls
echo  [선택 표 관리] 필수 표 8종 외의 선택 표를 스테이지에 더하거나 뺍니다.
echo                 빈 표는 기능 꺼짐과 같아서 게임에 영향이 없어요.
echo.
call node tools/csv-sync.mjs stage:list
echo.
echo    [1] 표 추가                   (table:add · 3행 헤더 생성 + 워크북 갱신)
echo    [2] 표 삭제                   (table:rm · 필수 표는 거부)
echo    [0] 뒤로
echo.
set "tc="
set /p "tc=  번호 입력 후 Enter: "
if "%tc%"=="0" goto menu
if "%tc%"=="1" goto table_add
if "%tc%"=="2" goto table_rm
echo.
echo   '%tc%' 은(는) 없는 선택이에요.
timeout /t 1 >nul
goto do_table

:table_add
echo.
set "sid="
set /p "sid=  대상 스테이지 id: "
if not defined sid goto do_table
echo.
echo    어떤 표를 추가할까요?
echo    [1] endings      멀티 엔딩
echo    [2] characters   시작 캐릭터 선택
echo    [3] enemies      보드 위 적
echo    [4] items        인벤토리 아이템
echo    [5] thresholds   임계 트리거
echo    [0] 뒤로
set "tt="
set /p "tt=  번호 입력 후 Enter: "
if "%tt%"=="0" goto do_table
set "tname="
if "%tt%"=="1" set "tname=endings"
if "%tt%"=="2" set "tname=characters"
if "%tt%"=="3" set "tname=enemies"
if "%tt%"=="4" set "tname=items"
if "%tt%"=="5" set "tname=thresholds"
if not defined tname goto do_table
cls
call node tools/csv-sync.mjs table:add "%sid%" "%tname%"
goto done

:table_rm
echo.
set "sid="
set /p "sid=  대상 스테이지 id: "
if not defined sid goto do_table
echo.
echo    어떤 표를 삭제할까요?
echo    [1] endings   [2] characters   [3] enemies   [4] items   [5] thresholds
echo    [0] 뒤로
set "tt="
set /p "tt=  번호 입력 후 Enter: "
if "%tt%"=="0" goto do_table
set "tname="
if "%tt%"=="1" set "tname=endings"
if "%tt%"=="2" set "tname=characters"
if "%tt%"=="3" set "tname=enemies"
if "%tt%"=="4" set "tname=items"
if "%tt%"=="5" set "tname=thresholds"
if not defined tname goto do_table
echo.
echo   [경고] %sid%\%tname%.csv 를 지웁니다. 적어 둔 행도 함께 사라져요.
set "ok="
set /p "ok=  정말 삭제하려면 yes 입력: "
if /i not "%ok%"=="yes" goto do_table
cls
call node tools/csv-sync.mjs table:rm "%sid%" "%tname%"
goto done
:done
set "rc=%errorlevel%"
echo.
echo  ----------------------------------------
if not "%rc%"=="0" goto done_err
echo   완료되었습니다.
goto done_wait
:done_err
echo   [!] 작업이 오류로 끝났어요. 코드 %rc%. 위 메시지를 확인하세요.
echo       엑셀이 파일을 열고 있으면 닫고 다시 시도하세요.
:done_wait
echo   아무 키나 누르면 메뉴로 돌아갑니다.
pause >nul
goto menu

:bye
endlocal
exit /b 0
