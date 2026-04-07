#!/bin/bash
# 搜索 Kimi OAuth 相关的日志
LOGFILE="logs/app-2026-04-06-1775491629746.log"
grep -n "Kimi OAuth" "$LOGFILE" | grep -v "image_url\|base64\|AI Monitor\|Req.*Req" | head -50
