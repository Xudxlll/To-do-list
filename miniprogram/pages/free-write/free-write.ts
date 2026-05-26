import { encodeShareData, ShareData } from '../../data/categories';

const MAX_LENGTH = 120;

const app = getApp<{
  globalData: {
    nickname: string;
  };
}>();

Component({
  data: {
    inputValue: '',
    textLength: 0,
    maxLength: MAX_LENGTH,
    canShare: false,
  },

  methods: {
    onTextInput(e: WechatMiniprogram.Input) {
      const value = e.detail.value;
      const trimmed = value.trim();
      this.setData({
        inputValue: value,
        textLength: value.length,
        canShare: trimmed.length > 0,
      });
    },

    onShareAppMessage() {
      const freeText = this.data.inputValue.trim();
      if (!freeText) {
        return {
          title: '今天随性过',
          path: '/pages/free-write/free-write',
        };
      }

      const shareData: ShareData = {
        fromUser: app.globalData.nickname || '我',
        selections: [],
        timestamp: Date.now(),
        mode: 'freeText',
        freeText,
      };

      return {
        title: `${app.globalData.nickname || '我'} 发来一句今日安排 💌`,
        path: `/pages/welcome/welcome?data=${encodeShareData(shareData)}`,
      };
    },
  },
});
