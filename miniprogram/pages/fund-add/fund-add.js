const storage = require('../../utils/storage')
const watchlistStorage = require('../../utils/watchlist')
const config = require('../../utils/supabase-config')

function stripThousandSep(s) {
    if (typeof s !== 'string') return ''
    const t = s.replace(/[\s,，\u00A0]/g, '').trim()
    const num = parseFloat(t)
    return isNaN(num) ? '' : String(num)
}

function parseOcrText(text) {
    if (!text || typeof text !== 'string') return null
    const raw = text.replace(/\s+/g, ' ').trim()
    const codeMatch = raw.match(/\b(\d{6})\b/)
    const code = codeMatch ? codeMatch[1] : ''
    let shares = ''
    let cost = ''
    const sharesMatch = raw.match(/持有\s*份\s*额[\s:：]*([\d,，\s.]+)|份\s*额[\s:：]*([\d,，\s.]+)/)
    if (sharesMatch) shares = stripThousandSep((sharesMatch[1] || sharesMatch[2] || '').replace(/[\u4e00-\u9fa5]/g, '').trim())
    const costMatch = raw.match(/持仓\s*成\s*本\s*价[\s:：]*([\d,，\s.]+)|成\s*本\s*价[\s:：]*([\d,，\s.]+)|成本[\s:：]*([\d,，\s.]+)/)
    if (costMatch) cost = stripThousandSep((costMatch[1] || costMatch[2] || costMatch[3] || '').replace(/[\u4e00-\u9fa5]/g, '').trim())
    if (costMatch) cost = stripThousandSep(costMatch[1] || costMatch[2] || costMatch[3] || '')
    if (!shares || !cost) {
        const block = raw.replace(/,|，/g, '')
        const numbers = block.match(/\d+\.?\d*/g) || []
        const numArr = numbers.filter(n => {
            const v = parseFloat(n)
            return v > 0 && v < 1e8
        })
        if (!shares && numArr.length >= 1) shares = String(numArr[0])
        if (!cost && numArr.length >= 2) cost = String(numArr[1])
    }
    return { code, shares, cost }
}

Page({
    data: {
        code: '',
        name: '',
        shares: '',
        cost: '',
        replenishThreshold: '',
        isEdit: false,
        theme: 'green',
        ocrLoading: false
    },

    onShow() {
        this.setData({ theme: getApp().globalData.theme || 'green' })
    },

    onLoad(opts) {
        const theme = getApp().globalData.theme || 'green'
        getApp().applyTheme(theme)
        this.setData({ theme, fromWatchlist: opts.fromWatchlist === '1' })
        if (opts.edit === '1' && opts.code) {
            this.setData({
                isEdit: true,
                code: opts.code,
                name: opts.name ? decodeURIComponent(opts.name) : '',
                shares: opts.shares || '',
                cost: opts.cost || '',
                replenishThreshold: opts.replenishThreshold != null ? opts.replenishThreshold : ''
            })
        } else if (opts.fromWatchlist === '1' && opts.code) {
            this.setData({
                code: opts.code,
                name: opts.name ? decodeURIComponent(opts.name) : ''
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

    chooseImageForOcr() {
        if (this.data.isEdit) return
        const unlimited = wx.getStorageSync('ocrUnlimited')
        if (!unlimited) {
            const today = new Date().toISOString().slice(0, 10)
            if (wx.getStorageSync('ocrLastUseDate') === today) {
                wx.showToast({ title: '今日已使用一次，明日再来', icon: 'none' })
                return
            }
        }
        const that = this
        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sizeType: ['compressed'],
            sourceType: ['album', 'camera'],
            success(res) {
                const path = res.tempFiles[0].tempFilePath
                that.setData({ ocrLoading: true })
                that.requestServiceMarketOcr(path)
            }
        })
    },

    requestServiceMarketOcr(filePath) {
        const that = this
        if (!wx.serviceMarket || !wx.serviceMarket.invokeService) {
            that.setData({ ocrLoading: false })
            wx.showToast({ title: '当前基础库不支持服务市场', icon: 'none' })
            return
        }
        wx.compressImage({
            src: filePath,
            quality: 50,
            compressedWidth: 800,
            compressedHeight: 800,
            success(compressRes) {
                that.doInvokeOcr(compressRes.tempFilePath)
            },
            fail() {
                that.doInvokeOcr(filePath)
            }
        })
    },

    doInvokeOcr(filePath) {
        const that = this
        const fs = wx.getFileSystemManager()
        fs.readFile({
            filePath,
            encoding: 'base64',
            success(res) {
                wx.serviceMarket.invokeService({
                    service: (config.ocr && config.ocr.serviceId) || 'wx79ac3de8be320b71',
                    api: (config.ocr && config.ocr.apiName) || 'OcrAllInOne',
                    data: {
                        img_data: res.data,
                        data_type: 2,
                        ocr_type: 8
                    },
                    success(invokeRes) {
                        let data = invokeRes.data || invokeRes
                        if (typeof data === 'string') {
                            try { data = JSON.parse(data) } catch (e) { data = {} }
                        }
                        console.log('识别结果', data)
                        const comm = data.ocr_comm_res
                        let text = ''
                        if (comm && typeof comm === 'object') {
                            if (typeof comm.text === 'string') text = comm.text
                            else if (Array.isArray(comm.items)) text = (comm.items || []).map(it => it.text || '').join(' ')
                            else if (Array.isArray(comm.words_result)) text = (comm.words_result || []).map(w => w.words || '').join(' ')
                        }
                        const parsed = parseOcrText(text)
                        if (parsed && (parsed.code || parsed.shares || parsed.cost)) {
                            if (!wx.getStorageSync('ocrUnlimited')) {
                                wx.setStorageSync('ocrLastUseDate', new Date().toISOString().slice(0, 10))
                            }
                            that.setData({
                                code: parsed.code || that.data.code,
                                shares: parsed.shares || that.data.shares,
                                cost: parsed.cost || that.data.cost,
                                ocrLoading: false
                            })
                            wx.showToast({ title: '已填充识别结果', icon: 'none' })
                        } else {
                            that.setData({ ocrLoading: false })
                            wx.showToast({ title: '未识别到有效内容', icon: 'none' })
                        }
                    },
                    fail(err) {
                        console.log(err)
                        that.setData({ ocrLoading: false })
                        wx.showToast({ title: err.errMsg || err.errmsg || '识别失败', icon: 'none' })
                    }
                })
            },
            fail() {
                that.setData({ ocrLoading: false })
                wx.showToast({ title: '读取图片失败', icon: 'none' })
            }
        })
    },

    submit() {
        const { code, name, shares, cost, replenishThreshold, isEdit, fromWatchlist } = this.data
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
            if (fromWatchlist) watchlistStorage.removeFromWatchlist(c)
            wx.showToast({ title: '添加成功' })
        }
        const app = getApp()
        if (app.globalData) app.globalData.funds = storage.getFunds()
        setTimeout(() => wx.navigateBack(), 500)
    }
})