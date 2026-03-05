Component({
  data: {
    selected: 0,
    theme: 'green',
    list: [
      { pagePath: '/pages/index/index', text: '鸡场', icon: '/images/tab-home.svg', iconActive: '/images/tab-home-active.svg', iconActiveRed: '/images/tab-home-active-red.svg' },
      { pagePath: '/pages/fund-list/fund-list', text: '鸡蛋', icon: '/images/tab-fund.svg', iconActive: '/images/tab-fund-active.svg', iconActiveRed: '/images/tab-fund-active-red.svg' }
    ]
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      wx.switchTab({ url: data.path })
    }
  }
})
