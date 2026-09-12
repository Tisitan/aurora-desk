#!/bin/bash
# 自启动/手动启动统一入口：--js-flags 同时压住主进程与渲染进程的 V8 老生代上限（实测 4192MB → 224MB）
cd "$(dirname "$0")" || exit 1

LOG="${XDG_STATE_HOME:-$HOME/.local/state}/aurora-desk.log"
mkdir -p "$(dirname "$LOG")" 2>/dev/null
# 24/7 常驻件：日志超 512KB 先截断，避免长期堆盘
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 524288 ]; then
  : > "$LOG"
fi

nohup ./node_modules/.bin/electron --js-flags="--max-old-space-size=128" . >> "$LOG" 2>&1 &
