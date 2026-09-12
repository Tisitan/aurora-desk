// 和风接口桩：仅用于本地取证（真实 key 需要项目专属 API Host，见报告 open 项）。
// 数据按实测口径造：上海 晴 28°C 东北风 空气优 AQI 26
const http = require('node:http')

const geo = {
  code: '200',
  location: [{ id: '101020100', name: '上海', lat: '31.2304', lon: '121.4737', adm1: '上海市', country: '中国' }],
}
const now = {
  code: '200',
  updateTime: '2026-09-12T15:45+08:00',
  fxLink: 'https://www.qweather.com/weather/shanghai-101020100.html',
  now: {
    obsTime: '2026-09-12T15:43+08:00',
    temp: '28',
    feelsLike: '29',
    icon: '100',
    text: '晴',
    wind360: '45',
    windDir: '东北风',
    windScale: '3',
    windSpeed: '12',
    humidity: '62',
    precip: '0',
    pressure: '1013',
    cloud: '3',
    dew: '20',
  },
}
const day3 = {
  code: '200',
  daily: [
    { fxDate: '2026-09-12', tempMax: '31', tempMin: '25', iconDay: '100', textDay: '晴', iconNight: '150', textNight: '晴', windDirDay: '东北风', windScaleDay: '3' },
    { fxDate: '2026-09-13', tempMax: '30', tempMin: '25', iconDay: '101', textDay: '多云', iconNight: '151', textNight: '多云', windDirDay: '东风', windScaleDay: '4' },
    { fxDate: '2026-09-14', tempMax: '29', tempMin: '24', iconDay: '305', textDay: '小雨', iconNight: '350', textNight: '小雨', windDirDay: '东南风', windScaleDay: '3' },
  ],
}
const air = {
  code: '200',
  now: { pubTime: '2026-09-12T15:30+08:00', aqi: '26', category: '优', primaryPollutant: 'O3', pm2p5: '12', pm10: '20', o3: '80' },
}

// 数值型桩：给自定义数据源卡的多卡轮询 / 涨跌箭头取证用（10s 周期内单调递增）
function probeNum() {
  return { code: '200', val: Number((40 + (Date.now() % 10000) / 100).toFixed(2)) }
}

const routes = [
  ['/v7/test/num', null],
  ['/v2/city/lookup', geo],
  ['/geo/v2/city/lookup', geo],
  ['/v7/weather/now', now],
  ['/v7/weather/3d', day3],
  ['/v7/air/now', air],
]

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  const hit = routes.find(([p]) => u.pathname === p)
  if (!hit) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { status: 404, title: 'Not Found' } }))
    console.log('[mock-qweather] 404', u.pathname)
    return
  }
  if (!u.searchParams.get('key')) {
    res.writeHead(403, { 'content-type': 'application/problem+json' })
    res.end(JSON.stringify({ error: { status: 403, title: 'Invalid Key' } }))
    return
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(hit[0] === '/v7/test/num' ? probeNum() : hit[1]))
  console.log('[mock-qweather] 200', u.pathname, 'location=' + u.searchParams.get('location'))
})

srv.listen(Number(process.argv[2] || 18080), '127.0.0.1', () => console.log('[mock-qweather] listening 127.0.0.1:' + (process.argv[2] || 18080)))
