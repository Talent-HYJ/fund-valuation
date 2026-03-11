const watchlistStorage = require('../../utils/watchlist')
const fundApi = require('../../utils/fund')

Page({
  data: {
    keyword: '',
    searchList: [],
    searchLoading: false,
    list: [],
    theme: 'green'
  },

  onShow() {
    const app = getApp()
    const theme = app.globalData.theme || 'green'
    app.applyTheme(theme)
    const tb = this.getTabBar()
    if (tb) tb.setData({ selected: 1, theme })
    this.setData({ theme })
    this.loadList()
  },

  onPullDownRefresh() {
    this.loadList()
  },

  loadList() {
    const list = watchlistStorage.getWatchlist()
    if (!list.length) {
      this.setData({ list: [] })
      wx.stopPullDownRefresh()
      return
    }
    this.setData({ list: list.map(f => ({ ...f, gsz: null, dwjz: null, gszzl: null, lastDayPct: null })) })
    const codes = list.map(f => f.code)
    const that = this
    fundApi.fetchValuationBatch(codes).then(function(arr) {
      const merged = (that.data.list || []).map((item, i) => {
        const v = arr[i]
        if (!v) return item
        return { ...item, gsz: v.gsz, dwjz: v.dwjz, gszzl: v.gszzl }
      })
      that.setData({ list: merged })
      fundApi.fetchLastDayChangeBatch(codes).then(function(pcts) {
        const list2 = (that.data.list || []).map((item, i) => ({ ...item, lastDayPct: pcts[i] }))
        that.setData({ list: list2 })
      })
      wx.stopPullDownRefresh()
    }).catch(() => wx.stopPullDownRefresh())
  },

  onKeywordInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    if (!keyword.trim()) {
      this.setData({ searchList: [], searchLoading: false })
      return
    }
    this.setData({ searchLoading: true })
    const that = this
    this._searchTimer = setTimeout(function() {
      that._searchTimer = null
      fundApi.searchFund(keyword).then(function(list) {
        that.setData({ searchList: list || [], searchLoading: false })
      }).catch(() => that.setData({ searchLoading: false }))
    }, 300)
  },

  closeSearch() {
    this.setData({ keyword: '', searchList: [], searchLoading: false })
  },

  addWatch(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item.code) return
    const code = String(item.code).padStart(6, '0')
    const name = item.name || code
    if (watchlistStorage.addToWatchlist({ code, name })) {
      wx.showToast({ title: '已添加自选' })
      this.setData({ searchList: [], keyword: '' })
      this.loadList()
    } else {
      wx.showToast({ title: '已在自选中', icon: 'none' })
    }
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
    const base = this._touchStartOpen ? -296 : 0
    const offset = Math.max(-296, Math.min(0, base + dx * scale))
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
    const base = this._touchStartOpen ? -296 : 0
    const curOffset = cur && cur.swipeOffset != null ? cur.swipeOffset : base + (endX - startX) * scale
    const open = curOffset < -148
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

  addToFund(e) {
    const code = e.currentTarget.dataset.code
    const name = e.currentTarget.dataset.name || code
    if (!code) return
    this.toggleSwipe(code, false)
    wx.navigateTo({
      url: `/pages/fund-add/fund-add?code=${code}&name=${encodeURIComponent(name || '')}&fromWatchlist=1`
    })
  },

  removeWatch(e) {
    const code = e.currentTarget.dataset.code
    if (!code) return
    this.toggleSwipe(code, false)
    watchlistStorage.removeFromWatchlist(code)
    this.setData({ list: (this.data.list || []).filter(item => item.code !== code) })
  },

  toDetail(e) {
    const code = e.currentTarget.dataset.code
    const curr = (this.data.list || []).find(item => item.code === code)
    if (curr && curr.open) {
      this.toggleSwipe(code, false)
      return
    }
    if (code) wx.navigateTo({ url: `/pages/fund-detail/fund-detail?code=${code}` })
  }
})
