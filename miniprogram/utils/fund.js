const BASE = 'https://fundgz.1234567.com.cn/js'

function parseJSONP(str) {
  const s = str.trim()
  const start = s.indexOf('(')
  const end = s.lastIndexOf(')')
  if (start === -1 || end === -1) return null
  return JSON.parse(s.slice(start + 1, end))
}

function fetchValuation(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE}/${code}.js`,
      header: { Referer: 'https://fund.eastmoney.com/' },
      success(res) {
        if (res.statusCode !== 200 || typeof res.data !== 'string') {
          reject(new Error('请求失败'))
          return
        }
        const data = parseJSONP(res.data)
        if (!data || !data.fundcode) {
          reject(new Error('数据解析失败'))
          return
        }
        resolve({
          code: data.fundcode,
          name: data.name,
          dwjz: parseFloat(data.dwjz) || 0,
          gsz: parseFloat(data.gsz) || 0,
          gszzl: parseFloat(data.gszzl) || 0,
          jzrq: data.jzrq,
          gztime: data.gztime
        })
      },
      fail: reject
    })
  })
}

function fetchValuationBatch(codes) {
  var arr = []
  return codes.reduce(function(p, code) {
    return p.then(function() {
      return fetchValuation(code).catch(function() { return null }).then(function(v) {
        arr.push(v)
        return arr
      })
    })
  }, Promise.resolve()).then(function() { return arr })
}

function fetchLastDayChange(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `https://fund.eastmoney.com/pingzhongdata/${code}.js`,
      header: { Referer: 'https://fund.eastmoney.com/' },
      success(res) {
        if (res.statusCode !== 200 || typeof res.data !== 'string') {
          reject(new Error('请求失败'))
          return
        }
        const m = res.data.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/)
        if (!m) {
          reject(new Error('数据解析失败'))
          return
        }
        const trend = JSON.parse(m[1])
        if (!Array.isArray(trend) || !trend.length) {
          resolve(null)
          return
        }
        const last = trend[trend.length - 1]
        const direct = last && last.equityReturn != null ? parseFloat(last.equityReturn) : NaN
        if (!isNaN(direct)) {
          resolve(parseFloat(direct.toFixed(2)))
          return
        }
        // 兜底：用最后两个有效净值计算昨天份量涨跌幅
        const vals = []
        for (let i = trend.length - 1; i >= 0; i--) {
          const y = trend[i] && trend[i].y != null ? parseFloat(trend[i].y) : NaN
          if (!isNaN(y) && y > 0) vals.push(y)
          if (vals.length >= 2) break
        }
        if (vals.length >= 2) {
          const pct = ((vals[0] - vals[1]) / vals[1]) * 100
          resolve(parseFloat(pct.toFixed(2)))
          return
        }
        resolve(null)
      },
      fail: reject
    })
  })
}

function fetchLastDayChangeBatch(codes) {
  var arr = []
  return codes.reduce(function(p, code) {
    return p.then(function() {
      return fetchLastDayChange(code).catch(function() { return null }).then(function(v) {
        arr.push(v)
        return arr
      })
    })
  }, Promise.resolve()).then(function() { return arr })
}

function pickBaseValueByDays(trend, days) {
  if (!Array.isArray(trend) || !trend.length) return null
  const last = trend[trend.length - 1]
  const lastX = last && last.x != null ? parseFloat(last.x) : NaN
  const lastY = last && last.y != null ? parseFloat(last.y) : NaN
  if (isNaN(lastX) || isNaN(lastY) || lastY <= 0) return null
  const target = lastX - days * 24 * 60 * 60 * 1000
  for (let i = trend.length - 1; i >= 0; i--) {
    const x = trend[i] && trend[i].x != null ? parseFloat(trend[i].x) : NaN
    const y = trend[i] && trend[i].y != null ? parseFloat(trend[i].y) : NaN
    if (!isNaN(x) && !isNaN(y) && y > 0 && x <= target) return y
  }
  for (let i = 0; i < trend.length; i++) {
    const y = trend[i] && trend[i].y != null ? parseFloat(trend[i].y) : NaN
    if (!isNaN(y) && y > 0) return y
  }
  return null
}

function fetchPeriodChanges(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `https://fund.eastmoney.com/pingzhongdata/${code}.js`,
      header: { Referer: 'https://fund.eastmoney.com/' },
      success(res) {
        if (res.statusCode !== 200 || typeof res.data !== 'string') {
          reject(new Error('请求失败'))
          return
        }
        const m = res.data.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/)
        if (!m) {
          reject(new Error('数据解析失败'))
          return
        }
        const trend = JSON.parse(m[1])
        if (!Array.isArray(trend) || !trend.length) {
          resolve({ d30: null, daily30: [] })
          return
        }
        const last = trend[trend.length - 1]
        const lastY = last && last.y != null ? parseFloat(last.y) : NaN
        if (isNaN(lastY) || lastY <= 0) {
          resolve({ d30: null, daily30: [] })
          return
        }
        const base30 = pickBaseValueByDays(trend, 30)
        const d30 = base30 && base30 > 0 ? parseFloat((((lastY - base30) / base30) * 100).toFixed(2)) : null
        const target30 = (last && last.x ? parseFloat(last.x) : 0) - 29 * 24 * 60 * 60 * 1000
        let prevY = null
        const daily30 = []
        trend.forEach(item => {
          const x = item && item.x != null ? parseFloat(item.x) : NaN
          const y = item && item.y != null ? parseFloat(item.y) : NaN
          if (isNaN(x) || isNaN(y) || y <= 0) return
          let pct = item.equityReturn != null ? parseFloat(item.equityReturn) : NaN
          if (isNaN(pct) && prevY && prevY > 0) pct = ((y - prevY) / prevY) * 100
          prevY = y
          if (x >= target30) {
            const d = new Date(x)
            const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            daily30.push({
              date,
              pct: isNaN(pct) ? null : parseFloat(pct.toFixed(2))
            })
          }
        })
        resolve({ d30, daily30 })
      },
      fail: reject
    })
  })
}

function fetchDailyTrend(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `https://fund.eastmoney.com/pingzhongdata/${code}.js`,
      header: { Referer: 'https://fund.eastmoney.com/' },
      success(res) {
        if (res.statusCode !== 200 || typeof res.data !== 'string') {
          reject(new Error('请求失败'))
          return
        }
        const m = res.data.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/)
        if (!m) {
          reject(new Error('数据解析失败'))
          return
        }
        const trend = JSON.parse(m[1])
        if (!Array.isArray(trend)) {
          resolve([])
          return
        }
        const list = []
        let prevY = null
        trend.forEach(function(item) {
          const x = item && item.x != null ? parseFloat(item.x) : NaN
          const y = item && item.y != null ? parseFloat(item.y) : NaN
          if (isNaN(x) || isNaN(y) || y <= 0) return
          const d = new Date(x)
          const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
          let earn = null
          if (prevY != null && prevY > 0) {
            const pct = item.equityReturn != null ? parseFloat(item.equityReturn) : NaN
            earn = !isNaN(pct) ? prevY * (pct / 100) : (y - prevY)
          }
          prevY = y
          list.push({ date, nav: y, earn: earn })
        })
        resolve(list)
      },
      fail: reject
    })
  })
}

module.exports = { fetchValuation, fetchValuationBatch, fetchLastDayChange, fetchLastDayChangeBatch, fetchPeriodChanges, fetchDailyTrend }
