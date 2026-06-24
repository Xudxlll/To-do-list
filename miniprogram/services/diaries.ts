import { CLOUD_COLLECTIONS, getCloudDb, initCloud } from '../config/cloud';
import { DiaryRecord } from '../types/diary';
import { getPrimaryMoodId, normalizeMoodIds } from '../utils/diaryMoods';

function diaryDocId(date: string): string {
  return `diary_${date.replace(/[^0-9]/g, '_')}`;
}

function assertDiaryDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`日记日期无效：${date || '空'}`);
  }
  return date;
}

function nextMonthKey(monthKey: string): string {
  const parts = monthKey.split('-').map(Number);
  const d = new Date(parts[0], parts[1], 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getPhotoExtension(path: string): string {
  const cleanPath = path.split('?')[0].split('#')[0];
  const fileName = cleanPath.split('/').pop() || '';
  const dotIndex = fileName.lastIndexOf('.');
  const ext = dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
  const allowed: Record<string, boolean> = {
    jpg: true,
    jpeg: true,
    png: true,
    webp: true,
    heic: true,
  };
  return allowed[ext] ? ext : 'jpg';
}

function isCloudFileId(path: string): boolean {
  return path.indexOf('cloud://') === 0;
}

function mapTempFileUrls(sources: string[], fileList: Array<{ fileID: string; tempFileURL: string }>): string[] {
  const urlMap = (fileList || []).reduce((map, item) => {
    if (item.fileID && item.tempFileURL) {
      map[item.fileID] = item.tempFileURL;
    }
    return map;
  }, {} as Record<string, string>);

  return sources.map(source => (isCloudFileId(source) ? urlMap[source] || source : source));
}

async function resolveDiaryPhotoUrlsByFunction(sources: string[], cloudFileIds: string[]): Promise<string[] | null> {
  const callFunction = (wx.cloud as unknown as {
    callFunction?: (input: { name: string; data: Record<string, unknown> }) => Promise<{ result?: unknown }>;
  }).callFunction;
  if (typeof callFunction !== 'function') return null;

  const res = await callFunction.call(wx.cloud, {
    name: 'diaryPhotos',
    data: {
      action: 'getTempFileUrls',
      fileList: cloudFileIds,
    },
  });
  const result = res.result as { ok?: boolean; fileList?: Array<{ fileID: string; tempFileURL: string }> } | undefined;
  if (!result || result.ok !== true || !Array.isArray(result.fileList)) return null;
  return mapTempFileUrls(sources, result.fileList);
}

async function resolveDiaryPhotoUrlsByClient(sources: string[], cloudFileIds: string[]): Promise<string[]> {
  try {
    const getTempFileURL = (wx.cloud as unknown as {
      getTempFileURL?: (input: { fileList: string[] }) => Promise<{ fileList?: Array<{ fileID: string; tempFileURL: string }> }>;
    }).getTempFileURL;
    if (typeof getTempFileURL !== 'function') return sources.slice();

    const res = await getTempFileURL.call(wx.cloud, { fileList: cloudFileIds });
    return mapTempFileUrls(sources, res.fileList || []);
  } catch (e) {
    console.warn('获取日记照片临时链接失败，将回退到 fileID', e);
    return sources.slice();
  }
}

export async function resolveDiaryPhotoUrls(fileIds: string[]): Promise<string[]> {
  const sources = Array.isArray(fileIds) ? fileIds : [];
  const cloudFileIds = sources.filter(isCloudFileId);
  if (cloudFileIds.length === 0) return sources.slice();

  try {
    const functionUrls = await resolveDiaryPhotoUrlsByFunction(sources, cloudFileIds);
    if (functionUrls) return functionUrls;
  } catch (e) {
    console.warn('通过云函数获取日记照片临时链接失败，将尝试客户端兜底', e);
  }
  return resolveDiaryPhotoUrlsByClient(sources, cloudFileIds);
}

function diaryRecordToData(record: DiaryRecord): Partial<DiaryRecord> {
  const date = assertDiaryDate(record.date);
  const moods = normalizeMoodIds(record.moods, record.mood);
  return {
    date,
    content: record.content || '',
    mood: getPrimaryMoodId(moods),
    moods,
    location: record.location || '',
    photoFileIds: Array.isArray(record.photoFileIds) ? record.photoFileIds : [],
    tags: Array.isArray(record.tags) ? record.tags : [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function saveDiaryByFunction(record: DiaryRecord): Promise<DiaryRecord | null> {
  initCloud();
  const callFunction = (wx.cloud as unknown as {
    callFunction?: (input: { name: string; data: Record<string, unknown> }) => Promise<{ result?: unknown }>;
  }).callFunction;
  if (typeof callFunction !== 'function') return null;

  const res = await callFunction.call(wx.cloud, {
    name: 'manageDiaries',
    data: {
      action: 'saveDiary',
      payload: { record },
    },
  });
  const result = res.result as { ok?: boolean; record?: DiaryRecord } | undefined;
  if (!result || result.ok !== true || !result.record) return null;
  return result.record;
}

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
  const end = `${nextMonthKey(monthKey)}-01`;
  const _ = db.command;
  const res = await db.collection(CLOUD_COLLECTIONS.diaries)
    .where({ date: _.gte(start).and(_.lt(end)) })
    .field({ date: true })
    .orderBy('date', 'asc')
    .limit(100)
    .get();
  const seen: Record<string, boolean> = {};
  return ((res.data || []) as Array<{ date: string }>).reduce((dates, item) => {
    if (!item.date || seen[item.date]) return dates;
    seen[item.date] = true;
    dates.push(item.date);
    return dates;
  }, [] as string[]);
}

export async function getDiaryByDate(date: string): Promise<DiaryRecord | null> {
  assertDiaryDate(date);
  const db = getCloudDb();
  const collection = db.collection(CLOUD_COLLECTIONS.diaries);
  const docId = diaryDocId(date);
  try {
    const docRes = await collection.doc(docId).get();
    if (docRes.data) return docRes.data as DiaryRecord;
  } catch {
    // Fall back to the legacy date query below.
  }

  const res = await collection
    .where({ date })
    .limit(1)
    .get();
  return res.data.length > 0 ? (res.data[0] as DiaryRecord) : null;
}

export async function uploadDiaryPhotos(date: string, localPaths: string[]): Promise<string[]> {
  assertDiaryDate(date);
  const uploaded: string[] = [];
  for (let i = 0; i < localPaths.length; i += 1) {
    const path = localPaths[i];
    if (path.indexOf('cloud://') === 0) {
      uploaded.push(path);
      continue;
    }
    const ext = getPhotoExtension(path);
    const cloudPath = `diaries/${date}/${Date.now()}-${i}.${ext}`;
    const res = await wx.cloud.uploadFile({ cloudPath, filePath: path });
    uploaded.push(res.fileID);
  }
  return uploaded;
}

export async function saveDiary(record: DiaryRecord): Promise<DiaryRecord> {
  const date = assertDiaryDate(record.date);
  const now = Date.now();
  const docId = diaryDocId(date);
  const moods = normalizeMoodIds(record.moods, record.mood);
  const saved: DiaryRecord = {
    ...record,
    _id: docId,
    date,
    mood: getPrimaryMoodId(moods),
    moods,
    createdAt: record.createdAt || now,
    updatedAt: now,
  };

  try {
    const functionSaved = await saveDiaryByFunction(saved);
    if (functionSaved) return functionSaved;
  } catch (e) {
    console.warn('通过云函数保存日记失败，将尝试客户端兜底', e);
  }

  const db = getCloudDb();
  const collection = db.collection(CLOUD_COLLECTIONS.diaries);
  let existing: DiaryRecord | null = null;
  try {
    existing = await getDiaryByDate(date);
  } catch (e) {
    console.warn('读取已有日记失败，将尝试直接保存', e);
  }
  saved.createdAt = existing && existing.createdAt ? existing.createdAt : saved.createdAt;

  const data = diaryRecordToData(saved);
  try {
    await collection.doc(docId).set({ data });
  } catch (setError) {
    console.warn('按固定文档 ID 保存失败，将尝试按日期更新', setError);
    const latest = await collection
      .where({ date })
      .limit(1)
      .get();

    if (latest.data.length > 0) {
      const latestRecord = latest.data[0] as DiaryRecord;
      await collection.doc(latestRecord._id as string).update({ data: diaryRecordToData(saved) });
      return { ...saved, _id: latestRecord._id };
    }

    throw setError;
  }
  return saved;
}
