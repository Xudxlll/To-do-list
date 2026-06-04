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
    const data: Partial<DiaryRecord> = { ...saved };
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
    return { ...created, _id: String(addRes._id) };
  } catch (e) {
    const latest = await getDiaryByDate(record.date);
    if (!latest || !latest._id) throw e;
    const saved: DiaryRecord = {
      ...record,
      _id: latest._id,
      createdAt: latest.createdAt || now,
      updatedAt: Date.now(),
    };
    const data: Partial<DiaryRecord> = { ...saved };
    delete data._id;
    await collection.doc(latest._id).update({ data });
    return saved;
  }
}
