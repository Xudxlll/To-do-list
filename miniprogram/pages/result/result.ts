import { CATEGORIES, ShareData, Option } from '../../data/categories';

interface PartnerCategoryItem {
  categoryId: string;
  categoryName: string;
  icon: string;
  options: Option[];
}

const app = getApp<{
  globalData: {
    nickname: string;
    selections: Record<string, Option[]>;
    partnerShareData: ShareData | null;
  };
  saveSelections(): void;
  saveLockedState(data: ShareData): void;
  clearLockedState(): void;
}>();

Component({
  data: {
    isLocked: false,
    isFreeText: false,
    fromUser: '',
    freeText: '',
    navTitle: '收到选择',
    summaryTitle: '',
    partnerSelections: [] as PartnerCategoryItem[],
    lockedShareData: null as ShareData | null,
  },

  lifetimes: {
    attached() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      const opts = (page as any).options || {};
      const mode = opts.mode as string;

      if (mode === 'locked') {
        this.showLocked();
      } else {
        this.showPartnerView();
      }
    },
  },

  methods: {
    showLocked() {
      const locked = wx.getStorageSync('lockedState');
      if (!locked || !locked.shareData) {
        wx.reLaunch({ url: '/pages/welcome/welcome' });
        return;
      }
      const sd = locked.shareData as ShareData;
      this.setData({
        isLocked: true,
        isFreeText: sd.mode === 'freeText',
        fromUser: sd.fromUser,
        freeText: sd.freeText || '',
        navTitle: '今日已定 🔒',
        summaryTitle: '今天的计划已确定！',
        partnerSelections: this.buildPartnerSelections(sd),
        lockedShareData: sd,
      });
    },

    showPartnerView() {
      const g = app.globalData;
      const shareData = g.partnerShareData;
      if (!shareData) {
        wx.reLaunch({ url: '/pages/welcome/welcome' });
        return;
      }
      this.setData({
        isLocked: false,
        isFreeText: shareData.mode === 'freeText',
        fromUser: shareData.fromUser,
        freeText: shareData.freeText || '',
        navTitle: shareData.mode === 'freeText' ? '收到安排' : '收到选择',
        summaryTitle: shareData.mode === 'freeText' ? `${shareData.fromUser} 的今日随性安排` : '一二&布布的选择',
        partnerSelections: this.buildPartnerSelections(shareData),
        lockedShareData: shareData,
      });
    },

    buildPartnerSelections(sd: ShareData): PartnerCategoryItem[] {
      return sd.selections.map(sel => {
        const cat = CATEGORIES.find(c => c.id === sel.categoryId);
        return {
          categoryId: sel.categoryId,
          categoryName: sel.categoryName,
          icon: cat ? cat.icon : '📌',
          options: sel.options,
        };
      });
    },

    onEdit() {
      const g = app.globalData;
      if (g.partnerShareData && g.partnerShareData.mode !== 'freeText') {
        const sel: Record<string, Option[]> = {};
        g.partnerShareData.selections.forEach(s => {
          sel[s.categoryId] = s.options.map(o => ({ ...o }));
        });
        g.selections = sel;
        app.saveSelections();
      }
      wx.reLaunch({ url: '/pages/index/index' });
    },

    onPerfect() {
      const g = app.globalData;
      const shareData = g.partnerShareData || this.data.lockedShareData;
      if (!shareData) return;

      app.saveLockedState(shareData);

      wx.showToast({ title: '今日计划已定！🎉', icon: 'none', duration: 1500 });
      setTimeout(() => {
        this.setData({
          isLocked: true,
          navTitle: '今日已定 🔒',
          summaryTitle: '今天的计划已确定！',
        });
      }, 1500);
    },

    onReset() {
      app.clearLockedState();
      const g = app.globalData;
      g.selections = {};
      g.partnerShareData = null;
      wx.removeStorageSync('selections');
      wx.reLaunch({ url: '/pages/welcome/welcome' });
    },
  },
});
