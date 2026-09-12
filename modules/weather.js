;(function () {
  const WEEK_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  let els = null
  let offWeather = null

  // 和风 icon 代码 → 定稿六档内联 SVG（100-515 主要代码全覆盖，未知码兜底 cloud）
  const QW_ICON_KIND = {
    100: 'sun', 150: 'sun',
    101: 'suncloud', 102: 'suncloud', 103: 'suncloud', 151: 'suncloud', 152: 'suncloud', 153: 'suncloud',
    104: 'cloud', 154: 'cloud',
    300: 'rain', 301: 'rain', 305: 'rain', 306: 'rain', 307: 'rain', 308: 'rain', 309: 'rain',
    310: 'rain', 311: 'rain', 312: 'rain', 313: 'rain', 314: 'rain', 318: 'rain', 399: 'rain',
    302: 'thunder', 303: 'thunder', 304: 'thunder',
    315: 'snow', 316: 'snow', 317: 'snow', 350: 'snow', 351: 'snow',
    400: 'snow', 401: 'snow', 402: 'snow', 403: 'snow', 405: 'snow', 406: 'snow', 407: 'snow',
    408: 'snow', 409: 'snow', 410: 'snow', 456: 'snow', 457: 'snow', 499: 'snow',
    404: 'rain',
  }

  function iconKind(code) {
    const c = Number(code)
    if (QW_ICON_KIND[c]) return QW_ICON_KIND[c]
    if (c >= 200 && c <= 299) return 'cloud'
    if (c >= 500 && c <= 599) return 'cloud'
    if (c >= 400 && c <= 499) return 'snow'
    if (c >= 300 && c <= 399) return 'rain'
    if (c >= 100 && c <= 199) return 'cloud'
    return 'cloud'
  }

  let uidSeq = 0

  function iconSvg(kind, size) {
    const u = 'wg' + ++uidSeq
    const open = `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none">`
    const sunGrad = `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fcd34d"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>`
    const rays = (cx, cy) =>
      `<g stroke="url(#${u}s)" stroke-width="2" stroke-linecap="round"><path d="M${cx} ${cy - 11.5}v3M${cx} ${cy + 8.5}v3M${cx - 11.5} ${cy}h3M${cx + 8.5} ${cy}h3M${cx - 8.1} ${cy - 8.1}l2 2M${cx + 6.1} ${cy + 6.1}l2 2M${cx - 8.1} ${cy + 8.1}l2-2M${cx + 6.1} ${cy - 6.1}l-2 2"/></g>`
    const sunAt = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${u}s)"/>`
    const cloud = (dx, dy, op) =>
      `<path d="M${23 + dx} ${37 + dy}h${15.8}a5.2 5.2 0 0 0 .9-10.3A9.8 9.8 0 0 0 ${21 + dx} ${25.2 + dy} 6.2 6.2 0 0 0 ${23 + dx} ${37 + dy}Z" fill="rgba(244,247,255,${op})"/>`
    let body = ''
    if (kind === 'sun') body = sunGrad + sunAt(24, 24, 7.5) + rays(24, 24)
    else if (kind === 'suncloud') body = sunGrad + sunAt(17, 15, 6.5) + rays(17, 15) + cloud(0, 0, 0.92)
    else if (kind === 'cloud') body = cloud(0, -2, 0.9)
    else if (kind === 'rain') body = cloud(0, -5, 0.9) + `<g stroke="#7dd3fc" stroke-width="2.2" stroke-linecap="round"><path d="M18 37l-2.2 6M26 37l-2.2 6M34 37l-2.2 6"/></g>`
    else if (kind === 'snow') body = cloud(0, -5, 0.9) + `<g fill="#e0f2fe"><circle cx="18" cy="40" r="1.8"/><circle cx="26" cy="43" r="1.8"/><circle cx="34" cy="40" r="1.8"/></g>`
    else if (kind === 'thunder') body = cloud(0, -6, 0.9) + `<polygon points="26,34 20,44 24.5,44 22,52 30,41 25.5,41 28,34" fill="#fbbf24"/>`
    return open + body + '</svg>'
  }

  function hm(ts) {
    if (!ts) return '--:--'
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  function renderWeather(w) {
    if (!w || !els) return
    els.card.classList.toggle('stale', !!w.stale)
    els.meta.textContent = w.stale ? '缓存 ' + hm(w.updatedAt) : '现在'
    els.city.textContent = w.city || '--'
    if (!w.current) {
      els.icon.innerHTML = iconSvg('cloud', 48)
      els.temp.textContent = '--°'
      els.cond.textContent = '数据不可用'
      els.detail.textContent = '检查 config.json 的和风 key / API Host'
      els.air.textContent = ''
      els.forecast.innerHTML = ''
      return
    }
    const c = w.current
    els.icon.innerHTML = iconSvg(iconKind(c.icon), 48)
    els.temp.textContent = `${Math.round(c.temp)}°`
    els.cond.textContent = c.text || '--'
    const bits = [`体感 ${Math.round(c.feels)}°`]
    // 和风 windDir 自带「风」字（东北风），不要再补，否则渲染成「东北风风」
    if (c.windDir) bits.push(`${c.windDir} ${c.windScale ?? '--'}级`)
    if (Number.isFinite(c.humidity)) bits.push(`湿度 ${Math.round(c.humidity)}%`)
    els.detail.textContent = bits.join(' · ')
    els.air.textContent = Number.isFinite(c.aqi) ? `空气 ${c.aqiCategory || '--'} · AQI ${c.aqi}` : ''
    els.forecast.innerHTML = w.daily
      .slice(0, 3)
      .map((d, i) => {
        const dt = new Date(d.date + 'T12:00:00')
        const name = i === 0 ? '今天' : i === 1 ? '明天' : WEEK_SHORT[dt.getDay()]
        return `
      <div class="f-day">
        <span class="f-name">${name}</span>
        ${iconSvg(iconKind(d.icon), 16)}
        <span class="f-temp mono">${Math.round(d.max)}° <i>/${Math.round(d.min)}°</i></span>
      </div>`
      })
      .join('')
    window.__weatherCount = (window.__weatherCount || 0) + 1
  }

  function render(root) {
    root.innerHTML = `
    <section class="card" id="weather-card">
      <div class="card-head">
        <span class="card-label">天气</span>
        <span class="meta" id="weather-meta">加载中</span>
      </div>
      <div class="now">
        <span class="w-icon" id="weather-icon"></span>
        <div class="now-temp num-grad" id="weather-temp">--°</div>
        <div class="now-desc">
          <b id="weather-city">--</b>
          <span class="cond" id="weather-cond">--</span>
          <span class="detail" id="weather-detail">--</span>
        </div>
      </div>
      <div class="air-line" id="weather-air"></div>
      <div class="divider"></div>
      <div class="forecast" id="weather-forecast"></div>
    </section>`
    els = {
      card: root.querySelector('#weather-card'),
      meta: root.querySelector('#weather-meta'),
      icon: root.querySelector('#weather-icon'),
      temp: root.querySelector('#weather-temp'),
      city: root.querySelector('#weather-city'),
      cond: root.querySelector('#weather-cond'),
      detail: root.querySelector('#weather-detail'),
      air: root.querySelector('#weather-air'),
      forecast: root.querySelector('#weather-forecast'),
    }
  }

  function mount() {
    if (window.widgetData) {
      window.widgetData.getWeather().then((w) => {
        if (els) renderWeather(w)
      })
      offWeather = window.widgetData.onWeather(renderWeather)
    }
  }

  function unmount() {
    if (offWeather) {
      offWeather()
      offWeather = null
    }
    els = null
  }

  window.WidgetRegistry.register({ id: 'weather', name: '天气', defaultVisible: true, render, mount, unmount })
})()
