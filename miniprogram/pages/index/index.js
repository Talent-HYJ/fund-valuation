const storage = require('../../utils/storage')
const watchlistStorage = require('../../utils/watchlist')
const fundApi = require('../../utils/fund')
const indicesApi = require('../../utils/indices')

Page({
  data: {
    todayEarnings: 0,
    totalEarnings: 0,
    totalAmount: 0,
    loading: true,
    list: [],
    indices: [],
    theme: 'green'
  },

  onShow() {
    const app = getApp()
    const theme = app.globalData.theme || 'green'
    app.applyTheme(theme)
    const tb = this.getTabBar()
    if (tb) tb.setData({ selected: 0, theme })
    this.setData({ theme })
    this.loadData()
    indicesApi.fetchIndices().then(indices => this.setData({ indices })).catch(() => wx.showToast({ title: '指数加载失败', icon: 'none' }))
    this._startRefreshTimer()
  },

  onHide() {
    this._stopRefreshTimer()
  },

  onUnload() {
    this._stopRefreshTimer()
  },

  _startRefreshTimer() {
    this._stopRefreshTimer()
    this._refreshTimer = setInterval(() => this.loadData(true), 10000)
  },

  _stopRefreshTimer() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer)
      this._refreshTimer = null
    }
  },

  loadData(silent) {
    const reqId = Date.now()
    this._loadReqId = reqId
    const cachedMap = {}
    ;(this.data.list || []).forEach(function(item) {
      if (item && item.code && item.lastDayPct != null) cachedMap[item.code] = item.lastDayPct
    })
    this._lastDayMap = Object.assign({}, this._lastDayMap || {}, cachedMap)
    const funds = storage.getFunds()
    if (!funds.length) {
      if (this._loadReqId !== reqId) return
      this.setData({ loading: false, list: [], theme: getApp().globalData.theme })
      getApp().updateTheme('0.00')
      const tb = this.getTabBar()
      if (tb) tb.setData({ theme: getApp().globalData.theme })
      wx.stopPullDownRefresh()
      return
    }
    if (!silent) this.setData({ loading: true })
    const that = this
    const codes = funds.map(f => f.code)
    fundApi.fetchValuationBatch(codes).then(function(arr) {
      if (that._loadReqId !== reqId) return
      let todayEarnings = 0
      let totalAmount = 0
      const list = funds.map((f, i) => {
        const v = arr[i]
        const lastDayPct = that._lastDayMap[f.code]
        if (!v) return { ...f, gsz: null, gszzl: null, dwjz: null, market: null, todayEarn: null, earn: null, lastDayPct: lastDayPct == null ? null : lastDayPct }
        const market = (f.shares * v.gsz).toFixed(2)
        const costTotal = f.shares * f.cost
        const todayEarn = (f.shares * (v.gsz - v.dwjz)).toFixed(2)
        const earn = (f.shares * v.gsz - costTotal).toFixed(2)
        const te = parseFloat(todayEarn)
        const threshold = f.replenishThreshold || 3
        const mkt = parseFloat(market)
        const loss = costTotal - mkt
        const presetReplenish = loss > 0 && threshold > 0 ? Math.max(0, loss * 100 / threshold - mkt).toFixed(2) : null
        todayEarnings += te
        totalAmount += parseFloat(market)
        return { ...f, ...v, market, todayEarn, earn, presetReplenish, lastDayPct: lastDayPct == null ? null : lastDayPct }
      })
      const costTotal = funds.reduce((s, f) => s + f.shares * f.cost, 0)
      const todayStr = todayEarnings.toFixed(2)
      getApp().updateTheme(todayStr)
      that.setData({
        list,
        todayEarnings: todayStr,
        totalEarnings: (totalAmount - costTotal).toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        loading: false,
        theme: getApp().globalData.theme
      })
      const tb = that.getTabBar()
      if (tb) tb.setData({ theme: getApp().globalData.theme })
    }).catch(() => {
      if (that._loadReqId !== reqId) return
      const list = funds.map(f => ({ ...f, gsz: null, gszzl: null, dwjz: null, market: null, todayEarn: null, earn: null, presetReplenish: null, lastDayPct: null }))
      that.setData({ list, todayEarnings: '0.00', totalEarnings: '0.00', totalAmount: '0.00', loading: false, theme: getApp().globalData.theme })
      getApp().updateTheme('0.00')
      const tb = that.getTabBar()
      if (tb) tb.setData({ theme: getApp().globalData.theme })
    }).finally(() => {
      if (that._loadReqId === reqId) wx.stopPullDownRefresh()
    })

    fundApi.fetchLastDayChangeBatch(codes).then(function(lastDayPcts) {
      if (that._loadReqId !== reqId) return
      const map = {}
      codes.forEach((code, i) => {
        map[code] = lastDayPcts[i]
      })
      that._lastDayMap = map
      const merged = (that.data.list || []).map(item => ({ ...item, lastDayPct: map[item.code] == null ? null : map[item.code] }))
      that.setData({ list: merged })
    }).catch(() => {})
  },

  onPullDownRefresh() {
    this.loadData()
    indicesApi.fetchIndices().then(indices => this.setData({ indices })).catch(() => wx.showToast({ title: '指数加载失败', icon: 'none' }))
  },

  toAdd() {
    wx.navigateTo({ url: '/pages/fund-add/fund-add' })
  },

  toDetail(e) {
    const code = e.currentTarget.dataset.code
    const curr = (this.data.list || []).find(item => item.code === code)
    if (curr && curr.open) {
      this.toggleSwipe(code, false)
      return
    }
    wx.navigateTo({ url: `/pages/fund-detail/fund-detail?code=${code}` })
  },

  onItemTouchStart(e) {
    this._touchStartX = e.touches[0].clientX
    this._touchStartY = e.touches[0].clientY
    this._touchCode = e.currentTarget.dataset.code
    this._touchIndex = e.currentTarget.dataset.index
    this._swipeLocked = false
    const idx = this._touchIndex
    if (idx === undefined) return
    const list = this.data.list || []
    this._touchStartOpen = list[idx] && list[idx].open
    try {
      this._rpxScale = 750 / wx.getSystemInfoSync().windowWidth
    } catch (err) {
      this._rpxScale = 2
    }
  },

  onItemTouchMove(e) {
    const idx = e.currentTarget.dataset.index
    const code = e.currentTarget.dataset.code
    if (idx === undefined || this._touchCode !== code || this._touchIndex !== idx) return
    const startX = this._touchStartX || 0
    const startY = this._touchStartY || 0
    const curX = e.touches[0].clientX
    const curY = e.touches[0].clientY
    const dx = curX - startX
    const dy = curY - startY
    if (this._swipeLocked === false) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) this._swipeLocked = true
      else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) return
    }
    if (!this._swipeLocked) return
    const now = Date.now()
    if (this._moveThrottle && now - this._moveThrottle < 16) return
    this._moveThrottle = now
    const scale = this._rpxScale || 2
    const base = this._touchStartOpen ? -436 : 0
    const offset = Math.max(-436, Math.min(0, base + dx * scale))
    const list = this.data.list || []
    if (!list[idx]) return
    this.setData({ [`list[${idx}].swipeOffset`]: offset })
  },

  onItemTouchEnd(e) {
    const startX = this._touchStartX || 0
    const endX = e.changedTouches[0].clientX
    const code = e.currentTarget.dataset.code
    const idx = e.currentTarget.dataset.index
    if (code == null || idx === undefined || this._touchCode !== code) return
    const list = (this.data.list || []).slice()
    const cur = list[idx]
    const scale = this._rpxScale || 2
    const base = this._touchStartOpen ? -436 : 0
    const curOffset = cur && cur.swipeOffset != null ? cur.swipeOffset : base + (endX - startX) * scale
    const open = curOffset < -218
    list.forEach((item, i) => {
      if (i === idx) list[i] = { ...item, open, swipeOffset: null }
      else if (open) list[i] = { ...item, open: false }
    })
    this.setData({ list })
  },

  toggleSwipe(code, open) {
    const list = (this.data.list || []).map(item => {
      if (item.code === code) return { ...item, open: !!open }
      return { ...item, open: false }
    })
    this.setData({ list })
  },

  addToWatchlist(e) {
    const code = e.currentTarget.dataset.code
    const name = e.currentTarget.dataset.name || code
    if (!code) return
    this.toggleSwipe(code, false)
    if (watchlistStorage.addToWatchlist({ code, name })) {
      storage.removeFund(code)
      const app = getApp()
      if (app.globalData) app.globalData.funds = storage.getFunds()
      this.loadData()
      wx.showToast({ title: '已移入自选' })
    } else {
      wx.showToast({ title: '已在自选中', icon: 'none' })
    }
  },

  editFund(e) {
    const code = e.currentTarget.dataset.code
    const f = storage.getFunds().find(i => i.code === code)
    if (!f) return
    this.toggleSwipe(code, false)
    wx.navigateTo({
      url: `/pages/fund-add/fund-add?edit=1&code=${f.code}&name=${encodeURIComponent(f.name || '')}&shares=${f.shares}&cost=${f.cost}&replenishThreshold=${f.replenishThreshold != null ? f.replenishThreshold : ''}`
    })
  },

  deleteFund(e) {
    const code = e.currentTarget.dataset.code
    this.toggleSwipe(code, false)
    wx.showModal({
      title: '确认删除',
      content: '确定移除该鸡蛋？',
      success: (res) => {
        if (res.confirm) {
          storage.removeFund(code)
          this.loadData()
        }
      }
    })
  }
})
