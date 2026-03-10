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
    const tb = this.getTabBar()
    if (tb) tb.setData({ selected: 1, theme: getApp().globalData.theme })
    this.setData({ theme: getApp().globalData.theme })
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
    this._touchStartX = e.changedTouches[0].clientX
    this._touchCode = e.currentTarget.dataset.code
  },

  onItemTouchEnd(e) {
    const startX = this._touchStartX || 0
    const endX = e.changedTouches[0].clientX
    const code = e.currentTarget.dataset.code
    if (!code || this._touchCode !== code) return
    const diff = endX - startX
    if (diff < -40) this.toggleSwipe(code, true)
    if (diff > 40) this.toggleSwipe(code, false)
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
