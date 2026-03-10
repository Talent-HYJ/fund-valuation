const KEY = 'fund_watchlist'

function getWatchlist() {
  return wx.getStorageSync(KEY) || []
}

function addToWatchlist(item) {
  const list = getWatchlist()
  if (list.some(f => f.code === item.code)) return false
  list.push({ code: String(item.code).padStart(6, '0'), name: item.name || item.code, addTime: Date.now() })
  wx.setStorageSync(KEY, list)
  return true
}

function removeFromWatchlist(code) {
  const list = getWatchlist().filter(f => f.code !== code)
  wx.setStorageSync(KEY, list)
}

module.exports = { getWatchlist, addToWatchlist, removeFromWatchlist }
