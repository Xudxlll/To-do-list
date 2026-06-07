import { CLOUD_COLLECTIONS, getCloudDb } from '../config/cloud';
import { ShareData, validateShareData } from '../data/categories';

export interface LockedPlanRecord {
  _id?: string;
  date: string;
  shareData: ShareData;
  createdAt: number;
  updatedAt: number;
}

export function lockedPlanDocId(date: string): string {
  return `locked_plan_${date.replace(/[^0-9]/g, '_')}`;
}

export function normalizeLockedPlanRecord(raw: Partial<LockedPlanRecord>, date: string): LockedPlanRecord | null {
  if (!raw || raw.date !== date || !validateShareData(raw.shareData)) return null;
  return {
    ...raw,
    date,
    shareData: raw.shareData,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

export async function getLockedPlan(date: string): Promise<LockedPlanRecord | null> {
  const db = getCloudDb();
  try {
    const res = await db.collection(CLOUD_COLLECTIONS.lockedPlans).doc(lockedPlanDocId(date)).get();
    return normalizeLockedPlanRecord(res.data as Partial<LockedPlanRecord>, date);
  } catch (e) {
    console.warn('读取今日锁定计划失败', e);
    return null;
  }
}

export async function saveLockedPlan(date: string, shareData: ShareData): Promise<LockedPlanRecord> {
  const db = getCloudDb();
  const now = Date.now();
  const docId = lockedPlanDocId(date);
  const existing = await getLockedPlan(date);
  const record: LockedPlanRecord = {
    _id: docId,
    date,
    shareData,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };
  await db.collection(CLOUD_COLLECTIONS.lockedPlans).doc(docId).set({
    data: {
      date: record.date,
      shareData: record.shareData,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
  });
  return record;
}

export async function clearLockedPlan(date: string): Promise<void> {
  const db = getCloudDb();
  try {
    await db.collection(CLOUD_COLLECTIONS.lockedPlans).doc(lockedPlanDocId(date)).remove();
  } catch (e) {
    console.warn('清理今日锁定计划失败', e);
  }
}
