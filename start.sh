#!/bin/bash
# 自启动/手动启动统一入口：--js-flags 同时压住主进程与渲染进程的 V8 老生代上限（实测 4192MB → 224MB）
# 不依赖调用方 shell 的 PATH/nvm：autostart、env -i、cron 等环境下 node 可能不在 PATH，
# 因此自行解析 node 再直拉 electron cli.js，绕开 .bin/electron（内部 env node）shim。
set -u

DIR="$(cd "$(dirname "$0")" && pwd)" || exit 1
cd "$DIR" || exit 1

LOG="${XDG_STATE_HOME:-$HOME/.local/state}/aurora-desk.log"
mkdir -p "$(dirname "$LOG")" 2>/dev/null
# 24/7 常驻件：日志超 512KB 先截断，避免长期堆盘
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 524288 ]; then
  : > "$LOG"
fi

# 单实例：命中本项目路径的 electron（cli.js 包装进程或 dist/electron 进程树）即视为已在跑
# env -i 下无 locale 会让 pgrep 无法匹配含 UTF-8 中文路径的 ERE，这里兜底 C.UTF-8
if LC_ALL="${LC_ALL:-C.UTF-8}" pgrep -f "$DIR/node_modules/electron" >/dev/null 2>&1; then
  echo "already running"
  exit 0
fi

# 解析 node：PATH → $NVM_DIR 最新版本 → nvm 固定目录里版本号最大者 → /usr/bin/node
NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ] && [ -n "${NVM_DIR:-}" ] && [ -d "$NVM_DIR/versions/node" ]; then
  _nv="$(ls -v "$NVM_DIR/versions/node" 2>/dev/null | tail -1)"
  [ -n "$_nv" ] && [ -x "$NVM_DIR/versions/node/$_nv/bin/node" ] && NODE_BIN="$NVM_DIR/versions/node/$_nv/bin/node"
fi
if [ -z "$NODE_BIN" ]; then
  _nv="$(ls -v /home/tisitan/.nvm/versions/node 2>/dev/null | tail -1)"
  [ -n "$_nv" ] && [ -x "/home/tisitan/.nvm/versions/node/$_nv/bin/node" ] && NODE_BIN="/home/tisitan/.nvm/versions/node/$_nv/bin/node"
fi
if [ -z "$NODE_BIN" ] && [ -x /usr/bin/node ]; then
  NODE_BIN=/usr/bin/node
fi
if [ -z "$NODE_BIN" ]; then
  echo "aurora-desk: node not found (tried PATH, \$NVM_DIR, /home/tisitan/.nvm, /usr/bin/node)" >&2
  exit 1
fi
if [ ! -f "$DIR/node_modules/electron/cli.js" ]; then
  echo "aurora-desk: node_modules/electron/cli.js missing, run: npm install" >&2
  exit 1
fi

nohup "$NODE_BIN" "$DIR/node_modules/electron/cli.js" . --js-flags="--max-old-space-size=128" >> "$LOG" 2>&1 &
sleep 2

APP_PID="$(LC_ALL="${LC_ALL:-C.UTF-8}" pgrep -f "$DIR/node_modules/electron/dist/electron" 2>/dev/null | head -1)"
[ -z "$APP_PID" ] && APP_PID="$(LC_ALL="${LC_ALL:-C.UTF-8}" pgrep -f "$DIR/node_modules/electron" 2>/dev/null | head -1)"
if [ -n "$APP_PID" ]; then
  echo "aurora-desk started (pid $APP_PID)"
else
  echo "start failed, see log: $LOG"
  tail -3 "$LOG"
  exit 1
fi
