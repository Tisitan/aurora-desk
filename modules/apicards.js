;(function () {
  let slot = null
  let els = null
  let offApi = null

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  function hms(ts) {
    if (!ts) return '--:--:--'
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  }

  function dirIcon(dir) {
    if (dir === 'up') return '<svg width="8" height="7" viewBox="0 0 8 7"><polygon points="4,0 8,7 0,7" fill="#34d399"/></svg>'
    if (dir === 'down') return '<svg width="8" height="7" viewBox="0 0 8 7"><polygon points="0,0 8,0 4,7" fill="#f87171"/></svg>'
    return '<i class="dir-flat"></i>'
  }

  // customApis 为空 = 整块不渲染：连容器一起收起（display:none），不留占位、不留 flex gap
  function renderApiCards(list) {
    if (!list || !els) return
    const cards = list.length
    els.apiCards.style.display = cards ? '' : 'none'
    if (slot) slot.style.display = cards ? '' : 'none'
    els.apiCards.innerHTML = cards
      ? list
          .map(
            (a) => `
  <section class="card api-card${a.stale ? ' stale' : ''}">
    <div class="card-head">
      <span class="card-label">自定义数据源</span>
      <span class="status"><i class="pulse${a.stale ? ' off' : ''}"></i>${a.stale ? '离线' : '已连接'}</span>
    </div>
    <div class="api-sym">${esc(a.name)}<span class="api-tag">${esc(a.host)}</span></div>
    <div class="api-row">
      <span class="api-price num-grad">${esc(a.unit)}${esc(a.valueText)}</span>
      <span class="api-chg mono">${dirIcon(a.dir)}</span>
    </div>
    <div class="divider"></div>
    <div class="api-foot">${a.intervalSec}s 轮询 · 最后更新 <span class="mono">${hms(a.updatedAt)}</span>${a.stale ? ' · 缓存' : ''}</div>
  </section>`
          )
          .join('')
      : ''
    window.__apiCount = (window.__apiCount || 0) + 1
  }

  function render(root) {
    root.innerHTML = '<div id="api-cards"></div>'
    slot = root
    els = { apiCards: root.querySelector('#api-cards') }
  }

  function mount() {
    if (window.widgetData) {
      window.widgetData.getApiCards().then((l) => {
        if (els) renderApiCards(l)
      })
      offApi = window.widgetData.onApiCards(renderApiCards)
    }
  }

  function unmount() {
    if (offApi) {
      offApi()
      offApi = null
    }
    slot = null
    els = null
  }

  window.WidgetRegistry.register({ id: 'apicards', name: '自定义数据源', defaultVisible: true, render, mount, unmount })
})()
