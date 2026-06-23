import { CATEGORIES, Category, Option } from '../data/categories';
import { CLOUD_COLLECTIONS, getCloudDb } from '../config/cloud';
import {
  GroupOrderRecord,
  LegacyCustomOptionRecord,
  ManagedOptionRecord,
  OptionCatalogRecord,
  SharedOptionInput,
} from '../types/options';
import { createStableOptionId, normalizeOptionName, validateOptionInput } from '../utils/optionCatalog';

const OPTION_CATALOG_CACHE_KEY = 'categoryOptionCatalog:v2';
const PAGE_SIZE = 20;

type SharedOptionIdParts = {
  now?: number;
  randomPart?: string;
};

type SharedGroupOrderInput = {
  groupId: string;
  optionIds: string[];
};

function createServiceError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

function buildManagedDocId(optionId: string): string {
  return `managed_${sanitizeDocIdPart(optionId)}`;
}

function buildOrderDocId(categoryId: string, groupId: string): string {
  return `order_${sanitizeDocIdPart(categoryId)}_${sanitizeDocIdPart(groupId)}`;
}

function getPresetCategory(categoryId: string): Category | undefined {
  return CATEGORIES.find(category => category.id === categoryId);
}

function isFixedGroup(categoryId: string, groupId: string): boolean {
  return Boolean(getPresetCategory(categoryId)?.optionGroups.some(group => group.id === groupId));
}

function cloneSerializableRecords(records: OptionCatalogRecord[]): OptionCatalogRecord[] {
  return JSON.parse(JSON.stringify(records)) as OptionCatalogRecord[];
}

function cloneLegacyRecord(record: LegacyCustomOptionRecord): LegacyCustomOptionRecord {
  return {
    ...record,
  };
}

function cloneManagedRecord(record: ManagedOptionRecord): ManagedOptionRecord {
  return {
    ...record,
  };
}

function cloneGroupOrderRecord(record: GroupOrderRecord): GroupOrderRecord {
  return {
    ...record,
    optionIds: [...record.optionIds],
  };
}

function normalizeLegacyRecord(raw: unknown): LegacyCustomOptionRecord | null {
  if (!isRecord(raw) || 'recordType' in raw) return null;

  const categoryId = trimText(raw.categoryId);
  const name = trimText(raw.name);
  const normalizedName = normalizeOptionName(trimText(raw.normalizedName) || name);
  if (!categoryId || !name || !normalizedName || !getPresetCategory(categoryId)) return null;

  return cloneLegacyRecord({
    _id: trimText(raw._id),
    categoryId,
    name,
    normalizedName,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  });
}

function normalizeManagedRecord(raw: unknown): ManagedOptionRecord | null {
  if (!isRecord(raw) || raw.recordType !== 'option') return null;

  const optionId = trimText(raw.optionId);
  const categoryId = trimText(raw.categoryId);
  const groupId = trimText(raw.groupId);
  const source = raw.source === 'preset' || raw.source === 'custom' ? raw.source : '';
  const name = trimText(raw.name);
  const normalizedName = normalizeOptionName(trimText(raw.normalizedName) || name);
  const description = trimText(raw.description);
  if (!optionId || !categoryId || !groupId || !source || !name || !normalizedName || !isFixedGroup(categoryId, groupId)) {
    return null;
  }

  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;
  const deleted = Boolean(raw.deleted);

  return cloneManagedRecord({
    _id: trimText(raw._id),
    recordType: 'option',
    optionId,
    categoryId,
    groupId,
    source,
    name,
    normalizedName,
    description,
    deleted,
    createdAt,
    updatedAt,
  });
}

function normalizeGroupOrderRecord(raw: unknown): GroupOrderRecord | null {
  if (!isRecord(raw) || raw.recordType !== 'group_order') return null;

  const categoryId = trimText(raw.categoryId);
  const groupId = trimText(raw.groupId);
  if (!Array.isArray(raw.optionIds)) {
    return null;
  }
  const optionIds = Array.from(new Set(raw.optionIds.map(trimText).filter(Boolean)));
  if (!categoryId || !groupId || !isFixedGroup(categoryId, groupId)) {
    return null;
  }

  return cloneGroupOrderRecord({
    _id: trimText(raw._id),
    recordType: 'group_order',
    categoryId,
    groupId,
    optionIds,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  });
}

function normalizeCatalogRecord(raw: unknown): OptionCatalogRecord | null {
  if (!isRecord(raw)) return null;
  if (raw.recordType === 'option') return normalizeManagedRecord(raw);
  if (raw.recordType === 'group_order') return normalizeGroupOrderRecord(raw);
  if ('recordType' in raw) return null;
  return normalizeLegacyRecord(raw);
}

function normalizeCatalogRecords(rawRecords: unknown[]): OptionCatalogRecord[] {
  return rawRecords.map(normalizeCatalogRecord).filter((record): record is OptionCatalogRecord => Boolean(record));
}

function cloneCatalogRecord(record: OptionCatalogRecord): OptionCatalogRecord {
  if ('recordType' in record) {
    if (record.recordType === 'option') return cloneManagedRecord(record);
    return cloneGroupOrderRecord(record);
  }
  return cloneLegacyRecord(record);
}

function cloneCatalogRecords(records: OptionCatalogRecord[]): OptionCatalogRecord[] {
  return records.map(cloneCatalogRecord);
}

function readStorageValue(key: string): unknown {
  try {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') return undefined;
    return wx.getStorageSync(key);
  } catch {
    return undefined;
  }
}

function writeStorageValue(key: string, value: unknown): void {
  try {
    if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') return;
    wx.setStorageSync(key, value);
  } catch {
    // 保留数据库写入结果，不让缓存异常反咬主流程。
  }
}

function findManagedRecord(records: OptionCatalogRecord[], optionId: string): ManagedOptionRecord | null {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if ('recordType' in record && record.recordType === 'option' && record.optionId === optionId) {
      return record;
    }
  }
  return null;
}

function replaceManagedRecord(records: OptionCatalogRecord[], nextRecord: ManagedOptionRecord): OptionCatalogRecord[] {
  const filtered = records.filter(record => !('recordType' in record && record.recordType === 'option' && record.optionId === nextRecord.optionId));
  return [...filtered, cloneManagedRecord(nextRecord)];
}

function replaceOrderRecords(records: OptionCatalogRecord[], nextRecords: GroupOrderRecord[]): OptionCatalogRecord[] {
  const nextKeys = new Set(nextRecords.map(record => `${record.categoryId}:${record.groupId}`));
  const filtered = records.filter(record => !('recordType' in record && record.recordType === 'group_order'
    && nextKeys.has(`${record.categoryId}:${record.groupId}`)));
  return [...filtered, ...nextRecords.map(cloneGroupOrderRecord)];
}

function getCatalogRecordKeys(record: OptionCatalogRecord): string[] {
  if ('recordType' in record) {
    if (record.recordType === 'option') {
      return [`option:${record.optionId}`];
    }
    return [`order:${record.categoryId}:${record.groupId}`];
  }

  const keys: string[] = [];
  if (record._id) {
    keys.push(`legacy:${record._id}`);
  }
  keys.push(`legacy:${record.categoryId}:${record.normalizedName}`);
  return keys;
}

function buildCatalogRecordKeyIndex(records: OptionCatalogRecord[]): Map<string, number> {
  const index = new Map<string, number>();
  records.forEach((record, recordIndex) => {
    getCatalogRecordKeys(record).forEach(key => {
      if (!index.has(key)) {
        index.set(key, recordIndex);
      }
    });
  });
  return index;
}

function mergeCatalogRecords(baseRecords: OptionCatalogRecord[], overlayRecords: OptionCatalogRecord[]): OptionCatalogRecord[] {
  const merged = cloneCatalogRecords(baseRecords);

  overlayRecords.forEach(record => {
    const overlayRecord = cloneCatalogRecord(record);
    const keyIndex = buildCatalogRecordKeyIndex(merged);
    const matchKey = getCatalogRecordKeys(overlayRecord).find(key => keyIndex.has(key));
    if (matchKey) {
      const matchIndex = keyIndex.get(matchKey);
      if (typeof matchIndex === 'number') {
        merged[matchIndex] = overlayRecord;
        return;
      }
    }
    merged.push(overlayRecord);
  });

  return merged;
}

let cacheMutationQueue: Promise<unknown> = Promise.resolve();
let cacheMutationVersion = 0;

function enqueueCatalogCacheMutation(
  mutate: (latest: OptionCatalogRecord[]) => OptionCatalogRecord[] | Promise<OptionCatalogRecord[]>,
  options: { bumpVersion?: boolean } = {}
): Promise<OptionCatalogRecord[]> {
  const bumpVersion = options.bumpVersion !== false;
  const task = cacheMutationQueue.then(async () => {
    const latest = cloneCatalogRecords(readOptionCatalogCache());
    const next = await mutate(latest);
    const saved = saveOptionCatalogCache(next);
    if (bumpVersion) {
      cacheMutationVersion += 1;
    }
    return saved;
  });
  cacheMutationQueue = task.then(() => undefined, () => undefined);
  return task;
}

async function getManagedRecordFromDb(db: any, optionId: string): Promise<ManagedOptionRecord | null> {
  try {
    const res = await db.collection(CLOUD_COLLECTIONS.customOptions).doc(buildManagedDocId(optionId)).get();
    return normalizeManagedRecord(res.data);
  } catch {
    return null;
  }
}

async function resolveManagedRecordForWrite(db: any, option: Option): Promise<ManagedOptionRecord | null> {
  const cached = findManagedRecord(readOptionCatalogCache(), option.id);
  if (cached) return cached;
  return getManagedRecordFromDb(db, option.id);
}

function buildFallbackManagedMetadata(option: Option): Pick<ManagedOptionRecord, 'source' | 'createdAt'> {
  return {
    source: option.isCustom ? 'custom' : 'preset',
    createdAt: Date.now(),
  };
}

function buildManagedRecord(
  optionId: string,
  input: SharedOptionInput,
  source: ManagedOptionRecord['source'],
  createdAt: number,
  updatedAt: number,
  deleted = false
): ManagedOptionRecord {
  const categoryId = trimText(input.categoryId);
  const groupId = trimText(input.groupId);
  const name = trimText(input.name);
  const description = trimText(input.description || '');
  return {
    _id: buildManagedDocId(optionId),
    recordType: 'option',
    optionId,
    categoryId,
    groupId,
    source,
    name,
    normalizedName: normalizeOptionName(name),
    description,
    deleted,
    createdAt,
    updatedAt,
  };
}

function buildOptionFromManagedRecord(record: ManagedOptionRecord): Option {
  return {
    id: record.optionId,
    groupId: record.groupId,
    name: record.name,
    emoji: '',
    isCustom: record.source === 'custom',
    canDelete: record.source === 'custom',
    description: record.description || undefined,
  };
}

function buildLegacyOptionId(categoryId: string, normalizedName: string): string {
  return `cloud_${categoryId}_${normalizedName}`;
}

function isDuplicateRecord(record: LegacyCustomOptionRecord | ManagedOptionRecord, excludeOptionId?: string): boolean {
  if ('recordType' in record) {
    return !record.deleted && record.optionId !== excludeOptionId;
  }
  const legacyOptionId = buildLegacyOptionId(record.categoryId, record.normalizedName);
  return legacyOptionId !== excludeOptionId;
}

async function assertNoLatestDuplicate(
  db: DB.Database,
  input: SharedOptionInput,
  excludeOptionId?: string
): Promise<void> {
  const categoryId = trimText(input.categoryId);
  const normalizedName = normalizeOptionName(input.name);
  const res = await db.collection(CLOUD_COLLECTIONS.customOptions)
    .where({ categoryId, normalizedName })
    .limit(PAGE_SIZE)
    .get();
  const duplicate = (Array.isArray(res.data) ? res.data : [])
    .map(raw => normalizeManagedRecord(raw) || normalizeLegacyRecord(raw))
    .filter((record): record is LegacyCustomOptionRecord | ManagedOptionRecord => Boolean(record))
    .some(record => isDuplicateRecord(record, excludeOptionId));
  if (duplicate) {
    throw createServiceError('duplicate', '共享标签保存失败：duplicate');
  }
}

export function readOptionCatalogCache(): OptionCatalogRecord[] {
  const value = readStorageValue(OPTION_CATALOG_CACHE_KEY);
  if (!Array.isArray(value)) return [];
  return cloneCatalogRecords(normalizeCatalogRecords(value)) as OptionCatalogRecord[];
}

export function saveOptionCatalogCache(records: OptionCatalogRecord[]): OptionCatalogRecord[] {
  const cloned = cloneSerializableRecords(cloneCatalogRecords(records));
  writeStorageValue(OPTION_CATALOG_CACHE_KEY, cloned);
  return cloned;
}

export async function listOptionCatalogRecords(db = getCloudDb()): Promise<OptionCatalogRecord[]> {
  const startVersion = cacheMutationVersion;
  const collection = db.collection(CLOUD_COLLECTIONS.customOptions);
  const records: OptionCatalogRecord[] = [];
  let skip = 0;

  while (true) {
    const res = await collection.orderBy('_id', 'asc').skip(skip).limit(PAGE_SIZE).get();
    const page = Array.isArray(res.data) ? res.data : [];
    records.push(...normalizeCatalogRecords(page));
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return enqueueCatalogCacheMutation(latest => {
    if (cacheMutationVersion === startVersion) {
      return records;
    }
    return mergeCatalogRecords(records, latest);
  }, { bumpVersion: false });
}

export async function createSharedOption(
  input: SharedOptionInput,
  categories: Category[],
  db = getCloudDb(),
  idParts: SharedOptionIdParts = {}
): Promise<Option> {
  const validation = validateOptionInput(categories, input);
  if (!validation.ok) {
    throw createServiceError(validation.code, `共享标签创建失败：${validation.code}`);
  }
  await assertNoLatestDuplicate(db, input);

  const now = typeof idParts.now === 'number' && Number.isFinite(idParts.now) ? idParts.now : Date.now();
  const optionId = createStableOptionId(now, idParts.randomPart);
  const record = buildManagedRecord(optionId, input, 'custom', now, now, false);
  await db.collection(CLOUD_COLLECTIONS.customOptions).doc(record._id as string).set({ data: record });

  await enqueueCatalogCacheMutation(latest => replaceManagedRecord(latest, record));
  return buildOptionFromManagedRecord(record);
}

export async function updateSharedOption(
  option: Option,
  input: SharedOptionInput,
  categories: Category[],
  db = getCloudDb()
): Promise<Option> {
  const validation = validateOptionInput(categories, input, option.id);
  if (!validation.ok) {
    throw createServiceError(validation.code, `共享标签更新失败：${validation.code}`);
  }
  await assertNoLatestDuplicate(db, input, option.id);

  const existing = await resolveManagedRecordForWrite(db, option);
  const fallback = buildFallbackManagedMetadata(option);
  const source: ManagedOptionRecord['source'] = existing ? existing.source : fallback.source;
  const createdAt = existing ? existing.createdAt : fallback.createdAt;
  const updatedAt = Date.now();
  const record = buildManagedRecord(option.id, input, source, createdAt, updatedAt, false);
  await db.collection(CLOUD_COLLECTIONS.customOptions).doc(record._id as string).set({ data: record });

  await enqueueCatalogCacheMutation(latest => replaceManagedRecord(latest, record));
  return buildOptionFromManagedRecord(record);
}

export async function deleteSharedOption(
  option: Option,
  categoryId: string,
  db = getCloudDb()
): Promise<ManagedOptionRecord> {
  const normalizedCategoryId = trimText(categoryId);
  if (!normalizedCategoryId || !getPresetCategory(normalizedCategoryId)) {
    throw createServiceError('category', '共享标签删除失败：分类无效');
  }

  const existing = await resolveManagedRecordForWrite(db, option);
  const fallback = buildFallbackManagedMetadata(option);
  const source: ManagedOptionRecord['source'] = existing ? existing.source : fallback.source;
  const createdAt = existing ? existing.createdAt : fallback.createdAt;
  const now = Date.now();
  const tombstone = buildManagedRecord(option.id, {
    categoryId: normalizedCategoryId,
    groupId: option.groupId,
    name: option.name,
    description: option.description || '',
  }, source, createdAt, now, true);

  await db.collection(CLOUD_COLLECTIONS.customOptions).doc(tombstone._id as string).set({ data: tombstone });
  await enqueueCatalogCacheMutation(latest => replaceManagedRecord(latest, tombstone));
  return tombstone;
}

export async function saveSharedGroupOrders(
  categoryId: string,
  groups: SharedGroupOrderInput[],
  db = getCloudDb()
): Promise<GroupOrderRecord[]> {
  const normalizedCategoryId = trimText(categoryId);
  const presetCategory = getPresetCategory(normalizedCategoryId);
  if (!normalizedCategoryId || !presetCategory) {
    throw createServiceError('category', '共享标签顺序保存失败：分类无效');
  }

  const fixedGroupIds = new Set(presetCategory.optionGroups.map(group => group.id));
  const normalizedGroups = groups.map(group => {
    const groupId = trimText(group.groupId);
    if (!fixedGroupIds.has(groupId)) {
      throw createServiceError('group', `共享标签顺序保存失败：${groupId || '空'} 不是固定分组`);
    }

    const optionIds = Array.isArray(group.optionIds)
      ? Array.from(new Set(group.optionIds.map(trimText).filter(Boolean)))
      : [];

    return {
      _id: buildOrderDocId(normalizedCategoryId, groupId),
      recordType: 'group_order' as const,
      categoryId: normalizedCategoryId,
      groupId,
      optionIds,
      updatedAt: Date.now(),
    };
  });

  const now = Date.now();
  const records = normalizedGroups.map(group => ({
    ...group,
    updatedAt: now,
  }));

  const runTransaction = (db as any).runTransaction;
  if (typeof runTransaction !== 'function') {
    throw createServiceError('transaction_unsupported', '共享标签顺序保存失败：当前环境不支持事务');
  }

  await runTransaction.call(db, async (transaction: any) => {
    const txCollection = transaction.collection(CLOUD_COLLECTIONS.customOptions);
    for (const record of records) {
      await txCollection.doc(record._id).set({ data: record });
    }
  });

  await enqueueCatalogCacheMutation(latest => replaceOrderRecords(latest, records));
  return records;
}
