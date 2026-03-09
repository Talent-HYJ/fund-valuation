const KEY = 'fund_list'

function getFunds() {
  return wx.getStorageSync(KEY) || []
}

function setFunds(funds) {
  wx.setStorageSync(KEY, funds)
}

function addFund(fund) {
  const list = getFunds()
  if (list.some(f => f.code === fund.code)) return false
  list.push({
    code: fund.code,
    name: fund.name || '',
    shares: Number(fund.shares) || 0,
    cost: Number(fund.cost) || 0,
    replenishThreshold: Number(fund.replenishThreshold) || 3,
    addTime: Date.now()
  })
  setFunds(list)
  return true
}

function removeFund(code) {
  const list = getFunds().filter(f => f.code !== code)
  setFunds(list)
}

function updateFund(code, data) {
  const list = getFunds()
  const i = list.findIndex(f => f.code === code)
  if (i === -1) return false
  list[i] = { ...list[i], ...data }
  setFunds(list)
  return true
}

const DAILY_EARN_KEY = 'daily_earn'

function getDailyEarns() {
  return wx.getStorageSync(DAILY_EARN_KEY) || {}
}

function saveDailyEarn(date, earn) {
  const map = getDailyEarns()
  map[date] = earn
  wx.setStorageSync(DAILY_EARN_KEY, map)
}

function setDailyEarns(map) {
  wx.setStorageSync(DAILY_EARN_KEY, map)
}

module.exports = { getFunds, setFunds, addFund, removeFund, updateFund, getDailyEarns, saveDailyEarn, setDailyEarns }
