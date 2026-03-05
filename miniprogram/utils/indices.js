const CODES = [
  { key: 's_sh000001', name: 'SZZS' },
  { key: 's_sz399001', name: 'SZCZ' },
  { key: 's_sz399006', name: 'CYBZ' },
  { key: 's_sh000688', name: 'KC50' },
  { key: 's_sh000300', name: 'HS300' },
  { key: 's_sh000016', name: 'SZ50' }
]
const LIST = CODES.map(c => c.key).join(',')

function parseOne(line) {
  const keyMatch = line.match(/hq_str_(s_\w+)/)
  const valMatch = line.match(/="([^"]*)"/)
  if (!keyMatch || !valMatch) return null
  const parts = valMatch[1].split(',')
  if (parts.length < 4) return null
  return {
    key: keyMatch[1],
    name: parts[0],
    current: parts[1],
    change: parts[2],
    changePct: parts[3]
  }
}

function fetchIndices() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `https://hq.sinajs.cn/list=${LIST}`,
      header: { Referer: 'https://finance.sina.com.cn' },
      success(res) {
        if (res.statusCode !== 200 || typeof res.data !== 'string') {
          reject(new Error('请求失败'))
          return
        }
        const byKey = {}
        res.data.split(/\s*;\s*/).forEach(line => {
          const data = parseOne(line)
          if (data) byKey[data.key] = data
        })
        const list = CODES.map(c => {
          const d = byKey[c.key]
          const changePct = d ? d.changePct : ''
          const num = parseFloat(changePct) || 0
          let bgStyle = 'background: linear-gradient(135deg, #f0f0f0, #e0e0e0);'
          if (num > 0) {
            const t = Math.min(1, num / 3)
            const r = 255 - Math.round(57 * t)
            const g = 205 - Math.round(165 * t)
            const b = 210 - Math.round(170 * t)
            bgStyle = `background: linear-gradient(135deg, rgb(255,235,238), rgb(${r},${g},${b}));`
          } else if (num < 0) {
            const t = Math.min(1, -num / 3)
            const r = 220 - Math.round(194 * t)
            const g = 245 - Math.round(72 * t)
            const b = 220 - Math.round(195 * t)
            bgStyle = `background: linear-gradient(135deg, rgb(220,245,220), rgb(${r},${g},${b}));`
          }
          return {
            name: c.name,
            current: d ? d.current : '-',
            change: d ? d.change : '',
            changePct,
            isUp: num >= 0,
            bgStyle
          }
        })
        resolve(list)
      },
      fail: reject
    })
  })
}

module.exports = { fetchIndices }
