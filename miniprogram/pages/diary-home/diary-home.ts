import { listDiaryDatesByMonth, listRecentDiaries, resolveDiaryPhotoUrls } from '../../services/diaries';
import { DiaryRecord, DiaryTimelineItem, MOODS } from '../../types/diary';
import { monthKey, todayString } from '../../utils/date';
import { normalizeMoodIds } from '../../utils/diaryMoods';

function normalizeRecordMoods(record: DiaryRecord) {
  const ids = normalizeMoodIds(record.moods, record.mood);
  return ids
    .map(id => MOODS.find(item => item.id === id))
    .filter((item): item is typeof MOODS[number] => !!item);
}

function buildTimelineItem(record: DiaryRecord): DiaryTimelineItem {
  const moods = normalizeRecordMoods(record);
  return {
    ...record,
    summary: record.content.length > 42 ? `${record.content.slice(0, 42)}...` : record.content,
    coverFileId: record.photoFileIds[0] || '',
    coverUrl: record.photoFileIds[0] || '',
    moodEmoji: moods.map(item => item.emoji).join(''),
    moodLabel: moods.map(item => item.label).join('、'),
  };
}

async function buildTimelineItems(records: DiaryRecord[]): Promise<DiaryTimelineItem[]> {
  const timeline = records.map(buildTimelineItem);
  const coverUrls = await resolveDiaryPhotoUrls(timeline.map(item => item.coverFileId));
  return timeline.map((item, index) => ({
    ...item,
    coverUrl: coverUrls[index] || item.coverFileId,
  }));
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
        const timeline = await buildTimelineItems(records);
        this.setData({
          timeline,
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
