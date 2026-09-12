;(function () {
  const SPARK_MAX = 60
  const SPARK_W = 200
  const SPARK_H = 44
  const SPARK_PAD_T = 4
  const SPARK_PAD_B = 4
  const GAUGE_CIRC = 113.097
  const GAUGE_ARC = 84.823
  const TEMP_MIN = 20
  const TEMP_MAX = 90

  const cpuSamples = []
  let els = null
  let offStats = null

  function fmtRate(bps) {
    if (!Number.isFinite(bps)) return '--'
    if (bps < 1024) return `${Math.round(bps)} B/s`
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
    return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
  }

  function smoothPath(pts) {
    if (pts.length < 2) return ''
    let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2] || p2
      const c1x = p1[0] + (p2[0] - p0[0]) / 6
      const c1y = p1[1] + (p2[1] - p0[1]) / 6
      const c2x = p2[0] - (p3[0] - p1[0]) / 6
      const c2y = p2[1] - (p3[1] - p1[1]) / 6
      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
    }
    return d
  }

  function renderSpark() {
    const n = cpuSamples.length
    if (n < 2) return
    const step = SPARK_W / Math.max(n - 1, 1)
    const yFor = (pct) => SPARK_H - SPARK_PAD_B - (pct / 100) * (SPARK_H - SPARK_PAD_T - SPARK_PAD_B)
    const pts = cpuSamples.map((pct, i) => [Math.min(i * step, SPARK_W), yFor(pct)])
    const line = n === 2
      ? `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} L ${pts[1][0].toFixed(2)} ${pts[1][1].toFixed(2)}`
      : smoothPath(pts)
    els.sparkLine.setAttribute('d', line)
    els.sparkFill.setAttribute('d', `${line} L ${SPARK_W} ${SPARK_H} L 0 ${SPARK_H} Z`)
  }

  function renderCpu(pct) {
    if (!Number.isFinite(pct)) return
    cpuSamples.push(pct)
    if (cpuSamples.length > SPARK_MAX) cpuSamples.shift()
    els.cpuVal.innerHTML = `${Math.round(pct)}<span class="unit">%</span>`
    renderSpark()
  }

  function renderMem(mem) {
    if (!mem) return
    els.memBar.style.width = `${mem.pct.toFixed(1)}%`
    els.memVal.innerHTML = `${mem.usedGB.toFixed(1)}<span class="unit2">/${Math.round(mem.totalGB)}G</span>`
  }

  function renderTemp(t) {
    if (!Number.isFinite(t)) {
      els.tempArc.setAttribute('stroke-dasharray', `0 ${GAUGE_CIRC}`)
      els.tempVal.textContent = '--°'
      return
    }
    const ratio = Math.min(1, Math.max(0, (t - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)))
    els.tempArc.setAttribute('stroke-dasharray', `${(GAUGE_ARC * ratio).toFixed(1)} ${GAUGE_CIRC}`)
    els.tempVal.textContent = `${Math.round(t)}°`
  }

  function renderNet(rxBps, txBps) {
    els.netDown.firstElementChild.textContent = fmtRate(rxBps)
    els.netUp.firstElementChild.textContent = fmtRate(txBps)
  }

  function applyStats(s) {
    if (!els) return
    renderCpu(s.cpuPct)
    renderMem(s.mem)
    renderTemp(s.pkgTemp)
    renderNet(s.rxBps, s.txBps)
    window.__statsCount = (window.__statsCount || 0) + 1
  }

  function render(root) {
    root.innerHTML = `
    <section class="card">
      <div class="card-head">
        <span class="card-label">系统监控</span>
        <span class="meta" id="monitor-meta">本机 · 2s 刷新</span>
      </div>

      <div class="metric">
        <span class="m-label">CPU</span>
        <svg class="spark" viewBox="0 0 200 44" preserveAspectRatio="none" fill="none">
          <defs>
            <linearGradient id="lg-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style="stop-color:var(--accent-a)"/><stop offset="1" style="stop-color:var(--accent-b)"/>
            </linearGradient>
            <linearGradient id="lg-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style="stop-color:var(--accent-a)" stop-opacity="0.30"/>
              <stop offset="1" style="stop-color:var(--accent-b)" stop-opacity="0.02"/>
            </linearGradient>
          </defs>
          <path id="spark-fill" fill="url(#lg-fill)" d=""/>
          <path id="spark-line" stroke="url(#lg-line)" stroke-width="1.6" stroke-linecap="round" d=""/>
        </svg>
        <span class="m-value num-grad" id="cpu-val">--<span class="unit">%</span></span>
      </div>

      <div class="metric">
        <span class="m-label">内存</span>
        <div class="bar"><i id="mem-bar" style="width:0%"></i></div>
        <span class="m-value small mono" id="mem-val">--</span>
      </div>

      <div class="divider"></div>

      <div class="sys-foot">
        <div class="temp">
          <div class="gauge-wrap">
            <svg width="46" height="46" viewBox="0 0 46 46" fill="none">
              <defs>
                <linearGradient id="lg-gauge" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" style="stop-color:var(--accent-a)"/><stop offset="1" style="stop-color:var(--accent-b)"/>
                </linearGradient>
              </defs>
              <circle cx="23" cy="23" r="18" stroke="rgba(255,255,255,0.08)" stroke-width="4" stroke-linecap="round" stroke-dasharray="84.8 113.1" transform="rotate(135 23 23)"/>
              <circle id="temp-arc" cx="23" cy="23" r="18" stroke="url(#lg-gauge)" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 113.1" transform="rotate(135 23 23)"/>
            </svg>
            <span class="gauge-val" id="temp-val">--°</span>
          </div>
          <div class="temp-label">
            <span>CPU 温度</span>
          </div>
        </div>
        <div class="net">
          <div class="net-row">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1.5V7.5M2.2 5L5 8 7.8 5" style="stroke:var(--accent-a)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="rate mono" id="net-down"><span class="rate-num">--</span></span>
          </div>
          <div class="net-row">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 8.5V2.5M2.2 5L5 2 7.8 5" style="stroke:var(--accent-b)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="rate mono" id="net-up"><span class="rate-num">--</span></span>
          </div>
        </div>
      </div>
    </section>`
    els = {
      sparkLine: root.querySelector('#spark-line'),
      sparkFill: root.querySelector('#spark-fill'),
      cpuVal: root.querySelector('#cpu-val'),
      memBar: root.querySelector('#mem-bar'),
      memVal: root.querySelector('#mem-val'),
      tempArc: root.querySelector('#temp-arc'),
      tempVal: root.querySelector('#temp-val'),
      netDown: root.querySelector('#net-down'),
      netUp: root.querySelector('#net-up'),
    }
  }

  function mount() {
    if (window.deskStats) {
      window.deskStats.getStats().then((s) => {
        if (els && s) applyStats(s)
      })
      offStats = window.deskStats.onStats(applyStats)
    }
  }

  function unmount() {
    if (offStats) {
      offStats()
      offStats = null
    }
    els = null
    cpuSamples.length = 0
  }

  window.WidgetRegistry.register({ id: 'monitor', name: '系统监控', defaultVisible: true, render, mount, unmount })
})()
