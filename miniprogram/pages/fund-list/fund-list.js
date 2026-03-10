const storage = require('../../utils/storage')
const fundApi = require('../../utils/fund')

function buildCalendar(dailyEarnMap, year, month) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const cells = []
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  const startPad = first.getDay()
  for (let i = 0; i < startPad; i++) cells.push({ id: 'e' + i, empty: true })
  for (let d = 1; d <= last.getDate(); d++) {
    const key = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    const earn = dailyEarnMap[key]
    cells.push({
      id: key,
      empty: false,
      day: d,
      earn: earn != null ? earn : null,
      earnText: earn != null ? (earn >= 0 ? '+' : '') + earn.toFixed(2) : '-',
      cls: earn == null ? 'none' : (earn >= 0 ? 'up' : 'down')
    })
  }
  return { weekdays, cells }
}

Page({
  data: {
    hasFunds: false,
    loading: false,
    todayEarn: '0.00',
    monthEarn: '0.00',
    totalEarn: '0.00',
    calYear: 0,
    calMonth: 0,
    calendar: { weekdays: ['日', '一', '二', '三', '四', '五', '六'], cells: [] },
    theme: 'green'
  },

  onShow() {
    const tb = this.getTabBar()
    if (tb) tb.setData({ selected: 2, theme: getApp().globalData.theme })
    const now = new Date()
    this.setData({ theme: getApp().globalData.theme, calYear: now.getFullYear(), calMonth: now.getMonth() + 1 })
    this.loadData(true)
  },

  loadData(silent) {
    const reqId = Date.now()
    this._loadReqId = reqId
    const funds = storage.getFunds()
    if (!funds.length) {
      if (this._loadReqId !== reqId) return
      this.setData({ hasFunds: false, todayEarn: '0.00', monthEarn: '0.00', totalEarn: '0.00', loading: false, theme: getApp().globalData.theme })
      getApp().updateTheme('0.00')
      const tb = this.getTabBar()
      if (tb) tb.setData({ theme: getApp().globalData.theme })
      wx.stopPullDownRefresh()
      return
    }
    if (!silent) this.setData({ loading: true })
    this.setData({ hasFunds: true })
    const that = this
    const codes = funds.map(f => f.code)
    fundApi.fetchValuationBatch(codes).then(function(arr) {
      if (that._loadReqId !== reqId) return
      let todayEarn = 0
      let totalEarn = 0
      funds.forEach(function(f, i) {
        const v = arr[i]
        if (!v) return
        const market = f.shares * v.gsz
        const costTotal = f.shares * f.cost
        todayEarn += f.shares * (v.gsz - v.dwjz)
        totalEarn += market - costTotal
      })
      const d = new Date()
      const todayStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
      const dailyEarnMap = Object.assign({}, storage.getDailyEarns())
      dailyEarnMap[todayStr] = todayEarn
      const todayStrVal = todayEarn.toFixed(2)
      that.setData({
        todayEarn: todayStrVal,
        totalEarn: totalEarn.toFixed(2),
        loading: false,
        theme: getApp().globalData.theme
      })
      getApp().updateTheme(todayStrVal)
      const tb = that.getTabBar()
      if (tb) tb.setData({ theme: getApp().globalData.theme })
      that.mergeActualEarns(funds, dailyEarnMap, todayStr, todayEarn)
    }).catch(() => {
      if (that._loadReqId !== reqId) return
      that.setData({ todayEarn: '0.00', totalEarn: '0.00', loading: false, theme: getApp().globalData.theme })
      getApp().updateTheme('0.00')
      const tb = that.getTabBar()
      if (tb) tb.setData({ theme: getApp().globalData.theme })
      that.refreshCalendar()
    }).finally(() => {
      if (that._loadReqId === reqId) wx.stopPullDownRefresh()
    })
  },

  mergeActualEarns(funds, dailyEarnMap, todayStr, todayEstimated) {
    const that = this
    const codes = funds.map(f => f.code)
    const trends = {}
    let done = 0
    function getAddDate(f) {
      const t = f.addTime
      if (!t) return '2000-01-01'
      const d = new Date(t)
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    }
    codes.forEach(function(code) {
      const fund = funds.find(f => f.code === code)
      const addDate = getAddDate(fund)
      fundApi.fetchDailyTrend(code).catch(() => []).then(function(list) {
        trends[code] = { list, addDate, shares: fund.shares }
        done++
        if (done === codes.length) {
          const actualMap = {}
          Object.keys(trends).forEach(function(c) {
            const { list, addDate, shares } = trends[c]
            list.forEach(function(item) {
              if (item.date < addDate) return
              const earn = (item.earn != null ? item.earn : 0) * shares
              actualMap[item.date] = (actualMap[item.date] || 0) + earn
            })
          })
          Object.keys(actualMap).forEach(function(date) {
            dailyEarnMap[date] = actualMap[date]
          })
          dailyEarnMap[todayStr] = actualMap[todayStr] != null ? actualMap[todayStr] : todayEstimated
          storage.setDailyEarns(dailyEarnMap)
          that.refreshCalendar()
        }
      })
    })
    if (codes.length === 0) {
      storage.setDailyEarns(dailyEarnMap)
      that.refreshCalendar()
    }
  },

  refreshCalendar() {
    const dailyEarnMap = storage.getDailyEarns()
    const now = new Date()
    const year = this.data.calYear || now.getFullYear()
    const month = this.data.calMonth || (now.getMonth() + 1)
    const curYear = now.getFullYear()
    const curMonth = now.getMonth() + 1
    let monthEarn = 0
    Object.keys(dailyEarnMap).forEach(function(key) {
      const parts = key.split('-')
      if (parseInt(parts[0]) === curYear && parseInt(parts[1]) === curMonth) {
        monthEarn += dailyEarnMap[key]
      }
    })
    const calendar = buildCalendar(dailyEarnMap, year, month)
    this.setData({ calendar, monthEarn: monthEarn.toFixed(2) })
  },

  prevYear() {
    this.setData({ calYear: this.data.calYear - 1 })
    this.refreshCalendar()
  },

  nextYear() {
    this.setData({ calYear: this.data.calYear + 1 })
    this.refreshCalendar()
  },

  prevMonth() {
    let y = this.data.calYear
    let m = this.data.calMonth - 1
    if (m < 1) { m = 12; y-- }
    this.setData({ calYear: y, calMonth: m })
    this.refreshCalendar()
  },

  nextMonth() {
    let y = this.data.calYear
    let m = this.data.calMonth + 1
    if (m > 12) { m = 1; y++ }
    this.setData({ calYear: y, calMonth: m })
    this.refreshCalendar()
  },

  onPullDownRefresh() {
    this.loadData(true)
  }
})
