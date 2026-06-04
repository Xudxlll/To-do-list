import { listDiaryDatesByMonth } from '../../services/diaries';
import { CalendarDay } from '../../types/diary';
import { buildCalendarDays, monthKey, shiftMonth, todayString } from '../../utils/date';

Component({
  data: {
    currentMonthDate: `${monthKey(todayString())}-01`,
    currentMonthLabel: monthKey(todayString()),
    days: [] as CalendarDay[],
    loading: true,
    loadError: false,
    weekLabels: ['一', '二', '三', '四', '五', '六', '日'],
  },

  lifetimes: {
    attached() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      const opts = (page as { options?: Record<string, string> }).options || {};
      const month = opts.month as string;
      if (month) {
        this.setData({ currentMonthDate: `${month}-01`, currentMonthLabel: month });
      }
      this.loadMonth();
    },
  },

  methods: {
    async loadMonth() {
      this.setData({ loading: true, loadError: false });
      try {
        const dates = await listDiaryDatesByMonth(monthKey(this.data.currentMonthDate));
        this.setData({
          days: buildCalendarDays(this.data.currentMonthDate, dates),
          loading: false,
        });
      } catch (e) {
        console.warn('加载月历失败', e);
        this.setData({ loading: false, loadError: true });
      }
    },

    prevMonth() {
      const currentMonthDate = shiftMonth(this.data.currentMonthDate, -1);
      this.setData({ currentMonthDate, currentMonthLabel: monthKey(currentMonthDate) });
      this.loadMonth();
    },

    nextMonth() {
      const currentMonthDate = shiftMonth(this.data.currentMonthDate, 1);
      this.setData({ currentMonthDate, currentMonthLabel: monthKey(currentMonthDate) });
      this.loadMonth();
    },

    onDayTap(e: WechatMiniprogram.TouchEvent) {
      const date = e.currentTarget.dataset.date as string;
      const future = e.currentTarget.dataset.future as boolean;
      if (future) {
        wx.showToast({ title: '未来日期还不能写哦', icon: 'none' });
        return;
      }
      wx.navigateTo({ url: `/pages/diary-edit/diary-edit?date=${date}` });
    },
  },
});
