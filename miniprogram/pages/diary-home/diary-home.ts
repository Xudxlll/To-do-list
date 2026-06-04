import { listDiaryDatesByMonth, listRecentDiaries } from '../../services/diaries';
import { DiaryRecord, DiaryTimelineItem, MOODS } from '../../types/diary';
import { monthKey, todayString } from '../../utils/date';

function buildTimelineItem(record: DiaryRecord): DiaryTimelineItem {
  const mood = MOODS.find(item => item.id === record.mood) || MOODS[0];
  return {
    ...record,
    summary: record.content.length > 42 ? `${record.content.slice(0, 42)}...` : record.content,
    coverFileId: record.photoFileIds[0] || '',
    moodEmoji: mood.emoji,
    moodLabel: mood.label,
  };
}

Component({
  data: {
    loading: true,
    loadError: false,
    today: todayString(),
    currentMonth: monthKey(todayString()),
    monthDiaryCount: 0,
    timeline: [] as DiaryTimelineItem[],
  },

  lifetimes: {
    attached() {
      this.loadDiaries();
    },
  },

  pageLifetimes: {
    show() {
      this.loadDiaries();
    },
  },

  methods: {
    async loadDiaries() {
      this.setData({ loading: true, loadError: false });
      try {
        const [records, dates] = await Promise.all([
          listRecentDiaries(30),
          listDiaryDatesByMonth(this.data.currentMonth),
        ]);
        this.setData({
          timeline: records.map(buildTimelineItem),
          monthDiaryCount: dates.length,
          loading: false,
        });
      } catch (e) {
        console.warn('加载日记失败', e);
        this.setData({ loading: false, loadError: true });
      }
    },

    goCalendar() {
      wx.navigateTo({ url: `/pages/diary-calendar/diary-calendar?month=${this.data.currentMonth}` });
    },

    goToday() {
      wx.navigateTo({ url: `/pages/diary-edit/diary-edit?date=${this.data.today}` });
    },

    openDiary(e: WechatMiniprogram.TouchEvent) {
      const date = e.currentTarget.dataset.date as string;
      wx.navigateTo({ url: `/pages/diary-edit/diary-edit?date=${date}` });
    },
  },
});
