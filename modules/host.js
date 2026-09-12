window.ModuleHost = (() => {
  const column = document.querySelector('.column')
  const emptyEl = document.getElementById('module-empty')
  const mounted = new Map()
  let layout = []
  let inited = false

  function modById(id) {
    return window.WidgetRegistry ? WidgetRegistry.modules.find((m) => m.id === id) : null
  }

  // 注册表 × 用户配置 → 有效布局：丢弃注册表中已不存在的 id，新模块按注册顺序补尾
  function computeLayout(saved) {
    const out = []
    const seen = new Set()
    for (const s of Array.isArray(saved) ? saved : []) {
      if (!s || typeof s.id !== 'string' || seen.has(s.id) || !modById(s.id)) continue
      seen.add(s.id)
      out.push({ id: s.id, visible: s.visible !== false })
    }
    for (const mod of WidgetRegistry.modules) {
      if (seen.has(mod.id)) continue
      seen.add(mod.id)
      out.push({ id: mod.id, visible: mod.defaultVisible !== false })
    }
    return out
  }

  function sameSeq(a, b) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((m, i) => b[i].id === m.id && b[i].visible === m.visible)
  }

  function mountModule(id) {
    const mod = modById(id)
    if (!mod) return
    const container = document.createElement('div')
    container.className = 'module-slot'
    container.dataset.moduleId = id
    column.insertBefore(container, emptyEl)
    try {
      if (typeof mod.render === 'function') mod.render(container, {})
      if (typeof mod.mount === 'function') mod.mount(container, {})
    } catch (err) {
      console.error('[aurora-desk] module mount failed:', id, err)
    }
    mounted.set(id, { mod, container })
  }

  function unmountModule(id) {
    const rec = mounted.get(id)
    if (!rec) return
    mounted.delete(id)
    try {
      if (typeof rec.mod.unmount === 'function') rec.mod.unmount()
    } catch (err) {
      console.error('[aurora-desk] module unmount failed:', id, err)
    }
    rec.container.remove()
  }

  // 排序只移动既有容器（监听器/定时器原样保留），显隐才真正 mount/unmount
  function applyLayout(next) {
    layout = next
    const visibleIds = layout.filter((m) => m.visible).map((m) => m.id)
    for (const id of Array.from(mounted.keys())) {
      if (!visibleIds.includes(id)) unmountModule(id)
    }
    for (const id of visibleIds) {
      if (!mounted.has(id)) mountModule(id)
    }
    for (const id of visibleIds) {
      const rec = mounted.get(id)
      if (rec) column.insertBefore(rec.container, emptyEl)
    }
    column.classList.toggle('all-hidden', visibleIds.length === 0)
  }

  function persist() {
    if (!window.deskUI) return Promise.resolve()
    const payload = layout.map((m, i) => ({ id: m.id, visible: m.visible, order: i }))
    return window.deskUI
      .setSettings({ layout: { modules: payload } })
      .catch((err) => console.error('[aurora-desk] layout persist failed:', err))
  }

  function setVisible(id, visible) {
    const m = layout.find((x) => x.id === id)
    if (!m || m.visible === !!visible) return
    m.visible = !!visible
    applyLayout(layout)
    persist()
  }

  function move(id, dir) {
    const i = layout.findIndex((x) => x.id === id)
    const j = i + (dir < 0 ? -1 : 1)
    if (i < 0 || j < 0 || j >= layout.length) return
    ;[layout[i], layout[j]] = [layout[j], layout[i]]
    applyLayout(layout)
    persist()
  }

  function listModules() {
    return layout.map((m) => {
      const mod = modById(m.id)
      return { id: m.id, name: mod && mod.name ? mod.name : m.id, visible: m.visible }
    })
  }

  function init(cfg) {
    if (inited) return
    inited = true
    const computed = computeLayout(cfg && cfg.layout && cfg.layout.modules)
    applyLayout(computed)
    const saved = cfg && cfg.layout && Array.isArray(cfg.layout.modules)
      ? cfg.layout.modules.map((m) => ({ id: m.id, visible: m.visible !== false }))
      : null
    if (!sameSeq(computed, saved)) persist()
  }

  function syncFromConfig(cfg) {
    if (!inited) return
    const next = computeLayout(cfg && cfg.layout && cfg.layout.modules)
    if (!sameSeq(next, layout)) applyLayout(next)
  }

  return { init, setVisible, move, listModules, syncFromConfig }
})()
