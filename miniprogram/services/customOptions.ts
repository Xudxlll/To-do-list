import { CLOUD_COLLECTIONS, getCloudDb } from '../config/cloud';
import { CustomOptionRecord } from '../types/diary';
import { normalizeOptionName } from '../utils/categoryOptions';

function sanitizeDocIdPart(value: string): string {
  const encoded = encodeURIComponent(value).replace(/%/g, '_');
  return encoded.replace(/[^A-Za-z0-9_-]/g, '_') || 'empty';
}

function customOptionDocId(categoryId: string, normalizedName: string): string {
  return `custom_${sanitizeDocIdPart(categoryId)}_${sanitizeDocIdPart(normalizedName)}`;
}

function normalizeRecord(raw: Partial<CustomOptionRecord>): CustomOptionRecord | null {
  const categoryId = typeof raw.categoryId === 'string' ? raw.categoryId.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!categoryId || !name) return null;

  const normalizedName = typeof raw.normalizedName === 'string' && raw.normalizedName.trim()
    ? normalizeOptionName(raw.normalizedName)
    : normalizeOptionName(name);
  if (!normalizedName) return null;

  return {
    ...raw,
    categoryId,
    name,
    normalizedName,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  };
}

export async function listCustomOptions(): Promise<CustomOptionRecord[]> {
  try {
    const db = getCloudDb();
    const res = await db.collection(CLOUD_COLLECTIONS.customOptions).limit(200).get();
    return (res.data || []).reduce((all, item) => {
      const record = normalizeRecord(item as Partial<CustomOptionRecord>);
      if (record) all.push(record);
      return all;
    }, [] as CustomOptionRecord[]);
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
    const categoryId = input.categoryId.trim();
    if (!categoryId) continue;
    const name = input.name.trim();
    if (!name) continue;
    const normalizedName = normalizeOptionName(name);
    if (!normalizedName) continue;
    const existed = await collection
      .where({ categoryId, normalizedName })
      .limit(1)
      .get();

    if (existed.data.length > 0) {
      saved.push(existed.data[0] as CustomOptionRecord);
      continue;
    }

    const record: CustomOptionRecord = {
      categoryId,
      name,
      normalizedName,
      createdAt: Date.now(),
    };
    const docId = customOptionDocId(categoryId, normalizedName);
    try {
      await collection.doc(docId).set({ data: record });
      saved.push({ ...record, _id: docId });
    } catch (e) {
      const latest = await collection
        .where({ categoryId, normalizedName })
        .limit(1)
        .get();
      if (latest.data.length > 0) {
        saved.push(latest.data[0] as CustomOptionRecord);
        continue;
      }
      throw e;
    }
  }

  return saved;
}
