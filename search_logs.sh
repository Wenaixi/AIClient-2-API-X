#!/bin/bash
# 搜索 Kimi OAuth 相关的日志
# 用法: ./search_logs.sh [日志文件路径]
# 如果不指定日志文件，则默认匹配当天日期的日志
LOGFILE="${1:-logs/app-$(date +%Y-%m-%d)*.log}"
grep -n "Kimi OAuth" "$LOGFILE" | grep -v "image_url\|base64\|AI Monitor\|Req.*Req" | head -50
