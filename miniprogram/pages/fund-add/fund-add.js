const storage = require('../../utils/storage')

Page({
  data: {
    code: '',
    name: '',
    shares: '',
    cost: '',
    replenishThreshold: '',
    isEdit: false,
    theme: 'green'
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme || 'green' })
  },

  onLoad(opts) {
    const theme = getApp().globalData.theme || 'green'
    getApp().applyTheme(theme)
    this.setData({ theme })
    if (opts.edit === '1' && opts.code) {
      this.setData({
        isEdit: true,
        code: opts.code,
        name: opts.name ? decodeURIComponent(opts.name) : '',
        shares: opts.shares || '',
        cost: opts.cost || '',
        replenishThreshold: opts.replenishThreshold != null ? opts.replenishThreshold : ''
      })
    }
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value.trim() })
  },
  onSharesInput(e) {
    this.setData({ shares: e.detail.value })
  },
  onCostInput(e) {
    this.setData({ cost: e.detail.value })
  },
  onReplenishThresholdInput(e) {
    this.setData({ replenishThreshold: e.detail.value })
  },

  submit() {
    const { code, name, shares, cost, replenishThreshold, isEdit } = this.data
    if (!code) {
      wx.showToast({ title: '请输入鸡蛋类型', icon: 'none' })
      return
    }
    if (!shares || Number(shares) <= 0) {
      wx.showToast({ title: '请输入有效份额', icon: 'none' })
      return
    }
    if (!cost || Number(cost) <= 0) {
      wx.showToast({ title: '请输入有效成本', icon: 'none' })
      return
    }
    const c = code.padStart(6, '0')
    const threshold = replenishThreshold ? Number(replenishThreshold) : 3
    const payload = { name: name || c, shares: Number(shares), cost: Number(cost), replenishThreshold: threshold }
    if (isEdit) {
      storage.updateFund(c, payload)
      wx.showToast({ title: '已更新' })
    } else {
      const ok = storage.addFund({ code: c, ...payload })
      if (!ok) {
        wx.showToast({ title: '该鸡蛋已存在', icon: 'none' })
        return
      }
      wx.showToast({ title: '添加成功' })
    }
    const app = getApp()
    if (app.globalData) app.globalData.funds = storage.getFunds()
    setTimeout(() => wx.navigateBack(), 500)
  }
})
