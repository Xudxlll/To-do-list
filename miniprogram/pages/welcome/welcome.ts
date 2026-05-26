import { INTRO_PHOTOS } from '../../data/introPhotos';
import { ShareData } from '../../data/categories';

const app = getApp<{
  globalData: {
    partnerShareData: ShareData | null;
  };
}>();

Component({
  data: {
    photos: INTRO_PHOTOS,
    photoFallbacks: {} as Record<number, boolean>,
    hasPartnerShare: false,
  },

  lifetimes: {
    attached() {
      this.refreshEntryMode();
    },
  },

  pageLifetimes: {
    show() {
      this.refreshEntryMode();
    },
  },

  methods: {
    refreshEntryMode() {
      this.setData({ hasPartnerShare: !!app.globalData.partnerShareData });
    },

    onPhotoError(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number;
      this.setData({ [`photoFallbacks.${index}`]: true });
    },

    goFreeWrite() {
      wx.navigateTo({ url: '/pages/free-write/free-write' });
    },

    goPickPlan() {
      wx.navigateTo({ url: '/pages/index/index' });
    },

    viewPartnerChoice() {
      wx.navigateTo({ url: '/pages/result/result' });
    },
  },
});
