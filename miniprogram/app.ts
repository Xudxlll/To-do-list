import { Option, ShareData, decodeShareData, validateShareData } from './data/categories';
import { initCloud } from './config/cloud';
import { clearLockedPlan, getLockedPlan, saveLockedPlan } from './services/lockedPlans';

interface LockedState {
  locked: boolean;
  date: string;
  shareData: ShareData;
}

interface IAppOption {
  globalData: {
    nickname: string;
    selections: Record<string, Option[]>;
    partnerShareData: ShareData | null;
  };
  handleShareEntry(options: WechatMiniprogram.App.LaunchShowOption): void;
  getLockedState(): LockedState | null;
  saveLockedState(shareData: ShareData): Promise<void>;
  clearLockedState(): Promise<void>;
  restoreCloudLockedState(): Promise<void>;
  getDateString(): string;
  saveSelections(): void;
}

let cloudLockedChecking = false;

function isCurrentLockedResultPage(): boolean {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1] as WechatMiniprogram.Page.Instance<Record<string, unknown>, Record<string, unknown>> & { options?: Record<string, string> };
  return !!current && current.route === 'pages/result/result' && current.options && current.options.mode === 'locked';
}

App<IAppOption>({
  globalData: {
    nickname: '',
    selections: {},
    partnerShareData: null,
  },

  onLaunch(options: WechatMiniprogram.App.LaunchShowOption) {
    try {
      initCloud();
    } catch (e) {
      console.warn('云开发初始化失败', e);
    }

    const storedNickname = wx.getStorageSync('nickname');
    if (storedNickname) {
      this.globalData.nickname = storedNickname;
    }
    this.handleShareEntry(options);
  },

  onShow(options: WechatMiniprogram.App.LaunchShowOption) {
    this.handleShareEntry(options);
  },

  handleShareEntry(options: WechatMiniprogram.App.LaunchShowOption) {
    const query = options.query || {};

    if (query.data) {
      const shareData = decodeShareData(query.data as string);
      if (shareData) {
        this.globalData.partnerShareData = shareData;
        this.globalData.selections = {};
        wx.removeStorageSync('selections');
        wx.reLaunch({ url: '/pages/welcome/welcome' });
        return;
      }
    }

    if (this.globalData.partnerShareData) return;

    const locked = this.getLockedState();
    if (locked) {
      if (!isCurrentLockedResultPage()) {
        wx.reLaunch({ url: '/pages/result/result?mode=locked' });
      }
      return;
    }
    this.restoreCloudLockedState();
  },

  getLockedState(): LockedState | null {
    try {
      const stored = wx.getStorageSync('lockedState');
      if (!stored) return null;
      const today = this.getDateString();
      if (stored.date !== today) {
        wx.removeStorageSync('lockedState');
        return null;
      }
      if (!validateShareData(stored.shareData)) {
        wx.removeStorageSync('lockedState');
        return null;
      }
      return stored;
    } catch {
      return null;
    }
  },

  async saveLockedState(shareData: ShareData) {
    const date = this.getDateString();
    wx.setStorageSync('lockedState', { locked: true, date, shareData });
    try {
      await saveLockedPlan(date, shareData);
    } catch (e) {
      console.warn('同步今日锁定计划失败，已保留本机锁定状态', e);
    }
  },

  async clearLockedState() {
    const date = this.getDateString();
    wx.removeStorageSync('lockedState');
    try {
      await clearLockedPlan(date);
    } catch (e) {
      console.warn('清理云端今日锁定计划失败', e);
    }
  },

  async restoreCloudLockedState() {
    if (cloudLockedChecking) return;
    cloudLockedChecking = true;
    try {
      const lockedPlan = await getLockedPlan(this.getDateString());
      if (!lockedPlan || this.globalData.partnerShareData) return;
      wx.setStorageSync('lockedState', { locked: true, date: lockedPlan.date, shareData: lockedPlan.shareData });
      if (!isCurrentLockedResultPage()) {
        wx.reLaunch({ url: '/pages/result/result?mode=locked' });
      }
    } finally {
      cloudLockedChecking = false;
    }
  },

  getDateString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  saveSelections() {
    wx.setStorageSync('selections', this.globalData.selections);
  },
});
