# Couple Diary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent “我们的日记” feature where the two experience-version users can keep one shared cloud diary per day, with local drafts, mood, manual location, up to three photos, and confirmed auto tags that feed back into “今天干什么”.

**Architecture:** Keep the existing static `CATEGORIES` as the preset source of truth, add cloud-backed `diaries` and `custom_options` services, and merge cloud custom options into category data at page load. Add three diary pages (`diary-home`, `diary-calendar`, `diary-edit`) and a welcome-page entry card, while leaving today-selection state separate from diary records.

**Tech Stack:** WeChat Mini Program TypeScript, Skyline renderer, Glass-Easel components, `wx.cloud` database/storage, `wx.setStorageSync` drafts, `npx --no-install tsc --noEmit` for compile verification, WeChat DevTools for cloud/manual flow verification.

---

## Scope Notes

This plan implements the design in `docs/superpowers/specs/2026-06-03-couple-diary-design.md`.

The plan deliberately does not add login binding, OpenID whitelist, diary deletion, AI tagging, conflict detection, map location picking, comments, likes, or generated diary content from `Perfect!`.

Cloud environment setup has one non-code prerequisite: in WeChat DevTools, enable Cloud Development for this app and create the `diaries` and `custom_options` collections. The code initializes the default cloud environment with `wx.cloud.init({ traceUser: true })`; if the project later has multiple cloud environments, change only `miniprogram/config/cloud.ts`.

## File Structure

- Create `miniprogram/config/cloud.ts`: cloud initialization and collection names.
- Create `miniprogram/types/diary.ts`: diary, draft, tag, mood, calendar, custom option types.
- Create `miniprogram/utils/date.ts`: date formatting, month math, future-date guard, calendar grid helpers.
- Create `miniprogram/utils/categoryOptions.ts`: clone static categories and merge cloud custom options into each category’s `other` group.
- Create `miniprogram/utils/diaryDraft.ts`: local draft keying, read/write/clear helpers.
- Create `miniprogram/utils/diaryTags.ts`: local tag recognition, normalization, and tag confirmation data mapping.
- Create `miniprogram/services/customOptions.ts`: cloud read/upsert for custom options, with graceful fallback.
- Create `miniprogram/services/diaries.ts`: cloud list/get/save diary, upload photos, monthly date lookups.
- Create `miniprogram/pages/diary-home/*`: timeline + month overview.
- Create `miniprogram/pages/diary-calendar/*`: full month calendar and past-date creation.
- Create `miniprogram/pages/diary-edit/*`: create/edit form, draft restore, photo pick/upload, tag confirmation overlay.
- Modify `miniprogram/app.ts`: initialize cloud once and expose existing app methods unchanged.
- Modify `miniprogram/app.json`: register diary pages.
- Modify `miniprogram/pages/welcome/welcome.ts|wxml|wxss`: add right-top diary entry card.
- Modify `miniprogram/pages/index/index.ts`: load merged categories with cloud custom options while preserving share hydration behavior.
- Create `docs/cloud-diary-setup.md`: manual cloud collection/index/permission checklist.

---

### Task 1: Cloud Bootstrap And Shared Types

**Files:**
- Create: `miniprogram/config/cloud.ts`
- Create: `miniprogram/types/diary.ts`
- Modify: `miniprogram/app.ts`
- Test: `npx --no-install tsc --noEmit`

- [ ] **Step 1: Create cloud config**

Create `miniprogram/config/cloud.ts`:

```ts
export const CLOUD_COLLECTIONS = {
  diaries: 'diaries',
  customOptions: 'custom_options',
};

let cloudReady = false;

export function initCloud(): void {
  if (cloudReady) return;
  if (!wx.cloud) {
    throw new Error('当前基础库不支持 wx.cloud，请在微信开发者工具中启用云开发。');
  }
  wx.cloud.init({ traceUser: true });
  cloudReady = true;
}

export function getCloudDb(): WechatMiniprogram.DB.Database {
  initCloud();
  return wx.cloud.database();
}
```

- [ ] **Step 2: Create diary type definitions**

Create `miniprogram/types/diary.ts`:

```ts
export type MoodId = 'happy' | 'calm' | 'tired' | 'sad' | 'surprised';

export interface MoodOption {
  id: MoodId;
  emoji: string;
  label: string;
}

export const MOODS: MoodOption[] = [
  { id: 'happy', emoji: '😊', label: '开心' },
  { id: 'calm', emoji: '😌', label: '平静' },
  { id: 'tired', emoji: '🥱', label: '疲惫' },
  { id: 'sad', emoji: '😔', label: '难过' },
  { id: 'surprised', emoji: '✨', label: '惊喜' },
];

export interface DiaryTag {
  categoryId: string;
  optionId: string;
  name: string;
  isCustom: boolean;
}

export interface DiaryRecord {
  _id?: string;
  date: string;
  content: string;
  mood: MoodId;
  location: string;
  photoFileIds: string[];
  tags: DiaryTag[];
  createdAt: number;
  updatedAt: number;
}

export interface DiaryDraft {
  date: string;
  content: string;
  mood: MoodId;
  location: string;
  localPhotoPaths: string[];
  existingPhotoFileIds: string[];
  updatedAt: number;
}

export interface CustomOptionRecord {
  _id?: string;
  categoryId: string;
  name: string;
  normalizedName: string;
  createdAt: number;
}

export interface DiaryTimelineItem extends DiaryRecord {
  summary: string;
  coverFileId: string;
  moodEmoji: string;
  moodLabel: string;
}

export interface CalendarDay {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  hasDiary: boolean;
}

export interface RecognizedTag extends DiaryTag {
  source: 'preset' | 'custom' | 'candidate';
  categoryName: string;
  editable: boolean;
}
```

- [ ] **Step 3: Initialize cloud in app launch**

Modify `miniprogram/app.ts` imports:

```ts
import { Option, ShareData, decodeShareData } from './data/categories';
import { initCloud } from './config/cloud';
```

Modify `onLaunch` so the first statement initializes cloud:

```ts
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
```

- [ ] **Step 4: Verify TypeScript compilation**

Run:

```bash
npx --no-install tsc --noEmit
```

Expected: exit code `0`.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/config/cloud.ts miniprogram/types/diary.ts miniprogram/app.ts
git commit -m "feat: add diary cloud bootstrap types"
```

---

### Task 2: Date Utilities And Cloud Custom Option Merge

**Files:**
- Create: `miniprogram/utils/date.ts`
- Create: `miniprogram/utils/categoryOptions.ts`
- Create: `miniprogram/services/customOptions.ts`
- Modify: `miniprogram/pages/index/index.ts`
- Test: `npx --no-install tsc --noEmit`

- [ ] **Step 1: Create date helpers**

Create `miniprogram/utils/date.ts`:

```ts
import { CalendarDay } from '../types/diary';

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayString(): string {
  return formatDate(new Date());
}

export function parseDate(date: string): Date {
  const parts = date.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function isFutureDate(date: string): boolean {
  return parseDate(date).getTime() > parseDate(todayString()).getTime();
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonth(date: string, delta: number): string {
  const d = parseDate(`${monthKey(date)}-01`);
  d.setMonth(d.getMonth() + delta);
  return formatDate(d);
}

export function buildCalendarDays(monthDate: string, diaryDates: string[]): CalendarDay[] {
  const first = parseDate(`${monthKey(monthDate)}-01`);
  const year = first.getFullYear();
  const month = first.getMonth();
  const firstDay = first.getDay() === 0 ? 7 : first.getDay();
  const start = new Date(year, month, 2 - firstDay);
  const diarySet = diaryDates.reduce((acc, date) => {
    acc[date] = true;
    return acc;
  }, {} as Record<string, boolean>);
  const today = todayString();

  return Array.from({ length: 42 }).map((_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    const date = formatDate(d);
    return {
      date,
      day: d.getDate(),
      inCurrentMonth: d.getMonth() === month,
      isToday: date === today,
      isFuture: isFutureDate(date),
      hasDiary: !!diarySet[date],
    };
  });
}
```

- [ ] **Step 2: Create category merge helper**

Create `miniprogram/utils/categoryOptions.ts`:

```ts
import { Category, CATEGORIES, Option, OptionGroup } from '../data/categories';
import { CustomOptionRecord } from '../types/diary';

const OTHER_GROUP_ID = 'other';
const OTHER_GROUP_TITLE = '其他';

function cloneOption(option: Option): Option {
  return { ...option };
}

function cloneGroup(group: OptionGroup): OptionGroup {
  return { ...group, options: group.options.map(cloneOption) };
}

export function normalizeOptionName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

export function buildCustomOptionId(categoryId: string, normalizedName: string): string {
  return `cloud_${categoryId}_${normalizedName}`;
}

export function clonePresetCategories(): Category[] {
  return CATEGORIES.map(cat => {
    const optionGroups = cat.optionGroups.map(cloneGroup);
    return {
      ...cat,
      optionGroups,
      options: optionGroups.reduce((all, group) => all.concat(group.options), [] as Option[]),
    };
  });
}

export function mergeCustomOptions(customOptions: CustomOptionRecord[]): Category[] {
  const categories = clonePresetCategories();
  customOptions.forEach(record => {
    const cat = categories.find(item => item.id === record.categoryId);
    if (!cat) return;

    let group = cat.optionGroups.find(item => item.id === OTHER_GROUP_ID);
    if (!group) {
      group = { id: OTHER_GROUP_ID, title: OTHER_GROUP_TITLE, options: [] };
      cat.optionGroups.push(group);
    }

    const exists = group.options.some(item => normalizeOptionName(item.name) === record.normalizedName);
    if (exists) return;

    const option: Option = {
      id: buildCustomOptionId(record.categoryId, record.normalizedName),
      name: record.name,
      emoji: '',
      isCustom: false,
    };
    group.options.push(option);
    cat.options.push(option);
  });
  return categories;
}
```

- [ ] **Step 3: Create custom option cloud service**

Create `miniprogram/services/customOptions.ts`:

```ts
import { CLOUD_COLLECTIONS, getCloudDb } from '../config/cloud';
import { CustomOptionRecord } from '../types/diary';
import { normalizeOptionName } from '../utils/categoryOptions';

export async function listCustomOptions(): Promise<CustomOptionRecord[]> {
  try {
    const db = getCloudDb();
    const res = await db.collection(CLOUD_COLLECTIONS.customOptions).limit(200).get();
    return (res.data || []) as CustomOptionRecord[];
  } catch (e) {
    console.warn('加载共享新标签失败', e);
    return [];
  }
}

export async function upsertCustomOptions(records: Array<{ categoryId: string; name: string }>): Promise<CustomOptionRecord[]> {
  const db = getCloudDb();
  const collection = db.collection(CLOUD_COLLECTIONS.customOptions);
  const saved: CustomOptionRecord[] = [];

  for (const input of records) {
    const name = input.name.trim();
    if (!name) continue;
    const normalizedName = normalizeOptionName(name);
    const existed = await collection
      .where({ categoryId: input.categoryId, normalizedName })
      .limit(1)
      .get();

    if (existed.data.length > 0) {
      saved.push(existed.data[0] as CustomOptionRecord);
      continue;
    }

    const record: CustomOptionRecord = {
      categoryId: input.categoryId,
      name,
      normalizedName,
      createdAt: Date.now(),
    };
    const addRes = await collection.add({ data: record });
    saved.push({ ...record, _id: addRes._id });
  }

  return saved;
}
```

- [ ] **Step 4: Update index page to use merged categories**

In `miniprogram/pages/index/index.ts`, replace the import:

```ts
import { Option, OptionGroup, encodeShareData, ShareData, Category } from '../../data/categories';
import { mergeCustomOptions } from '../../utils/categoryOptions';
import { listCustomOptions } from '../../services/customOptions';
```

Update initial data to type `Category[]`:

```ts
const INITIAL_CATEGORIES = mergeCustomOptions([]);
```

Replace `categories: CATEGORIES` and all initial references to `CATEGORIES[0]` with `INITIAL_CATEGORIES[0]`:

```ts
categories: INITIAL_CATEGORIES,
currentCategoryId: INITIAL_CATEGORIES[0].id,
currentCategory: INITIAL_CATEGORIES[0],
currentOptions: INITIAL_CATEGORIES[0].options.map(o => ({ ...o })),
currentOptionGroups: INITIAL_CATEGORIES[0].optionGroups.map(group => ({
  ...group,
  options: group.options.map(o => ({ ...o })),
})) as OptionGroup[],
```

Add this method:

```ts
async loadCustomCategoryOptions() {
  const customOptions = await listCustomOptions();
  const categories = mergeCustomOptions(customOptions);
  const currentCategory = categories.find(cat => cat.id === this.data.currentCategoryId) || categories[0];
  this.setData({
    categories,
    currentCategoryId: currentCategory.id,
    currentCategory,
    currentOptions: currentCategory.options.map(o => ({ ...o })),
    currentOptionGroups: currentCategory.optionGroups.map(group => ({
      ...group,
      options: group.options.map(o => ({ ...o })),
    })),
  });
  this.refreshSelectionState();
},
```

Call it in `ready()` after `refreshSelectionState()`:

```ts
ready() {
  this.refreshSelectionState();
  this.loadCustomCategoryOptions();
},
```

Inside `selectCategory`, replace `CATEGORIES.find` with:

```ts
const cat = (this.data.categories as Category[]).find(c => c.id === catId);
```

Inside `onShareAppMessage`, replace `CATEGORIES.find` with:

```ts
const cat = (this.data.categories as Category[]).find(c => c.id === catId);
```

- [ ] **Step 5: Verify compilation**

Run:

```bash
npx --no-install tsc --noEmit
```

Expected: exit code `0`.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/utils/date.ts miniprogram/utils/categoryOptions.ts miniprogram/services/customOptions.ts miniprogram/pages/index/index.ts
git commit -m "feat: merge shared custom diary tags"
```

---

### Task 3: Diary Drafts, Tag Recognition, And Diary Cloud Service

**Files:**
- Create: `miniprogram/utils/diaryDraft.ts`
- Create: `miniprogram/utils/diaryTags.ts`
- Create: `miniprogram/services/diaries.ts`
- Test: `npx --no-install tsc --noEmit`

- [ ] **Step 1: Create draft helpers**

Create `miniprogram/utils/diaryDraft.ts`:

```ts
import { DiaryDraft } from '../types/diary';

export function diaryDraftKey(date: string): string {
  return `diaryDraft:${date}`;
}

export function readDiaryDraft(date: string): DiaryDraft | null {
  try {
    return wx.getStorageSync(diaryDraftKey(date)) || null;
  } catch {
    return null;
  }
}

export function saveDiaryDraft(draft: DiaryDraft): void {
  wx.setStorageSync(diaryDraftKey(draft.date), { ...draft, updatedAt: Date.now() });
}

export function clearDiaryDraft(date: string): void {
  wx.removeStorageSync(diaryDraftKey(date));
}
```

- [ ] **Step 2: Create local tag recognition**

Create `miniprogram/utils/diaryTags.ts`:

```ts
import { Category, Option } from '../data/categories';
import { RecognizedTag } from '../types/diary';
import { buildCustomOptionId, normalizeOptionName } from './categoryOptions';

interface CategoryRule {
  categoryId: string;
  verbs: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  { categoryId: 'eat', verbs: ['吃', '煮', '做饭', '外卖', '火锅', '烧烤'] },
  { categoryId: 'drink', verbs: ['喝', '奶茶', '咖啡', '微醺'] },
  { categoryId: 'play', verbs: ['玩', '体验', '手作', '密室', '剧本杀'] },
  { categoryId: 'goout', verbs: ['去', '逛', '散步', '看海', '公园', '商场'] },
  { categoryId: 'watch', verbs: ['看', '电影', '追剧', '演出', '展'] },
  { categoryId: 'sport', verbs: ['运动', '跑步', '骑行', '游泳', '爬山'] },
  { categoryId: 'home', verbs: ['宅', '收拾', '整理', '睡', '休息'] },
];

function optionToTag(category: Category, option: Option, source: 'preset' | 'custom'): RecognizedTag {
  return {
    categoryId: category.id,
    optionId: option.id,
    name: option.name,
    isCustom: source === 'custom',
    source,
    categoryName: category.name,
    editable: false,
  };
}

function dedupeTags(tags: RecognizedTag[]): RecognizedTag[] {
  const seen: Record<string, boolean> = {};
  return tags.filter(tag => {
    const key = `${tag.categoryId}:${normalizeOptionName(tag.name)}`;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function extractCandidateName(content: string, verb: string): string {
  const index = content.indexOf(verb);
  if (index < 0) return '';
  const tail = content.slice(index + verb.length).replace(/[，。！？、,.!?]/g, ' ');
  const token = tail.trim().split(/\s+/)[0] || '';
  return token.replace(/^(了|一个|一次|一下|去|到)/, '').slice(0, 12);
}

export function recognizeDiaryTags(content: string, categories: Category[]): RecognizedTag[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const tags: RecognizedTag[] = [];
  categories.forEach(category => {
    category.options.forEach(option => {
      if (option.name && trimmed.indexOf(option.name) >= 0) {
        tags.push(optionToTag(category, option, option.id.indexOf('cloud_') === 0 ? 'custom' : 'preset'));
      }
    });
  });

  CATEGORY_RULES.forEach(rule => {
    const category = categories.find(item => item.id === rule.categoryId);
    if (!category) return;
    rule.verbs.forEach(verb => {
      if (trimmed.indexOf(verb) < 0) return;
      const candidateName = extractCandidateName(trimmed, verb);
      if (!candidateName) return;
      const normalizedName = normalizeOptionName(candidateName);
      const exists = category.options.some(option => normalizeOptionName(option.name) === normalizedName);
      if (exists) return;
      tags.push({
        categoryId: category.id,
        optionId: buildCustomOptionId(category.id, normalizedName),
        name: candidateName,
        isCustom: true,
        source: 'candidate',
        categoryName: category.name,
        editable: true,
      });
    });
  });

  return dedupeTags(tags);
}
```

- [ ] **Step 3: Create diary cloud service**

Create `miniprogram/services/diaries.ts`:

```ts
import { CLOUD_COLLECTIONS, getCloudDb } from '../config/cloud';
import { DiaryRecord } from '../types/diary';

export async function listRecentDiaries(limit = 30): Promise<DiaryRecord[]> {
  const db = getCloudDb();
  const res = await db.collection(CLOUD_COLLECTIONS.diaries)
    .orderBy('date', 'desc')
    .limit(limit)
    .get();
  return (res.data || []) as DiaryRecord[];
}

export async function listDiaryDatesByMonth(monthKey: string): Promise<string[]> {
  const db = getCloudDb();
  const start = `${monthKey}-01`;
  const end = `${monthKey}-32`;
  const _ = db.command;
  const res = await db.collection(CLOUD_COLLECTIONS.diaries)
    .where({ date: _.gte(start).and(_.lte(end)) })
    .field({ date: true })
    .limit(31)
    .get();
  return ((res.data || []) as Array<{ date: string }>).map(item => item.date);
}

export async function getDiaryByDate(date: string): Promise<DiaryRecord | null> {
  const db = getCloudDb();
  const res = await db.collection(CLOUD_COLLECTIONS.diaries)
    .where({ date })
    .limit(1)
    .get();
  return res.data.length > 0 ? (res.data[0] as DiaryRecord) : null;
}

export async function uploadDiaryPhotos(date: string, localPaths: string[]): Promise<string[]> {
  const uploaded: string[] = [];
  for (let i = 0; i < localPaths.length; i += 1) {
    const path = localPaths[i];
    if (path.indexOf('cloud://') === 0) {
      uploaded.push(path);
      continue;
    }
    const ext = path.split('.').pop() || 'jpg';
    const cloudPath = `diaries/${date}/${Date.now()}-${i}.${ext}`;
    const res = await wx.cloud.uploadFile({ cloudPath, filePath: path });
    uploaded.push(res.fileID);
  }
  return uploaded;
}

export async function saveDiary(record: DiaryRecord): Promise<DiaryRecord> {
  const db = getCloudDb();
  const collection = db.collection(CLOUD_COLLECTIONS.diaries);
  const existing = await getDiaryByDate(record.date);
  const now = Date.now();

  if (existing && existing._id) {
    const saved: DiaryRecord = {
      ...record,
      _id: existing._id,
      createdAt: existing.createdAt || record.createdAt || now,
      updatedAt: now,
    };
    const data = { ...saved };
    delete data._id;
    await collection.doc(existing._id).update({ data });
    return saved;
  }

  const created: DiaryRecord = {
    ...record,
    createdAt: record.createdAt || now,
    updatedAt: now,
  };

  try {
    const addRes = await collection.add({ data: created });
    return { ...created, _id: addRes._id };
  } catch (e) {
    const latest = await getDiaryByDate(record.date);
    if (!latest || !latest._id) throw e;
    const saved: DiaryRecord = {
      ...record,
      _id: latest._id,
      createdAt: latest.createdAt || now,
      updatedAt: Date.now(),
    };
    const data = { ...saved };
    delete data._id;
    await collection.doc(latest._id).update({ data });
    return saved;
  }
}
```

- [ ] **Step 4: Verify compilation**

Run:

```bash
npx --no-install tsc --noEmit
```

Expected: exit code `0`.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/diaryDraft.ts miniprogram/utils/diaryTags.ts miniprogram/services/diaries.ts
git commit -m "feat: add diary data services"
```

---

### Task 4: Diary Home Page

**Files:**
- Create: `miniprogram/pages/diary-home/diary-home.ts`
- Create: `miniprogram/pages/diary-home/diary-home.wxml`
- Create: `miniprogram/pages/diary-home/diary-home.wxss`
- Create: `miniprogram/pages/diary-home/diary-home.json`
- Modify: `miniprogram/app.json`
- Test: `npx --no-install tsc --noEmit`; WeChat DevTools page preview.

- [ ] **Step 1: Register diary pages in app.json**

Modify the `pages` array in `miniprogram/app.json`:

```json
"pages": [
  "pages/welcome/welcome",
  "pages/free-write/free-write",
  "pages/index/index",
  "pages/result/result",
  "pages/diary-home/diary-home",
  "pages/diary-calendar/diary-calendar",
  "pages/diary-edit/diary-edit"
]
```

- [ ] **Step 2: Create diary-home json**

Create `miniprogram/pages/diary-home/diary-home.json`:

```json
{
  "usingComponents": {
    "navigation-bar": "/components/navigation-bar/navigation-bar"
  }
}
```

- [ ] **Step 3: Create diary-home page logic**

Create `miniprogram/pages/diary-home/diary-home.ts`:

```ts
import { listRecentDiaries, listDiaryDatesByMonth } from '../../services/diaries';
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
```

- [ ] **Step 4: Create diary-home markup**

Create `miniprogram/pages/diary-home/diary-home.wxml`:

```xml
<navigation-bar title="我们的日记" back="{{true}}" color="black" background="#FFF5F5"></navigation-bar>

<scroll-view class="diary-home" scroll-y type="list" enhanced show-scrollbar="{{false}}">
  <view class="hero-card">
    <view>
      <view class="hero-kicker">OUR DAYS</view>
      <view class="hero-title">把今天留住</view>
      <view class="hero-subtitle">这个月已经记录 {{monthDiaryCount}} 天</view>
    </view>
    <button class="calendar-btn" bind:tap="goCalendar">查看月历</button>
  </view>

  <button class="today-btn" bind:tap="goToday">写今天的日记</button>

  <view wx:if="{{loading}}" class="state-card">正在加载日记...</view>
  <view wx:elif="{{loadError}}" class="state-card">
    <view>日记加载失败</view>
    <button class="retry-btn" bind:tap="loadDiaries">重试</button>
  </view>
  <view wx:elif="{{timeline.length === 0}}" class="state-card">还没有日记，先写下今天吧。</view>

  <view wx:else class="timeline">
    <view wx:for="{{timeline}}" wx:key="date" class="diary-card" bind:tap="openDiary" data-date="{{item.date}}">
      <image wx:if="{{item.coverFileId}}" class="cover" src="{{item.coverFileId}}" mode="aspectFill" />
      <view class="diary-body">
        <view class="date-row">
          <text class="date">{{item.date}}</text>
          <text class="mood">{{item.moodEmoji}} {{item.moodLabel}}</text>
        </view>
        <view class="summary">{{item.summary}}</view>
        <view wx:if="{{item.location}}" class="location">📍 {{item.location}}</view>
        <view wx:if="{{item.tags.length > 0}}" class="tag-row">
          <text wx:for="{{item.tags}}" wx:key="optionId" class="tag">{{item.name}}</text>
        </view>
      </view>
    </view>
  </view>

  <view style="height: 48rpx;"></view>
</scroll-view>
```

- [ ] **Step 5: Create diary-home styles**

Create `miniprogram/pages/diary-home/diary-home.wxss`:

```css
.diary-home {
  flex: 1;
  background: linear-gradient(180deg, #FFF5F5 0%, #FFF9F1 52%, #F7FBFF 100%);
  padding: 28rpx 28rpx 0;
  box-sizing: border-box;
}

.hero-card,
.state-card,
.diary-card {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 30rpx;
  box-shadow: 0 18rpx 52rpx rgba(255, 107, 129, 0.12);
}

.hero-card {
  padding: 30rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hero-kicker {
  font-size: 22rpx;
  color: #B77986;
  letter-spacing: 2rpx;
}

.hero-title {
  margin-top: 8rpx;
  font-size: 44rpx;
  font-weight: 800;
  color: var(--text-primary);
}

.hero-subtitle {
  margin-top: 8rpx;
  font-size: 26rpx;
  color: var(--text-secondary);
}

.calendar-btn,
.today-btn,
.retry-btn {
  border: none;
  border-radius: 999rpx;
  font-size: 26rpx;
}

.calendar-btn {
  padding: 16rpx 24rpx;
  color: #FF6B81;
  background: #FFF0F2;
}

.today-btn {
  width: 100%;
  margin: 26rpx 0;
  padding: 24rpx;
  color: #fff;
  font-weight: 700;
  background: linear-gradient(135deg, #FF6B81, #FF9A8B);
}

.state-card {
  padding: 50rpx 28rpx;
  text-align: center;
  color: var(--text-secondary);
}

.retry-btn {
  margin-top: 20rpx;
  padding: 14rpx 28rpx;
  color: #fff;
  background: #FF6B81;
}

.diary-card {
  overflow: hidden;
  margin-bottom: 24rpx;
}

.cover {
  width: 100%;
  height: 300rpx;
  display: block;
}

.diary-body {
  padding: 26rpx;
}

.date-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.date {
  font-size: 26rpx;
  color: #B77986;
}

.mood {
  font-size: 24rpx;
  color: #B77986;
}

.summary {
  margin-top: 16rpx;
  font-size: 32rpx;
  line-height: 1.55;
  color: var(--text-primary);
}

.location {
  margin-top: 14rpx;
  font-size: 24rpx;
  color: var(--text-secondary);
}

.tag-row {
  margin-top: 18rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.tag {
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  color: #FF6B81;
  background: #FFF0F2;
  font-size: 22rpx;
}
```

- [ ] **Step 6: Verify compile and preview**

Run:

```bash
npx --no-install tsc --noEmit
```

Expected: exit code `0`.

Open WeChat DevTools and preview `/pages/diary-home/diary-home`.

Expected:
- Page loads without Skyline template errors.
- If cloud collections are empty, page shows “还没有日记”.
- If cloud load fails, page shows a retry state, not a blank page.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/app.json miniprogram/pages/diary-home
git commit -m "feat: add diary home timeline"
```

---

### Task 5: Diary Calendar Page

**Files:**
- Create: `miniprogram/pages/diary-calendar/diary-calendar.ts`
- Create: `miniprogram/pages/diary-calendar/diary-calendar.wxml`
- Create: `miniprogram/pages/diary-calendar/diary-calendar.wxss`
- Create: `miniprogram/pages/diary-calendar/diary-calendar.json`
- Test: `npx --no-install tsc --noEmit`; WeChat DevTools calendar navigation.

- [ ] **Step 1: Create diary-calendar json**

Create `miniprogram/pages/diary-calendar/diary-calendar.json`:

```json
{
  "usingComponents": {
    "navigation-bar": "/components/navigation-bar/navigation-bar"
  }
}
```

- [ ] **Step 2: Create calendar page logic**

Create `miniprogram/pages/diary-calendar/diary-calendar.ts`:

```ts
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
      const opts = (page as any).options || {};
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
```

- [ ] **Step 3: Create calendar markup**

Create `miniprogram/pages/diary-calendar/diary-calendar.wxml`:

```xml
<navigation-bar title="日记月历" back="{{true}}" color="black" background="#FFF5F5"></navigation-bar>

<view class="calendar-page">
  <view class="month-header">
    <button class="month-btn" bind:tap="prevMonth">‹</button>
    <view class="month-title">{{currentMonthLabel}}</view>
    <button class="month-btn" bind:tap="nextMonth">›</button>
  </view>

  <view class="week-row">
    <text wx:for="{{weekLabels}}" wx:key="*this" class="week-label">{{item}}</text>
  </view>

  <view wx:if="{{loading}}" class="state-card">正在加载月历...</view>
  <view wx:elif="{{loadError}}" class="state-card">
    <view>月历加载失败</view>
    <button class="retry-btn" bind:tap="loadMonth">重试</button>
  </view>

  <view wx:else class="day-grid">
    <view
      wx:for="{{days}}"
      wx:key="date"
      class="day-cell {{!item.inCurrentMonth ? 'muted' : ''}} {{item.isToday ? 'today' : ''}} {{item.isFuture ? 'future' : ''}} {{item.hasDiary ? 'has-diary' : ''}}"
      bind:tap="onDayTap"
      data-date="{{item.date}}"
      data-future="{{item.isFuture}}"
    >
      <text>{{item.day}}</text>
      <view wx:if="{{item.hasDiary}}" class="dot"></view>
    </view>
  </view>
</view>
```

- [ ] **Step 4: Create calendar styles**

Create `miniprogram/pages/diary-calendar/diary-calendar.wxss`:

```css
.calendar-page {
  flex: 1;
  background: linear-gradient(180deg, #FFF5F5 0%, #FFF9F1 100%);
  padding: 28rpx;
  box-sizing: border-box;
}

.month-header,
.week-row,
.day-grid {
  background: rgba(255, 255, 255, 0.92);
}

.month-header {
  border-radius: 30rpx 30rpx 0 0;
  padding: 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.month-btn {
  width: 70rpx;
  height: 70rpx;
  border: none;
  border-radius: 50%;
  color: #FF6B81;
  background: #FFF0F2;
  font-size: 40rpx;
}

.month-title {
  font-size: 34rpx;
  font-weight: 800;
  color: var(--text-primary);
}

.week-row,
.day-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.week-row {
  padding: 18rpx 12rpx;
  color: #B77986;
  font-size: 24rpx;
  text-align: center;
}

.day-grid {
  border-radius: 0 0 30rpx 30rpx;
  padding: 12rpx;
}

.day-cell {
  position: relative;
  height: 88rpx;
  margin: 6rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  font-size: 28rpx;
}

.day-cell.muted {
  color: #C9B8B8;
}

.day-cell.future {
  color: #D8D8D8;
}

.day-cell.today {
  background: #FFF0F2;
  color: #FF6B81;
  font-weight: 800;
}

.day-cell.has-diary {
  border: 2rpx solid rgba(255, 107, 129, 0.28);
}

.dot {
  position: absolute;
  bottom: 12rpx;
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: #FF6B81;
}

.state-card {
  padding: 60rpx 28rpx;
  border-radius: 0 0 30rpx 30rpx;
  background: rgba(255, 255, 255, 0.92);
  text-align: center;
  color: var(--text-secondary);
}

.retry-btn {
  margin-top: 20rpx;
  border: none;
  border-radius: 999rpx;
  padding: 14rpx 28rpx;
  color: #fff;
  background: #FF6B81;
}
```

- [ ] **Step 5: Verify compile and calendar behavior**

Run:

```bash
npx --no-install tsc --noEmit
```

Expected: exit code `0`.

In WeChat DevTools:
- Open `/pages/diary-calendar/diary-calendar`.
- Tap previous/next month.
- Tap a future date.

Expected:
- Month navigation updates the grid.
- Future date shows “未来日期还不能写哦”.
- Past and today dates navigate to `/pages/diary-edit/diary-edit?date=...`.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/diary-calendar
git commit -m "feat: add diary calendar"
```

---

### Task 6: Diary Edit Page With Drafts, Photos, And Tag Confirmation

**Files:**
- Create: `miniprogram/pages/diary-edit/diary-edit.ts`
- Create: `miniprogram/pages/diary-edit/diary-edit.wxml`
- Create: `miniprogram/pages/diary-edit/diary-edit.wxss`
- Create: `miniprogram/pages/diary-edit/diary-edit.json`
- Test: `npx --no-install tsc --noEmit`; WeChat DevTools create/edit/save flow.

- [ ] **Step 1: Create diary-edit json**

Create `miniprogram/pages/diary-edit/diary-edit.json`:

```json
{
  "usingComponents": {
    "navigation-bar": "/components/navigation-bar/navigation-bar"
  }
}
```

- [ ] **Step 2: Create diary-edit logic**

Create `miniprogram/pages/diary-edit/diary-edit.ts`:

```ts
import { getDiaryByDate, saveDiary, uploadDiaryPhotos } from '../../services/diaries';
import { listCustomOptions, upsertCustomOptions } from '../../services/customOptions';
import { DiaryDraft, DiaryRecord, MOODS, MoodId, RecognizedTag } from '../../types/diary';
import { clearDiaryDraft, readDiaryDraft, saveDiaryDraft } from '../../utils/diaryDraft';
import { isFutureDate, todayString } from '../../utils/date';
import { buildCustomOptionId, mergeCustomOptions, normalizeOptionName } from '../../utils/categoryOptions';
import { recognizeDiaryTags } from '../../utils/diaryTags';

Component({
  data: {
    date: todayString(),
    loading: true,
    saving: false,
    content: '',
    mood: 'happy' as MoodId,
    location: '',
    localPhotoPaths: [] as string[],
    existingPhotoFileIds: [] as string[],
    moods: MOODS,
    tagPanelVisible: false,
    recognizedTags: [] as RecognizedTag[],
    tagCategories: [] as Array<{ id: string; name: string }>,
    tagCategoryNames: [] as string[],
    existingRecord: null as DiaryRecord | null,
  },

  lifetimes: {
    attached() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      const opts = (page as any).options || {};
      const date = (opts.date as string) || todayString();
      if (isFutureDate(date)) {
        wx.showToast({ title: '未来日期还不能写哦', icon: 'none' });
        wx.navigateBack();
        return;
      }
      this.setData({ date });
      this.loadDiary(date);
    },
  },

  methods: {
    async loadDiary(date: string) {
      this.setData({ loading: true });
      try {
        const [record, draft] = await Promise.all([
          getDiaryByDate(date),
          Promise.resolve(readDiaryDraft(date)),
        ]);
        const useDraft = draft && (!record || draft.updatedAt > record.updatedAt);
        if (useDraft) {
          wx.showToast({ title: '已恢复本地草稿', icon: 'none' });
          this.applyDraft(draft);
        } else if (record) {
          this.setData({
            existingRecord: record,
            content: record.content,
            mood: record.mood,
            location: record.location,
            existingPhotoFileIds: record.photoFileIds,
            localPhotoPaths: [],
          });
        }
        this.setData({ loading: false });
      } catch (e) {
        console.warn('加载日记失败', e);
        wx.showToast({ title: '日记加载失败', icon: 'none' });
        this.setData({ loading: false });
      }
    },

    applyDraft(draft: DiaryDraft) {
      this.setData({
        content: draft.content,
        mood: draft.mood,
        location: draft.location,
        localPhotoPaths: draft.localPhotoPaths,
        existingPhotoFileIds: draft.existingPhotoFileIds,
      });
    },

    persistDraft() {
      saveDiaryDraft({
        date: this.data.date,
        content: this.data.content,
        mood: this.data.mood,
        location: this.data.location,
        localPhotoPaths: this.data.localPhotoPaths,
        existingPhotoFileIds: this.data.existingPhotoFileIds,
        updatedAt: Date.now(),
      });
    },

    onContentInput(e: WechatMiniprogram.Input) {
      this.setData({ content: e.detail.value });
      this.persistDraft();
    },

    onLocationInput(e: WechatMiniprogram.Input) {
      this.setData({ location: e.detail.value });
      this.persistDraft();
    },

    onMoodTap(e: WechatMiniprogram.TouchEvent) {
      this.setData({ mood: e.currentTarget.dataset.id as MoodId });
      this.persistDraft();
    },

    choosePhotos() {
      const currentCount = this.data.existingPhotoFileIds.length + this.data.localPhotoPaths.length;
      const count = 3 - currentCount;
      if (count <= 0) {
        wx.showToast({ title: '最多 3 张照片', icon: 'none' });
        return;
      }
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: res => {
          const paths = res.tempFiles.map(file => file.tempFilePath);
          this.setData({ localPhotoPaths: this.data.localPhotoPaths.concat(paths) });
          this.persistDraft();
        },
      });
    },

    removeExistingPhoto(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number;
      const next = this.data.existingPhotoFileIds.filter((_, i) => i !== index);
      this.setData({ existingPhotoFileIds: next });
      this.persistDraft();
    },

    removeLocalPhoto(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number;
      const next = this.data.localPhotoPaths.filter((_, i) => i !== index);
      this.setData({ localPhotoPaths: next });
      this.persistDraft();
    },

    async onSaveTap() {
      if (!this.data.content.trim()) {
        wx.showToast({ title: '先写一点内容吧', icon: 'none' });
        return;
      }
      const customOptions = await listCustomOptions();
      const categories = mergeCustomOptions(customOptions);
      const recognizedTags = recognizeDiaryTags(this.data.content, categories);
      const tagCategories = categories.map(cat => ({ id: cat.id, name: cat.name }));
      this.setData({
        recognizedTags,
        tagCategories,
        tagCategoryNames: tagCategories.map(cat => cat.name),
        tagPanelVisible: true,
      });
    },

    onTagNameInput(e: WechatMiniprogram.Input) {
      const index = e.currentTarget.dataset.index as number;
      const tags = this.data.recognizedTags.slice();
      const tag = tags[index];
      const name = e.detail.value;
      const normalizedName = normalizeOptionName(name);
      tags[index] = {
        ...tag,
        name,
        optionId: tag.source === 'candidate' ? buildCustomOptionId(tag.categoryId, normalizedName) : tag.optionId,
      };
      this.setData({ recognizedTags: tags });
    },

    onTagCategoryChange(e: WechatMiniprogram.PickerChange) {
      const index = e.currentTarget.dataset.index as number;
      const categoryIndex = Number(e.detail.value);
      const category = this.data.tagCategories[categoryIndex];
      if (!category) return;
      const tags = this.data.recognizedTags.slice();
      const tag = tags[index];
      const normalizedName = normalizeOptionName(tag.name);
      tags[index] = {
        ...tag,
        categoryId: category.id,
        categoryName: category.name,
        optionId: buildCustomOptionId(category.id, normalizedName),
        source: 'candidate',
        isCustom: true,
        editable: true,
      };
      this.setData({ recognizedTags: tags });
    },

    removeTag(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number;
      this.setData({ recognizedTags: this.data.recognizedTags.filter((_, i) => i !== index) });
    },

    closeTagPanel() {
      this.setData({ tagPanelVisible: false });
    },

    async confirmSave() {
      this.setData({ saving: true });
      try {
        const candidateTags = this.data.recognizedTags.filter(tag => tag.source === 'candidate' && tag.name.trim());
        await upsertCustomOptions(candidateTags.map(tag => ({ categoryId: tag.categoryId, name: tag.name })));
        const uploadedFileIds = await uploadDiaryPhotos(this.data.date, this.data.localPhotoPaths);
        const photoFileIds = this.data.existingPhotoFileIds.concat(uploadedFileIds).slice(0, 3);
        const now = Date.now();
        const record: DiaryRecord = {
          _id: this.data.existingRecord ? this.data.existingRecord._id : undefined,
          date: this.data.date,
          content: this.data.content.trim(),
          mood: this.data.mood,
          location: this.data.location.trim(),
          photoFileIds,
          tags: this.data.recognizedTags
            .filter(tag => tag.name.trim())
            .map(tag => ({
              categoryId: tag.categoryId,
              optionId: tag.optionId,
              name: tag.name.trim(),
              isCustom: tag.source === 'candidate' || tag.isCustom,
            })),
          createdAt: this.data.existingRecord ? this.data.existingRecord.createdAt : now,
          updatedAt: now,
        };
        await saveDiary(record);
        clearDiaryDraft(this.data.date);
        wx.showToast({ title: '日记已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } catch (e) {
        console.warn('保存日记失败', e);
        wx.showToast({ title: '保存失败，草稿已保留', icon: 'none' });
      } finally {
        this.setData({ saving: false, tagPanelVisible: false });
      }
    },
  },
});
```

- [ ] **Step 3: Create diary-edit markup**

Create `miniprogram/pages/diary-edit/diary-edit.wxml`:

```xml
<navigation-bar title="写日记" back="{{true}}" color="black" background="#FFF5F5"></navigation-bar>

<scroll-view class="edit-page" scroll-y type="list" enhanced show-scrollbar="{{false}}">
  <view wx:if="{{loading}}" class="state-card">正在打开日记...</view>

  <block wx:else>
    <view class="date-card">{{date}}</view>

    <view class="section-card">
      <view class="section-title">今天的心情</view>
      <view class="mood-row">
        <view wx:for="{{moods}}" wx:key="id" class="mood-item {{mood === item.id ? 'active' : ''}}" bind:tap="onMoodTap" data-id="{{item.id}}">
          <view class="mood-emoji">{{item.emoji}}</view>
          <view class="mood-label">{{item.label}}</view>
        </view>
      </view>
    </view>

    <view class="section-card">
      <view class="section-title">今天发生了什么</view>
      <textarea class="content-input" value="{{content}}" maxlength="1000" placeholder="写下今天一起做了什么..." bindinput="onContentInput" />
    </view>

    <view class="section-card">
      <view class="section-title">地点</view>
      <input class="location-input" value="{{location}}" placeholder="比如：深圳湾公园" bindinput="onLocationInput" />
    </view>

    <view class="section-card">
      <view class="section-title">照片（最多 3 张）</view>
      <view class="photo-grid">
        <view wx:for="{{existingPhotoFileIds}}" wx:key="*this" wx:for-index="index" class="photo-cell">
          <image src="{{item}}" mode="aspectFill" />
          <view class="remove-photo" bind:tap="removeExistingPhoto" data-index="{{index}}">×</view>
        </view>
        <view wx:for="{{localPhotoPaths}}" wx:key="*this" wx:for-index="index" class="photo-cell">
          <image src="{{item}}" mode="aspectFill" />
          <view class="remove-photo" bind:tap="removeLocalPhoto" data-index="{{index}}">×</view>
        </view>
        <view wx:if="{{existingPhotoFileIds.length + localPhotoPaths.length < 3}}" class="add-photo" bind:tap="choosePhotos">＋</view>
      </view>
    </view>

    <button class="save-btn {{saving ? 'btn-disabled' : ''}}" disabled="{{saving}}" bind:tap="onSaveTap">保存日记</button>
  </block>
</scroll-view>

<view wx:if="{{tagPanelVisible}}" class="tag-mask">
  <view class="tag-panel">
    <view class="tag-title">确认自动识别的标签</view>
    <view wx:if="{{recognizedTags.length === 0}}" class="tag-empty">没有识别到标签，可以直接保存。</view>
    <view wx:for="{{recognizedTags}}" wx:key="optionId" wx:for-index="index" class="tag-edit-row">
      <view class="tag-category">{{item.categoryName}}</view>
      <input class="tag-name-input" value="{{item.name}}" disabled="{{!item.editable}}" bindinput="onTagNameInput" data-index="{{index}}" />
      <picker wx:if="{{item.editable}}" mode="selector" range="{{tagCategoryNames}}" bindchange="onTagCategoryChange" data-index="{{index}}">
        <view class="tag-switch">换分类</view>
      </picker>
      <view class="tag-remove" bind:tap="removeTag" data-index="{{index}}">删除</view>
    </view>
    <view class="tag-actions">
      <button class="cancel-btn" bind:tap="closeTagPanel">再改改</button>
      <button class="confirm-btn" bind:tap="confirmSave">确认保存</button>
    </view>
  </view>
</view>
```

- [ ] **Step 4: Create diary-edit styles**

Create `miniprogram/pages/diary-edit/diary-edit.wxss`:

```css
.edit-page {
  flex: 1;
  background: linear-gradient(180deg, #FFF5F5 0%, #FFF9F1 100%);
  padding: 28rpx;
  box-sizing: border-box;
}

.state-card,
.date-card,
.section-card {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 28rpx;
  box-shadow: 0 18rpx 52rpx rgba(255, 107, 129, 0.1);
}

.state-card {
  padding: 50rpx 28rpx;
  text-align: center;
  color: var(--text-secondary);
}

.date-card {
  padding: 28rpx;
  color: #B77986;
  font-size: 30rpx;
  font-weight: 800;
}

.section-card {
  margin-top: 22rpx;
  padding: 26rpx;
}

.section-title {
  margin-bottom: 18rpx;
  font-size: 28rpx;
  font-weight: 800;
  color: var(--text-primary);
}

.mood-row {
  display: flex;
  gap: 14rpx;
}

.mood-item {
  flex: 1;
  border-radius: 22rpx;
  padding: 18rpx 8rpx;
  text-align: center;
  background: #FFF7F7;
  color: #B77986;
}

.mood-item.active {
  background: #FF6B81;
  color: #fff;
}

.mood-emoji {
  font-size: 38rpx;
}

.mood-label {
  margin-top: 8rpx;
  font-size: 22rpx;
}

.content-input {
  width: 100%;
  min-height: 360rpx;
  font-size: 30rpx;
  line-height: 1.65;
  color: var(--text-primary);
}

.location-input {
  font-size: 30rpx;
  color: var(--text-primary);
}

.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.photo-cell,
.add-photo {
  position: relative;
  width: 190rpx;
  height: 190rpx;
  border-radius: 24rpx;
  overflow: hidden;
  background: #FFF7F7;
}

.photo-cell image {
  width: 100%;
  height: 100%;
}

.remove-photo {
  position: absolute;
  right: 8rpx;
  top: 8rpx;
  width: 38rpx;
  height: 38rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  text-align: center;
  line-height: 38rpx;
}

.add-photo {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FF6B81;
  font-size: 60rpx;
}

.save-btn {
  width: 100%;
  margin: 34rpx 0 60rpx;
  border: none;
  border-radius: 999rpx;
  padding: 24rpx;
  color: #fff;
  font-size: 32rpx;
  font-weight: 700;
  background: linear-gradient(135deg, #FF6B81, #FF9A8B);
}

.save-btn.btn-disabled {
  background: #D9D9D9;
  color: #999;
}

.tag-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.32);
  display: flex;
  align-items: flex-end;
  z-index: 20;
}

.tag-panel {
  width: 100%;
  max-height: 75vh;
  padding: 30rpx;
  border-radius: 34rpx 34rpx 0 0;
  background: #fff;
  box-sizing: border-box;
}

.tag-title {
  font-size: 32rpx;
  font-weight: 800;
  color: var(--text-primary);
}

.tag-empty {
  margin-top: 24rpx;
  color: var(--text-secondary);
}

.tag-edit-row {
  margin-top: 20rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.tag-category {
  width: 150rpx;
  color: #B77986;
  font-size: 24rpx;
}

.tag-name-input {
  flex: 1;
  padding: 14rpx 18rpx;
  border-radius: 18rpx;
  background: #FFF7F7;
  font-size: 26rpx;
}

.tag-remove {
  color: #FF6B81;
  font-size: 24rpx;
}

.tag-switch {
  color: #7BA7D1;
  font-size: 24rpx;
}

.tag-actions {
  margin-top: 28rpx;
  display: flex;
  gap: 18rpx;
}

.cancel-btn,
.confirm-btn {
  flex: 1;
  border: none;
  border-radius: 999rpx;
  padding: 20rpx;
  font-size: 28rpx;
}

.cancel-btn {
  color: #B77986;
  background: #FFF0F2;
}

.confirm-btn {
  color: #fff;
  background: #FF6B81;
}
```

- [ ] **Step 5: Verify create/edit/save flow**

Run:

```bash
npx --no-install tsc --noEmit
```

Expected: exit code `0`.

In WeChat DevTools:
- Open `/pages/diary-edit/diary-edit?date=2026-06-04`.
- Enter content, choose one mood, enter a location, choose one image.
- Tap save, confirm tags, and return to the home page.
- Re-open the same date.

Expected:
- Draft is restored if leaving before save.
- Saved diary reloads from cloud.
- More than three photos cannot be selected.
- Tag confirmation appears before cloud save.
- Newly confirmed candidate tags are written into `custom_options`.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/diary-edit
git commit -m "feat: add diary editor"
```

---

### Task 7: Welcome Entry Card And Visual Integration

**Files:**
- Modify: `miniprogram/pages/welcome/welcome.ts`
- Modify: `miniprogram/pages/welcome/welcome.wxml`
- Modify: `miniprogram/pages/welcome/welcome.wxss`
- Test: `npx --no-install tsc --noEmit`; WeChat DevTools welcome screen.

- [ ] **Step 1: Add navigation method**

In `miniprogram/pages/welcome/welcome.ts`, add this method inside `methods`:

```ts
goDiary() {
  wx.navigateTo({ url: '/pages/diary-home/diary-home' });
},
```

- [ ] **Step 2: Add right-top diary entry card**

In `miniprogram/pages/welcome/welcome.wxml`, add this after `<view class="screen-shade"></view>`:

```xml
<view class="diary-entry" bind:tap="goDiary">
  <view class="diary-entry-icon">📖</view>
  <view class="diary-entry-text">我们的日记</view>
</view>
```

- [ ] **Step 3: Style the entry card**

In `miniprogram/pages/welcome/welcome.wxss`, add:

```css
.diary-entry {
  position: absolute;
  right: 28rpx;
  top: calc(120rpx + env(safe-area-inset-top));
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 16rpx 20rpx;
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.92);
  color: #C45F72;
  box-shadow: 0 12rpx 34rpx rgba(120, 54, 69, 0.16);
}

.diary-entry-icon {
  font-size: 28rpx;
}

.diary-entry-text {
  font-size: 24rpx;
  font-weight: 700;
}
```

- [ ] **Step 4: Verify compile and welcome flow**

Run:

```bash
npx --no-install tsc --noEmit
```

Expected: exit code `0`.

In WeChat DevTools:
- Open welcome page.
- Tap “我们的日记”.
- Return to welcome page.

Expected:
- Existing two buttons remain visible and usable.
- Diary entry opens `/pages/diary-home/diary-home`.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/welcome/welcome.ts miniprogram/pages/welcome/welcome.wxml miniprogram/pages/welcome/welcome.wxss
git commit -m "feat: add diary entry"
```

---

### Task 8: Cloud Setup Documentation And End-To-End Verification

**Files:**
- Create: `docs/cloud-diary-setup.md`
- Test: `npx --no-install tsc --noEmit`; WeChat DevTools on two devices or two simulator sessions.

- [ ] **Step 1: Write cloud setup doc**

Create `docs/cloud-diary-setup.md`:

```md
# 情侣日记云开发配置

## 1. 启用云开发

在微信开发者工具中打开项目，进入“云开发”，为当前体验版小程序创建默认云环境。代码使用 `wx.cloud.init({ traceUser: true })` 初始化默认环境。

## 2. 创建集合

创建两个数据库集合：

- `diaries`
- `custom_options`

## 3. 集合权限

体验版首版只给两位体验成员使用，因此两个集合配置为体验成员可读写。

未来如果小程序发布给更多人使用，必须改成云函数写入，并基于 OpenID 或情侣空间 ID 做访问控制。

## 4. 唯一索引

为 `diaries` 集合创建唯一索引：

- 字段：`date`
- 排序：升序
- 唯一：是

这能避免两台设备同时首次保存同一天日记时产生两条记录。

## 5. 云存储

日记照片上传到路径：

`diaries/<YYYY-MM-DD>/<timestamp>-<index>.<ext>`

不要手动清理这些文件，因为首版不提供日记删除功能。

## 6. 验收清单

- 两台设备都能打开“我们的日记”。
- A 设备保存 `2026-06-04` 日记后，B 设备刷新能看到同一篇。
- B 设备编辑同一天并保存后，A 设备刷新看到 B 的版本。
- 未保存退出后再次进入同一天，能恢复本地草稿。
- 保存失败时草稿不丢失。
- 新标签确认后，重新进入“今天干什么”能在对应大分类的“其他”分组看到它。
```

- [ ] **Step 2: Run final TypeScript compile**

Run:

```bash
npx --no-install tsc --noEmit
```

Expected: exit code `0`.

- [ ] **Step 3: Run manual end-to-end checks**

In WeChat DevTools and on the two experience-member devices:

1. Open welcome page and tap “我们的日记”.
2. Create today’s diary with content, one mood, location, and one photo.
3. Confirm tags and save.
4. Open diary home on the second device.
5. Edit the same date from the second device and save.
6. Refresh the first device.
7. Open the calendar and choose a past empty date.
8. Create a past diary without photos.
9. Try choosing a future date.
10. Enter diary text containing a new activity, confirm the candidate tag, save, and reopen “今天干什么”.

Expected:
- Both devices see the same saved cloud diary records.
- Same-date edit overwrites the previous cloud version.
- Past date creation works.
- Future date creation is blocked.
- Draft survives unsaved exit.
- New tag appears in the matching category’s “其他” group.
- Existing selection/share flow still works.

- [ ] **Step 4: Commit**

```bash
git add docs/cloud-diary-setup.md
git commit -m "docs: add diary cloud setup guide"
```

---

## Self-Review Checklist

- Spec coverage:
  - Independent welcome entry: Task 7.
  - One shared diary per day: Tasks 3 and 6, plus unique index in Task 8.
  - Past-date creation and future-date block: Task 5 and Task 6.
  - Free-text body, one mood, manual location, max three photos: Task 6.
  - Local drafts and manual cloud save: Task 3 and Task 6.
  - Cloud diaries and shared custom options: Tasks 1, 2, 3, 6, 8.
  - Tag recognition and confirmation before save, including new tag rename/category switch/delete: Tasks 3 and 6.
  - New tags merged into “今天干什么” “其他” group: Task 2 and Task 6.
  - No delete, no AI, no plan linkage, no conflict prompt: enforced by omission and doc in Task 8.
- Placeholder scan:
  - The plan uses no `TBD`, `TODO`, or unresolved env id. It uses the default cloud environment.
- Type consistency:
  - `DiaryRecord`, `DiaryDraft`, `DiaryTag`, `CustomOptionRecord`, `RecognizedTag`, `MoodId`, and `CalendarDay` are introduced in Task 1 and reused with the same names in later tasks.
  - `custom_options`, `diaries`, `date`, `normalizedName`, `photoFileIds`, `localPhotoPaths`, and `existingPhotoFileIds` are consistently named across services, pages, and docs.
