import { listDiaryDatesByMonth } from '../../services/diaries';
import { CalendarDay } from '../../types/diary';
import { buildCalendarDays, canShiftDiaryMonth, formatMonthTitle, isSupportedDiaryDate, isSupportedDiaryMonth, monthKey, shiftMonth, todayString } from '../../utils/date';

let monthLoadSeq = 0;

function buildMonthState(currentMonthDate: string) {
  return {
    currentMonthDate,
    currentMonthLabel: monthKey(currentMonthDate),
    currentMonthTitle: formatMonthTitle(currentMonthDate),
    canPrevMonth: canShiftDiaryMonth(currentMonthDate, -1),
    canNextMonth: canShiftDiaryMonth(currentMonthDate, 1),
  };
}

Component({
  data: {
    currentMonthDate: `${monthKey(todayString())}-01`,
    currentMonthLabel: monthKey(todayString()),
    currentMonthTitle: formatMonthTitle(todayString()),
    canPrevMonth: canShiftDiaryMonth(`${monthKey(todayString())}-01`, -1),
    canNextMonth: canShiftDiaryMonth(`${monthKey(todayString())}-01`, 1),
    days: [] as CalendarDay[],
    loading: true,
    loadError: false,
    weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  },

  methods: {
    onLoad(options: Record<string, string>) {
      const month = options.month as string;
      if (month) {
        const currentMonthDate = `${isSupportedDiaryMonth(month) ? month : monthKey(todayString())}-01`;
        this.setData(buildMonthState(currentMonthDate));
      }
      this.loadMonth();
    },

    async loadMonth() {
      const requestSeq = monthLoadSeq + 1;
      monthLoadSeq = requestSeq;
      const requestMonthDate = this.data.currentMonthDate;
      this.setData({ loading: true, loadError: false });
      try {
        const dates = await listDiaryDatesByMonth(monthKey(requestMonthDate));
        if (requestSeq !== monthLoadSeq) return;
        this.setData({
          days: buildCalendarDays(requestMonthDate, dates),
          loading: false,
        });
      } catch (e) {
        if (requestSeq !== monthLoadSeq) return;
        console.warn('加载月历失败', e);
        this.setData({ loading: false, loadError: true });
      }
    },

    prevMonth() {
      if (!this.data.canPrevMonth) return;
      const currentMonthDate = shiftMonth(this.data.currentMonthDate, -1);
      this.setData(buildMonthState(currentMonthDate));
      this.loadMonth();
    },

    nextMonth() {
      if (!this.data.canNextMonth) return;
      const currentMonthDate = shiftMonth(this.data.currentMonthDate, 1);
      this.setData(buildMonthState(currentMonthDate));
      this.loadMonth();
    },

    onDayTap(e: WechatMiniprogram.TouchEvent) {
      const date = e.currentTarget.dataset.date as string;
      const future = e.currentTarget.dataset.future as boolean;
      if (future) {
        wx.showToast({ title: '未来日期还不能写哦', icon: 'none' });
        return;
      }
      if (!isSupportedDiaryDate(date)) {
        wx.showToast({ title: '这个日期暂不支持写日记', icon: 'none' });
        return;
      }
      wx.navigateTo({ url: `/pages/diary-edit/diary-edit?date=${date}` });
    },
  },
});
