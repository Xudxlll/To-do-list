import { CLOUD_COLLECTIONS, getCloudDb } from '../config/cloud';
import { DiaryRecord } from '../types/diary';

function diaryDocId(date: string): string {
  return `diary_${date.replace(/[^0-9]/g, '_')}`;
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
  const db = getCloudDb();
  const collection = db.collection(CLOUD_COLLECTIONS.diaries);
  const existing = await getDiaryByDate(record.date);
  const now = Date.now();
  const docId = diaryDocId(record.date);
  const saved: DiaryRecord = {
    ...record,
    _id: docId,
    createdAt: existing && existing.createdAt ? existing.createdAt : record.createdAt || now,
    updatedAt: now,
  };

  const data: Partial<DiaryRecord> = { ...saved };
  delete data._id;
  await collection.doc(docId).set({ data });
  return saved;
}
