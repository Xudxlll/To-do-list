import {
  CATEGORIES,
  hydrateSharedOption,
  Option,
  SharedOptionSnapshot,
  ShareData,
  validateShareData,
} from '../../data/categories';
import { getLockedPlan } from '../../services/lockedPlans';

interface PartnerCategoryItem {
  categoryId: string;
  categoryName: string;
  icon: string;
  options: SharedOptionSnapshot[];
}

const app = getApp<{
  globalData: {
    nickname: string;
    selections: Record<string, Option[]>;
    partnerShareData: ShareData | null;
  };
  saveSelections(): void;
  saveLockedState(data: ShareData): Promise<void>;
  clearLockedState(): Promise<void>;
  getDateString(): string;
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
    async attached() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      const opts = (page as any).options || {};
      const mode = opts.mode as string;

      if (mode === 'locked') {
        this.showLocked();
      } else {
        await this.showPartnerView();
      }
    },
  },

  methods: {
    showLockedShareData(sd: ShareData) {
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

    showLocked() {
      const locked = wx.getStorageSync('lockedState');
      if (!locked || !validateShareData(locked.shareData)) {
        wx.removeStorageSync('lockedState');
        wx.reLaunch({ url: '/pages/welcome/welcome' });
        return;
      }
      const sd = locked.shareData as ShareData;
      this.showLockedShareData(sd);
    },

    async showPartnerView() {
      const lockedPlan = await getLockedPlan(app.getDateString());
      if (lockedPlan) {
        wx.setStorageSync('lockedState', {
          locked: true,
          date: lockedPlan.date,
          shareData: lockedPlan.shareData,
        });
        this.showLockedShareData(lockedPlan.shareData);
        return;
      }

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
          sel[s.categoryId] = s.options.map(option => hydrateSharedOption(s.categoryId, option));
        });
        g.selections = sel;
        app.saveSelections();
      }
      wx.navigateTo({ url: '/pages/index/index?returnTo=partnerWelcome' });
    },

    async onPerfect() {
      const g = app.globalData;
      const shareData = g.partnerShareData || this.data.lockedShareData;
      if (!shareData) return;

      await app.saveLockedState(shareData);

      wx.showToast({ title: '今日计划已定！🎉', icon: 'none', duration: 1500 });
      setTimeout(() => {
        this.setData({
          isLocked: true,
          navTitle: '今日已定 🔒',
          summaryTitle: '今天的计划已确定！',
        });
      }, 1500);
    },

    async onReset() {
      await app.clearLockedState();
      const g = app.globalData;
      g.selections = {};
      g.partnerShareData = null;
      wx.removeStorageSync('selections');
      wx.reLaunch({ url: '/pages/welcome/welcome' });
    },
  },
});
