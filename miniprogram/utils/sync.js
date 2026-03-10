const storage = require('./storage')
const config = require('./supabase-config')

const TABLE = 'sync_data'
const OPENID_KEY = 'sync_openid'
const QUOTA_KEY = 'sync_quota'
const DAILY_LIMIT = 3

function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function getQuota() {
  const q = wx.getStorageSync(QUOTA_KEY) || {}
  const today = todayStr()
  if (q.date !== today) return { date: today, upload: 0, download: 0 }
  return q
}

function useQuota(type) {
  const q = getQuota()
  if (q[type] >= DAILY_LIMIT) return false
  q[type]++
  wx.setStorageSync(QUOTA_KEY, q)
  return true
}

function remainQuota(type) {
  const q = getQuota()
  return DAILY_LIMIT - (q[type] || 0)
}

function getOpenId() {
  return new Promise((resolve, reject) => {
    const cached = wx.getStorageSync(OPENID_KEY)
    if (cached) {
      resolve(cached)
      return
    }
    wx.login({
      success: (res) => {
        if (!res.code) {
          reject(new Error('登录失败'))
          return
        }
        wx.request({
          url: config.url + '/functions/v1/wechat-openid',
          method: 'POST',
          header: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (config.jwtKey || config.anonKey)
          },
          data: { code: res.code },
          success: (r) => {
            if (r.statusCode !== 200 || !r.data?.openid) {
              reject(new Error(r.data?.error || '获取用户信息失败'))
              return
            }
            wx.setStorageSync(OPENID_KEY, r.data.openid)
            resolve(r.data.openid)
          },
          fail: (e) => reject(e.errMsg ? new Error(e.errMsg) : e)
        })
      },
      fail: reject
    })
  })
}

function request(method, path, body, opts) {
  const { url, anonKey } = config
  if (!url || !anonKey) {
    return Promise.reject(new Error('请先配置 Supabase'))
  }
  const prefer = (opts?.prefer ? opts.prefer + ',' : '') + 'return=representation'
  return new Promise((resolve, reject) => {
    wx.request({
      url: url + path,
      method,
      header: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey,
        'Prefer': prefer
      },
      data: body,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(new Error(res.data?.message || res.data?.error || '请求失败'))
        }
      },
      fail: reject
    })
  })
}

function upload(openid) {
  const funds = storage.getFunds()
  const dailyEarns = storage.getDailyEarns()
  const payload = [{ openid, funds, daily_earns: dailyEarns, updated_at: new Date().toISOString() }]
  return request('POST', '/rest/v1/' + TABLE + '?on_conflict=openid', payload, { prefer: 'resolution=merge-duplicates' })
}

function download(openid) {
  return request('GET', '/rest/v1/' + TABLE + '?openid=eq.' + encodeURIComponent(openid) + '&order=updated_at.desc&limit=1')
    .then(rows => {
      if (!rows || rows.length === 0) return null
      return rows[0]
    })
}

function syncUpload() {
  if (!useQuota('upload')) return Promise.resolve({ ok: false, msg: `今日上传次数已用完（${DAILY_LIMIT}次/天）` })
  return getOpenId().then(openid => upload(openid).then(() => ({ ok: true })))
}

function syncDownload() {
  if (!useQuota('download')) return Promise.resolve({ ok: false, msg: `今日下载次数已用完（${DAILY_LIMIT}次/天）` })
  return getOpenId().then(openid =>
    download(openid).then(row => {
      if (!row || !row.funds) return { ok: false, msg: '无云端数据' }
      storage.setFunds(row.funds)
      if (row.daily_earns) storage.setDailyEarns(row.daily_earns)
      getApp().globalData.funds = row.funds
      return { ok: true }
    })
  )
}

function syncDownloadSilent() {
  return getOpenId().then(openid =>
    download(openid).then(row => {
      if (!row || !row.funds) return { ok: false }
      storage.setFunds(row.funds)
      if (row.daily_earns) storage.setDailyEarns(row.daily_earns)
      getApp().globalData.funds = row.funds
      return { ok: true }
    })
  )
}

module.exports = { syncUpload, syncDownload, syncDownloadSilent, remainQuota, isConfigured: () => !!(config.url && config.anonKey) }
