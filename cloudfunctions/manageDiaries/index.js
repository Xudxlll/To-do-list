const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION_NAME = 'diaries';
const MAX_PHOTO_COUNT = 9;
const MAX_TAG_COUNT = 80;
const VALID_MOODS = ['happy', 'calm', 'tired', 'sad', 'surprised'];

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function diaryDocId(date) {
  return `diary_${date.replace(/[^0-9]/g, '_')}`;
}

function assertDiaryDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail('date', '日记日期无效');
  }
  return date;
}

function normalizeStringArray(value, limit) {
  if (!Array.isArray(value)) return [];
  const normalized = [];
  const seen = new Set();
  value.forEach(item => {
    const text = trimText(item);
    if (!text || seen.has(text)) return;
    seen.add(text);
    normalized.push(text);
  });
  return normalized.slice(0, limit);
}

function normalizeMoods(rawMoods, rawMood) {
  const moods = normalizeStringArray(rawMoods, VALID_MOODS.length)
    .filter(mood => VALID_MOODS.includes(mood));
  const mood = trimText(rawMood);
  if (VALID_MOODS.includes(mood) && !moods.includes(mood)) {
    moods.unshift(mood);
  }
  return moods;
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const tags = [];
  const seen = new Set();
  value.forEach(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const categoryId = trimText(item.categoryId);
    const optionId = trimText(item.optionId);
    const name = trimText(item.name);
    if (!categoryId || !optionId || !name) return;
    const key = `${categoryId}:${optionId}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    tags.push({
      categoryId,
      optionId,
      name,
      isCustom: Boolean(item.isCustom),
    });
  });
  return tags.slice(0, MAX_TAG_COUNT);
}

async function readExistingRecord(docId) {
  try {
    const res = await db.collection(COLLECTION_NAME).doc(docId).get();
    return res && res.data ? res.data : null;
  } catch {
    return null;
  }
}

function normalizeDiaryRecord(raw, existing) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('record', '日记记录无效');
  }

  const date = assertDiaryDate(trimText(raw.date));
  const moods = normalizeMoods(raw.moods, raw.mood);
  const now = Date.now();
  const createdAt = existing && Number.isFinite(Number(existing.createdAt))
    ? Number(existing.createdAt)
    : Number.isFinite(Number(raw.createdAt))
      ? Number(raw.createdAt)
      : now;

  return {
    date,
    content: typeof raw.content === 'string' ? raw.content : '',
    mood: moods[0] || '',
    moods,
    location: typeof raw.location === 'string' ? raw.location : '',
    photoFileIds: normalizeStringArray(raw.photoFileIds, MAX_PHOTO_COUNT),
    tags: normalizeTags(raw.tags),
    createdAt,
    updatedAt: now,
  };
}

async function saveDiary(rawRecord) {
  const date = assertDiaryDate(trimText(rawRecord && rawRecord.date));
  const docId = diaryDocId(date);
  const existing = await readExistingRecord(docId);
  const data = normalizeDiaryRecord(rawRecord, existing);
  await db.collection(COLLECTION_NAME).doc(docId).set({ data });
  return {
    ok: true,
    record: {
      ...data,
      _id: docId,
    },
  };
}

exports.main = async (event = {}) => {
  const action = trimText(event.action);
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};

  if (action === 'saveDiary') {
    return saveDiary(payload.record);
  }

  fail('action', '未知的日记管理操作');
};
