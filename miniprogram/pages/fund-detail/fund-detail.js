const storage = require('../../utils/storage')
const fundApi = require('../../utils/fund')

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildCalendar(daily30) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  if (!Array.isArray(daily30) || !daily30.length) return { weekdays, cells: [] }
  const map = {}
  daily30.forEach(i => { map[i.date] = i.pct })
  const last = new Date(daily30[daily30.length - 1].date)
  const start = new Date(last)
  start.setDate(start.getDate() - 29)
  const cells = []
  for (let i = 0; i < start.getDay(); i++) cells.push({ id: `e${i}`, empty: true })
  for (let i = 0; i < 30; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const key = formatDate(d)
    const pct = map[key]
    cells.push({
      id: key,
      empty: false,
      day: d.getDate(),
      pctText: pct == null ? '-' : `${pct >= 0 ? '+' : ''}${pct}%`,
      cls: pct == null ? 'none' : (pct >= 0 ? 'up' : 'down')
    })
  }
  return { weekdays, cells }
}

Page({
  data: {
    code: '',
    fund: null,
    val: null,
    loading: true,
    calendar: { weekdays: ['日', '一', '二', '三', '四', '五', '六'], cells: [] },
    theme: 'green'
  },

  onLoad(opts) {
    const theme = getApp().globalData.theme || 'green'
    getApp().applyTheme(theme)
    this.setData({
      code: (opts.code || '').padStart(6, '0'),
      theme
    })
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme || 'green' })
    const code = this.data.code
    if (!code) return
    const funds = storage.getFunds()
    const fund = funds.find(f => f.code === code) || { code, name: '', shares: 0, cost: 0 }
    this.setData({ fund })
    this.loadValuation()
  },

  loadValuation() {
    this.setData({ loading: true })
    const that = this
    Promise.all([
      fundApi.fetchValuation(this.data.code),
      fundApi.fetchPeriodChanges(this.data.code).catch(() => ({ d30: null, daily30: [] }))
    ])
      .then(function(res) {
        var val = res[0]
        var period = res[1] || { d30: null, daily30: [] }
        const fund = that.data.fund
        const market = (fund.shares * val.gsz).toFixed(2)
        const todayEarn = (fund.shares * (val.gsz - val.dwjz)).toFixed(2)
        const costTotal = fund.shares * fund.cost
        const earn = (fund.shares * val.gsz - costTotal).toFixed(2)
        const earnRate = costTotal > 0 ? ((fund.shares * val.gsz - costTotal) / costTotal * 100).toFixed(2) : '0'
        const rise30d = period.d30
        const rise30dText = rise30d == null ? '-' : `${rise30d >= 0 ? '+' : ''}${rise30d}%`
        const calendar = buildCalendar(period.daily30 || [])
        that.setData({
          val: {
            ...val,
            market,
            todayEarn,
            earn,
            earnRate,
            rise30d,
            rise30dText
          },
          calendar,
          loading: false
        })
      })
      .catch(() => that.setData({ loading: false }))
  },

  copyFund() {
    const { code } = this.data
    const name = this.data.val?.name || ''
    const text = name ? `${name} ${code}` : code
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  },

  onPullDownRefresh() {
    this.loadValuation()
    wx.stopPullDownRefresh()
  }
})
