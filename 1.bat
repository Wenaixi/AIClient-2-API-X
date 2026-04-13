@echo off
setlocal enabledelayedexpansion

:: =================配置区域=================
set MAX_RUNS=24
set /a COUNTER=1
:: AI 执行任务的窗口时间（3000秒 = 50分钟）
set TASK_TIMEOUT=1200
:: 每轮之间的休眠时间（600秒 = 10分钟）
set COOL_DOWN=600
:: =========================================

:LOOP
cls
echo ======================================================================
echo   [究极协调者 - 24H 自动化开发模式] 第 !COUNTER! / %MAX_RUNS% 轮
echo   当前时间: %TIME%
echo ======================================================================

echo [%TIME%] 正在唤醒 AI 代理并注入高级指令...
:: 注意：此处已完整保留你的所有原意，并处理了转义和逻辑优先级
start /B "ClaudeAgent" cmd /c "claude --dangerously-skip-permissions ^"你是究极专业的全能开发工程师，讲究模块化专业化人性化的严谨性开发。开发完毕必须进行专业全面深度的单元测试（环境需符合规范）。注意：测试系统永远是旧的，你需要不断优化更新测试系统！根据错误不断死循环开发测试直到项目完美。你的交付物应该是一套究极完善的测试系统和完美的项目。你需要在根目录维护CLAUDE.md记忆关键信息，每次对话都要读取并完善它（检查对错、修正、补充缺失，让其不断优雅专业）。在.agent文件夹不断维护Requirement.md、Design.md、Task.md，采用规范驱动开发，每个文件都要不断维护庞大，更新开发思路与进展，保证稳健可行稳定的开发（这四个文件要git忽略）。你每步操作前必须简洁说明要干什么、为什么，人性化语言逻辑清晰。深度分析本地pro对比main的所有修改，深度分析 E:\newCC\stick\AlClient-2-APIAlClient-2-API\CLIProxyAPI-6.9.15 的实现进行参考，参考好main分支。然后自我判断决策最佳方案，制定优化方案TASK，逐步完成开发加fix all，进入单元测试开发循环直至最佳。最后仅git备份pro，绝不修改main，绝不修改或推送云端。之后不用问我问题和切换模式，保持 bypass permissions on，自主决策工作，开始自我循环优化此项目。^""

echo [%TIME%] AI 正在进行深度审计、TDD 循环与文档维护...
echo [注意] 本轮任务限时 %TASK_TIMEOUT% 秒，到点将强制返回。

:: 倒计时显示
timeout /t %TASK_TIMEOUT% /nobreak >nul

echo.
echo ----------------------------------------------------------------------
echo [%TIME%] 时间到！执行物理强制终止流程...
:: 强制杀掉 Claude 及其可能派生的所有子进程（如编译器、Node 环境等）
taskkill /F /IM claude.exe /T >nul 2>&1
taskkill /F /IM node.exe /T >nul 2>&1
echo [%TIME%] 会话已清理，所有更改已由 AI 自动 Commit 备份。
echo ----------------------------------------------------------------------

if !COUNTER! geq %MAX_RUNS% (
    echo [完成] 24 小时全周期全自动化任务已圆满结束。
    pause
    exit /b
)

set /a COUNTER+=1
echo [休眠] 进入冷却阶段，等待下一小时循环...
timeout /t %COOL_DOWN% /nobreak
goto LOOP