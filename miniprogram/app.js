const THEME = { red: { color: '#e74c3c', bg: '#fff5f5' }, green: { color: '#1aad19', bg: '#f5fff5' } }
const fundApi = require('./utils/fund')
const sync = require('./utils/sync')

App({
  globalData: {
    funds: [],
    theme: 'green'
  },
  onLaunch() {
    const funds = wx.getStorageSync('fund_list') || []
    this.globalData.funds = funds
    if (!funds.length && sync.isConfigured()) {
      sync.syncDownloadSilent().then(r => {
        if (r?.ok) {
          const pages = getCurrentPages()
          const cur = pages[pages.length - 1]
          if (cur?.route === 'pages/fund-list/fund-list' && cur.loadData) cur.loadData(true)
        }
      }).catch(() => {})
    }
    const saved = wx.getStorageSync('theme') || 'green'
    this.globalData.theme = saved
    this.applyTheme(saved)
    fundApi.preloadFundList()
    this.checkUpdate()
  },
  checkUpdate() {
    if (!wx.canIUse('getUpdateManager')) return
    const updateManager = wx.getUpdateManager()
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已准备好，是否重启应用？',
        success: (res) => {
          if (res.confirm) updateManager.applyUpdate()
        }
      })
    })
    updateManager.onUpdateFailed(() => {
      wx.showToast({ title: '更新失败', icon: 'none' })
    })
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
