window.WidgetRegistry = {
  modules: [],
  register(mod) {
    if (!mod || typeof mod.id !== 'string' || !mod.id) return
    if (this.modules.some((m) => m.id === mod.id)) return
    this.modules.push({ defaultVisible: true, ...mod })
  },
}
