import { CLOUD_COLLECTIONS, getCloudDb } from '../config/cloud';
import { CustomOptionRecord } from '../types/diary';
import { normalizeOptionName } from '../utils/categoryOptions';

function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash >>>= 0;
  }
  return hash.toString(36);
}

function sanitizeDocIdPart(value: string): string {
  const readable = value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 24) || 'x';
  return `${readable}_${stableHash(value)}`;
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

export async function deleteCustomOption(categoryId: string, name: string): Promise<void> {
  const normalizedCategoryId = categoryId.trim();
  const normalizedName = normalizeOptionName(name);
  if (!normalizedCategoryId || !normalizedName) return;

  const db = getCloudDb();
  const collection = db.collection(CLOUD_COLLECTIONS.customOptions);
  const res = await collection
    .where({ categoryId: normalizedCategoryId, normalizedName })
    .limit(20)
    .get();

  if (res.data.length === 0) {
    await collection.doc(customOptionDocId(normalizedCategoryId, normalizedName)).remove();
    return;
  }

  for (const item of res.data as Array<{ _id?: string }>) {
    if (item._id) await collection.doc(item._id).remove();
  }
}
