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
    saved.push({ ...record, _id: String(addRes._id) });
  }

  return saved;
}
