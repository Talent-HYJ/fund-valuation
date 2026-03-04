const THEME = { red: { color: '#e74c3c', bg: '#fff5f5' }, green: { color: '#1aad19', bg: '#f5fff5' } }

App({
  globalData: {
    funds: [],
    theme: 'green'
  },
  onLaunch() {
    const funds = wx.getStorageSync('fund_list') || []
    this.globalData.funds = funds
    const saved = wx.getStorageSync('theme') || 'green'
    this.globalData.theme = saved
    this.applyTheme(saved)
  },
  updateTheme(todayEarnings) {
    const theme = parseFloat(todayEarnings) > 0 ? 'red' : 'green'
    this.globalData.theme = theme
    wx.setStorageSync('theme', theme)
    this.applyTheme(theme)
  },
  applyTheme(theme) {
    const t = THEME[theme] || THEME.green
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: t.color, animation: { duration: 0 } })
  }
})
