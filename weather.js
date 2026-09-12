const { net } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const CACHE_FILE = path.join(__dirname, 'weather-cache.json')
const REFRESH_MS = 15 * 60 * 1000
const TIMEOUT_MS = 10000
let snapshot = null
let timer = null

function mask(key) {
  const k = String(key || '')
  return k ? k.slice(0, 4) + '***' : '(empty)'
}

async function fetchJson(url, label) {
  const res = await net.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) {
    // 新版和风的鉴权错误走 problem+json（如 Invalid Host），把 title 带进日志好定位
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.error?.title || j?.error?.status || j?.code || ''
    } catch { }
    throw new Error(`${label} HTTP ${res.status}${detail ? ' ' + detail : ''}`)
  }
  const j = await res.json()
  // 和风错误走 200 + code 字段（401/403 等），必须逐档判
  if (j.code && j.code !== '200') throw new Error(label + ' code=' + j.code)
  return j
}

function readCache() {
  try {
    const j = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
    if (j && typeof j === 'object') return j
  } catch { }
  return {}
}

function writeCache(geo, snap) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ geo, snapshot: snap }, null, 2))
  } catch { }
}

// 城市名 → 和风 LocationID + 经纬度：成功一次即缓存，设置面板改城市时 city 变了自然重查。
// 兼容三种形态：① 直接填 6-9 位 LocationID（免查表，但没有坐标 → 空气质量自动跳过）；
// ② 老 {geoHost}/v2/city/lookup；③ 新版专属 host 下 geo 挂在 /geo 前缀（404 时自动改路）。
// 经纬度必须一起缓存：新版空气质量接口 /airquality/v1/current/{lat}/{lon} 只认坐标不认 LocationID。
async function lookupId(cfg) {
  const cached = readCache().geo
  if (cached && cached.city === cfg.city && cached.id && cached.lat && cached.lon) return cached
  if (/^\d{6,9}$/.test(cfg.city)) {
    const geo = { city: cfg.city, id: cfg.city, name: cfg.city, adm1: '', lat: null, lon: null }
    writeCache(geo, readCache().snapshot || null)
    return geo
  }
  let j = null
  let lastErr = null
  for (const p of ['/v2/city/lookup', '/geo/v2/city/lookup']) {
    try {
      j = await fetchJson(
        `${cfg.geoHost}${p}?location=${encodeURIComponent(cfg.city)}&key=${cfg.key}`,
        'geo'
      )
      break
    } catch (err) {
      lastErr = err
    }
  }
  const r = j && Array.isArray(j.location) && j.location[0]
  if (!r) throw lastErr || new Error('geo: no result for "' + cfg.city + '"')
  const geo = {
    city: cfg.city,
    id: String(r.id),
    name: r.name || cfg.city,
    adm1: r.adm1 || '',
    // 文档要求「最多小数点后两位」，多一位反而可能 404，统一 round 一次
    lat: Number.isFinite(Number(r.lat)) ? Number(r.lat).toFixed(2) : null,
    lon: Number.isFinite(Number(r.lon)) ? Number(r.lon).toFixed(2) : null,
  }
  writeCache(geo, snapshot && !snapshot.stale ? snapshot : readCache().snapshot || null)
  return geo
}

// 新版响应是 indexes[]（多标准并存，如 cn-mee / us-epa），取中国国标；拿不到就退首项
function pickIndex(air) {
  const list = Array.isArray(air && air.indexes) ? air.indexes : []
  return list.find((x) => x && x.code === 'cn-mee') || list[0] || {}
}

async function refresh(cfg) {
  const label = cfg.provider === 'qweather' ? 'qweather' : 'weather'
  try {
    const geo = await lookupId(cfg)
    const [now, day3, air] = await Promise.all([
      fetchJson(`${cfg.apiHost}/v7/weather/now?location=${geo.id}&key=${cfg.key}`, 'now'),
      fetchJson(`${cfg.apiHost}/v7/weather/3d?location=${geo.id}&key=${cfg.key}`, '3d'),
      geo.lat && geo.lon
        ? fetchJson(`${cfg.apiHost}/airquality/v1/current/${geo.lat}/${geo.lon}?key=${cfg.key}`, 'air').catch(() => null)
        : Promise.resolve(null),
    ])
    const n = now.now
    if (!n || !n.temp) throw new Error('now: empty payload')
    // 空气接口失败/缺字段一律归 null，让渲染层的 .air-line:empty 自然收起，不出现 NaN
    const idx = air ? pickIndex(air) : {}
    const aqi = Number.isFinite(Number(idx.aqi)) && idx.aqi != null ? Number(idx.aqi) : null
    snapshot = {
      provider: 'qweather',
      city: geo.name,
      stale: false,
      updatedAt: Date.now(),
      current: {
        temp: Number(n.temp),
        feels: Number(n.feelsLike),
        text: n.text,
        icon: n.icon,
        windDir: n.windDir,
        windScale: n.windScale,
        humidity: n.humidity != null ? Number(n.humidity) : null,
        aqi,
        aqiCategory: idx.category || null,
      },
      daily: (Array.isArray(day3.daily) ? day3.daily : []).slice(0, 3).map((d) => ({
        date: d.fxDate,
        text: d.textDay,
        icon: d.iconDay,
        max: Number(d.tempMax),
        min: Number(d.tempMin),
      })),
    }
    writeCache(geo, snapshot)
    console.log(`[aurora-desk] ${label}`, geo.name, snapshot.current.temp + '°C', snapshot.current.text,
      'AQI=' + (snapshot.current.aqi ?? '--') + '/' + (snapshot.current.aqiCategory ?? '--'),
      'key=' + mask(cfg.key))
  } catch (err) {
    const cached = readCache().snapshot
    if (cached && cached.current) {
      snapshot = { ...cached, stale: true }
      console.log(`[aurora-desk] ${label} fallback to cache:`, err.message, 'host=' + cfg.apiHost, 'key=' + mask(cfg.key))
    } else {
      snapshot = { provider: 'qweather', city: cfg.city, stale: true, updatedAt: Date.now(), current: null, daily: [] }
      console.log(`[aurora-desk] ${label} unavailable:`, err.message, 'host=' + cfg.apiHost, 'key=' + mask(cfg.key))
    }
  }
  return snapshot
}

// 设置面板改城市/密钥/host 即热更新：start 幂等，先清旧定时器再立刻拉一轮
function start(cfg, onSample) {
  if (timer) clearInterval(timer)
  const loop = async () => onSample(await refresh(cfg))
  loop()
  timer = setInterval(loop, REFRESH_MS)
  return timer
}

function latest() {
  return snapshot
}

module.exports = { start, latest }
