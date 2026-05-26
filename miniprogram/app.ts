import { Option, ShareData, decodeShareData } from './data/categories';

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
  saveSelections(): void;
}

App<IAppOption>({
  globalData: {
    nickname: '',
    selections: {},
    partnerShareData: null,
  },

  onLaunch(options: WechatMiniprogram.App.LaunchShowOption) {
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
        wx.reLaunch({ url: '/pages/result/result' });
        return;
      }
    }

    const locked = this.getLockedState();
    if (locked) {
      wx.reLaunch({ url: '/pages/result/result?mode=locked' });
    }
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
      return stored;
    } catch {
      return null;
    }
  },

  saveLockedState(shareData: ShareData) {
    wx.setStorageSync('lockedState', { locked: true, date: this.getDateString(), shareData });
  },

  clearLockedState() {
    wx.removeStorageSync('lockedState');
  },

  getDateString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  saveSelections() {
    wx.setStorageSync('selections', this.globalData.selections);
  },
});
