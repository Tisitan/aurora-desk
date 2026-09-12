;(function () {
  const CHECK_SVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="2,5.2 4.2,7.4 8,3" stroke="#10131d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  const X_SVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'

  let els = null

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  function renderTodos(list) {
    if (!els) return
    els.chip.textContent = `${list.filter((t) => t.done).length}/${list.length}`
    els.list.innerHTML = list.length
      ? list
          .map(
            (t) => `
    <li class="todo${t.done ? ' done' : ''}" data-id="${t.id}">
      <span class="dot">${t.done ? CHECK_SVG : ''}</span>
      <span class="txt">${esc(t.text)}</span>
      <button class="del" title="删除">${X_SVG}</button>
    </li>`
          )
          .join('')
      : '<li class="todo-empty">暂无待办，添加一条吧</li>'
  }

  function onListClick(e) {
    if (!els) return
    const li = e.target.closest('li[data-id]')
    if (!li) return
    const id = li.dataset.id
    if (e.target.closest('.dot')) window.widgetData.todos.toggle(id).then(renderTodos)
    else if (e.target.closest('.del')) window.widgetData.todos.remove(id).then(renderTodos)
  }

  function onInputKey(e) {
    if (e.key !== 'Enter') return
    const text = els.input.value.trim()
    if (!text) return
    window.widgetData.todos.add(text).then((l) => {
      if (!els) return
      renderTodos(l)
      els.input.value = ''
    })
  }

  function render(root) {
    root.innerHTML = `
    <section class="card">
      <div class="card-head">
        <span class="card-label">待办</span>
        <span class="chip mono" id="todo-chip">0/0</span>
      </div>
      <ul class="todos" id="todo-list"></ul>
      <div class="add-todo">
        <span class="plus num-grad">＋</span>
        <input id="todo-input" class="todo-input" placeholder="添加待办…" maxlength="100" />
      </div>
    </section>`
    els = {
      list: root.querySelector('#todo-list'),
      chip: root.querySelector('#todo-chip'),
      input: root.querySelector('#todo-input'),
    }
  }

  function mount() {
    els.list.addEventListener('click', onListClick)
    els.input.addEventListener('keydown', onInputKey)
    if (window.widgetData) window.widgetData.todos.list().then((l) => { if (els) renderTodos(l) })
  }

  function unmount() {
    els = null
  }

  window.WidgetRegistry.register({ id: 'todos', name: '待办', defaultVisible: true, render, mount, unmount })
})()
