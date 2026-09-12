# aurora-desk

A dark-glass, transparent desktop widget for Linux. Single-column card stack that
lives on your desktop 24/7 — sunk to the desktop layer by default, revealed with
`Super+D`.

Target environment: Linux Mint 22.3 / Cinnamon 6.x / X11 (any WM honoring
`_NET_WM_STATE_BELOW` should work).

> 中文简介：暗夜玻璃风格的 Electron 透明窗桌面挂件，单列竖排卡片，默认沉底到桌面层级，
> `Super+D` 显示桌面时露出。内置时钟/农历、待办、系统监控、和风天气与自定义数据源卡，
> 五模块全部由注册表驱动，可在设置抽屉中显隐与排序。

## Screenshot

<!-- TODO: add a hero screenshot after first public release -->

## Features

- **Five registry-driven modules** — Clock (with lunar calendar) · Todos · System
  monitor (CPU curve / memory / temperature / network) · Weather (QWeather) ·
  Custom API cards (zero-card default renders nothing, not even a placeholder).
- **Registry architecture** — every card is a self-describing module
  (`{ id, name, icon?, defaultVisible, render, mount?, unmount? }`) registered into
  `modules/registry.js`. Show/hide and reorder from the settings drawer; layout is
  persisted. Adding a module = one file + one `<script>` tag.
- **Dark glass aesthetic** — translucent cards with accent gradients, tuned through
  CSS variables, live-adjustable from the settings drawer.
- **Below-layer mode** — the widget sinks to the desktop layer
  (`_NET_WM_STATE_BELOW`): normal windows cover it, `Super+D` reveals it. A `top`
  mode (screen-saver layer) is one toggle away.
- **QWeather integration** — current conditions + 3-day forecast + air quality,
  15-minute polling, cache fallback when offline, key masked in every IPC and log
  sink.
- **Memory guardrails for 24/7 residency** — V8 old-space capped at 128MB via
  `--js-flags`, stats collection throttles to 10s while locked/suspended, single
  instance lock, hourly heap watermark logs.

## Quick Start

```bash
git clone https://github.com/Tisitan/aurora-desk.git
cd aurora-desk
npm install
cp config.example.json config.json
npm start
```

> In mainland China, Electron binaries download faster with a mirror:
>
> ```bash
> ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install
> ```

`./start.sh` launches the widget in the background (same entry the autostart file
uses; logs go to `~/.local/state/aurora-desk.log`). To autostart on login, toggle
it in the settings drawer — it manages `~/.config/autostart/aurora-desk.desktop`
for you.

**Config file note:** `config.json` holds your QWeather key and is git-ignored —
it never enters the repo. Copy it from `config.example.json` on first run.

## Configuration

All settings live in `config.json` (see `config.example.json` for defaults):

| Section | What it controls |
|---|---|
| `weather` | Provider (`qweather`), API key, API/Geo hosts, city |
| `customApis` | Custom data-source cards: `[{ name, url, jsonPath, unit, intervalSec }]` |
| `appearance` | Accent color pair, card alpha |
| `monitor` | Stats collection interval (seconds) |
| `window` | Layer mode: `below` (desktop) or `top` (always on top) |
| `layout` | Module visibility & ordering (managed by the settings drawer) |
| `clickthrough` | Mouse pass-through (toggle back with global hotkey `Ctrl+Alt+W`) |

### QWeather key

1. Sign up at [console.qweather.com](https://console.qweather.com) and create a
   project to get a key.
2. New QWeather consoles issue a **project-specific API Host** — put it into
   `weather.apiHost` and `weather.geoHost` (e.g. `https://abc123.re.qweatherapi.com`).
3. Fill `weather.city` with a city name, or a 6-9 digit LocationID to skip the
   geo lookup.

Your key lives only in `config.json` — never in code, never in logs (masked to
`abcd***` everywhere), never through IPC.

## Architecture

```text
main.js            main process: transparent window / layer modes / bounds clamping /
                   height handshake / clickthrough hotkey / lock-screen throttling /
                   single instance / apicards visibility coupling
preload.js         contextBridge, three channels (deskStats / widgetData / deskUI);
                   every push subscription returns an unsubscribe function
settings-store.js  config.json read/write + IPC; key masked at the exit
autostart.js       manages ~/.config/autostart/aurora-desk.desktop
layer-mode.js      applies BELOW / screen-saver layer via wmctrl
collector.js       /proc sampling: CPU / memory / temperature / network
weather.js         QWeather client: city/lookup → now + 3d + air, cache fallback
api-cards.js       multi-card polling (timer registry + generation guard + pause/resume)
todos-store.js     todo persistence
modules/           registry base: registry.js · host.js · clock/todos/monitor/weather/apicards
index.html         main column + settings drawer (module management section)
settings-ui.js     drawer interactions, accent variables, ResizeObserver height report
style.css          dark-glass styles (accent/alpha via CSS variables)
start.sh           background/autostart entry
mockup.html/.css   static design baseline (open directly in a browser)
capture-mockup.js  renders the design baseline to an image
scripts/           development tools (see below)
```

### Module registry

`modules/host.js` renders the main column by joining the registry with
`config.layout.modules` — `index.html` contains no hardcoded card skeletons. A
module's `unmount` must truly unsubscribe (all push subscriptions return an
unsubscriber) and clear its timers; that's the RAM red line for 24/7 residency.

## Development

`scripts/` holds offline verification tools (no key required):

- `scripts/verify.js` — offscreen DOM assertions for all five modules
  (`node scripts/verify.js [main|persist-check]`).
- `scripts/mock-qweather.js` — local QWeather stub server, pairs with
  `WIDGET_STUB` for API-card testing.
- `scripts/runtime-capture.js` — offscreen capture for visual evidence
  (`node scripts/runtime-capture.js [main|drawer]`).

## Tech Stack

- [Electron](https://www.electronjs.org/) 43 (transparent frameless window, X11)
- Vanilla JS / HTML / CSS — no frontend framework, no bundler
- `solarlunar` for the lunar calendar, `@fontsource/jetbrains-mono` for type
- `wmctrl` for X11 window-layer management

## License

[MIT](LICENSE) © 2026 Tisitan
