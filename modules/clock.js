;(function () {
  const WEEK_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const DOW_CN = ['一', '二', '三', '四', '五', '六', '日']
  const MONTH_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
  const LUNAR_MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']
  const LUNAR_DAY_CN = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']

  let els = null
  let timer = null
  const view = { y: new Date().getFullYear(), m: new Date().getMonth() }

  function pad2(n) {
    return String(n).padStart(2, '0')
  }

  function fadeSet(elm, text) {
    if (elm.textContent === text) return
    elm.textContent = text
    elm.classList.remove('fade-in')
    void elm.offsetWidth
    elm.classList.add('fade-in')
  }

  function solar2lunar(date) {
    const ymd = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
    let start = null
    for (const r of LUNAR_MONTH_STARTS) {
      if (r.d <= ymd) start = r
      else break
    }
    if (!start) return null
    const base = new Date(Math.floor(start.d / 10000), Math.floor(start.d / 100) % 100 - 1, start.d % 100)
    const day = Math.floor((date - base) / 86400000) + 1
    if (day < 1 || day > 30) return null
    const mAbs = Math.abs(start.m)
    return { monthCn: (start.m < 0 ? '闰' : '') + LUNAR_MONTH_CN[mAbs - 1] + '月', dayCn: LUNAR_DAY_CN[day - 1], day }
  }

  function renderCalendar(now) {
    const isCur = view.y === now.getFullYear() && view.m === now.getMonth()
    els.calMonth.textContent = MONTH_CN[view.m] + '月'
    els.calYear.textContent = view.y
    const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7
    const days = new Date(view.y, view.m + 1, 0).getDate()
    let html = DOW_CN.map((d) => `<span class="dow">${d}</span>`).join('')
    for (let i = 0; i < lead; i++) html += '<span class="d out">0</span>'
    for (let d = 1; d <= days; d++) {
      html += `<span class="d${isCur && d === now.getDate() ? ' today' : ''}">${d}</span>`
    }
    els.calGrid.innerHTML = html
  }

  function tickClock() {
    if (!els) return
    const now = new Date()
    fadeSet(els.time, pad2(now.getHours()) + ':' + pad2(now.getMinutes()))
    fadeSet(els.sec, ':' + pad2(now.getSeconds()))
    const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 ${WEEK_CN[now.getDay()]}`
    const l = solar2lunar(now)
    const full = dateStr + '|' + (l ? l.monthCn + l.dayCn : '')
    if (els.dateLine.dataset.full !== full) {
      els.dateLine.dataset.full = full
      els.dateLine.innerHTML = l
        ? `${dateStr}<span class="sep">·</span><span class="lunar">农历${l.monthCn}${l.dayCn}</span>`
        : dateStr
    }
    renderCalendar(now)
  }

  function onPrev() {
    view.m -= 1
    if (view.m < 0) { view.m = 11; view.y -= 1 }
    renderCalendar(new Date())
  }

  function onNext() {
    view.m += 1
    if (view.m > 11) { view.m = 0; view.y += 1 }
    renderCalendar(new Date())
  }

  function onBackToToday() {
    const now = new Date()
    view.y = now.getFullYear()
    view.m = now.getMonth()
    renderCalendar(now)
  }

  function render(root) {
    root.innerHTML = `
    <section class="card">
      <div class="clock-row">
        <div class="clock-time num-grad" id="clock-time">--:--</div>
        <div class="clock-sec mono" id="clock-sec">:--</div>
      </div>
      <div class="clock-date" id="clock-date">加载中…</div>
      <div class="cal">
        <div class="cal-head">
          <span class="cal-side">
            <button class="cal-nav" id="cal-prev" title="上个月"><svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M5 1L2 4l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <span class="cal-month" id="cal-month" title="回到本月">—月</span>
          </span>
          <span class="cal-side">
            <span class="cal-year mono" id="cal-year">----</span>
            <button class="cal-nav" id="cal-next" title="下个月"><svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M3 1l3 3-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </span>
        </div>
        <div class="cal-grid" id="cal-grid"></div>
      </div>
    </section>`
    els = {
      time: root.querySelector('#clock-time'),
      sec: root.querySelector('#clock-sec'),
      dateLine: root.querySelector('#clock-date'),
      calMonth: root.querySelector('#cal-month'),
      calYear: root.querySelector('#cal-year'),
      calGrid: root.querySelector('#cal-grid'),
      prev: root.querySelector('#cal-prev'),
      next: root.querySelector('#cal-next'),
    }
  }

  function mount() {
    els.prev.addEventListener('click', onPrev)
    els.next.addEventListener('click', onNext)
    els.calMonth.addEventListener('click', onBackToToday)
    tickClock()
    timer = setInterval(tickClock, 1000)
  }

  function unmount() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    els = null
  }

  window.WidgetRegistry.register({ id: 'clock', name: '时钟日历', defaultVisible: true, render, mount, unmount })
})()
