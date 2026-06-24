const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION_NAME = 'custom_options';
const PAGE_SIZE = 100;
const ALLOWED_GROUPS = {
  eat: ['cuisine', 'hotpot', 'grill', 'snack', 'dessert', 'homecook', 'other'],
  drink: ['milk_tea', 'special_tea', 'coffee', 'fresh', 'night', 'other'],
  play: ['indoor', 'story', 'creative', 'pets', 'casual_play', 'shopping', 'other'],
  goout: ['mall', 'park', 'sea', 'culture', 'mountain', 'citywalk', 'other'],
  watch: ['cinema', 'series', 'anime', 'knowledge', 'live_show', 'other'],
  sport: ['daily', 'ball', 'water', 'outdoor', 'recovery', 'other'],
  home: ['cook', 'game', 'handmade', 'chores', 'rest', 'other'],
};

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionName(name) {
  return trimText(name).replace(/\s+/g, ' ').toLowerCase();
}

function stableHash(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash >>>= 0;
  }
  return hash.toString(36);
}

function sanitizeDocIdPart(value) {
  const readable = value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 24) || 'x';
  return `${readable}_${stableHash(value)}`;
}

function buildManagedDocId(optionId) {
  return `managed_${sanitizeDocIdPart(optionId)}`;
}

function buildOrderDocId(categoryId, groupId) {
  return `order_${sanitizeDocIdPart(categoryId)}_${sanitizeDocIdPart(groupId)}`;
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assertAuthorized(openid) {
  const rawAllowList = trimText(process.env.OPTION_ADMIN_OPENIDS || '');
  if (!rawAllowList) return;
  const allowed = rawAllowList.split(',').map(item => item.trim()).filter(Boolean);
  if (!allowed.includes(openid)) {
    fail('forbidden', '当前用户没有管理活动选项的权限');
  }
}

function assertAllowedGroup(categoryId, groupId) {
  const allowedGroups = ALLOWED_GROUPS[categoryId];
  if (!allowedGroups || !allowedGroups.includes(groupId)) {
    fail('group', '活动分组无效');
  }
}

function normalizeManagedRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('record', '活动记录无效');
  }

  const optionId = trimText(raw.optionId);
  const categoryId = trimText(raw.categoryId);
  const groupId = trimText(raw.groupId);
  const source = raw.source === 'preset' || raw.source === 'custom' ? raw.source : '';
  const name = trimText(raw.name);
  const description = trimText(raw.description || '');
  const normalizedName = normalizeOptionName(name);
  const createdAt = Number(raw.createdAt);
  const updatedAt = Number(raw.updatedAt);

  if (raw.recordType !== 'option' || !optionId || !categoryId || !groupId || !source || !name) {
    fail('record', '活动记录字段不完整');
  }
  if (name.length > 30) {
    fail('too_long', '活动名称最多 30 个字');
  }
  if (description.length > 160) {
    fail('description_too_long', '补充说明最多 160 个字');
  }
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) {
    fail('time', '活动记录时间无效');
  }
  assertAllowedGroup(categoryId, groupId);

  const expectedId = buildManagedDocId(optionId);
  return {
    _id: expectedId,
    recordType: 'option',
    optionId,
    categoryId,
    groupId,
    source,
    name,
    normalizedName,
    description,
    deleted: Boolean(raw.deleted),
    createdAt,
    updatedAt,
  };
}

function normalizeGroupOrderRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('record', '排序记录无效');
  }

  const categoryId = trimText(raw.categoryId);
  const groupId = trimText(raw.groupId);
  const updatedAt = Number(raw.updatedAt);
  if (raw.recordType !== 'group_order' || !categoryId || !groupId || !Array.isArray(raw.optionIds)) {
    fail('record', '排序记录字段不完整');
  }
  if (!Number.isFinite(updatedAt)) {
    fail('time', '排序记录时间无效');
  }
  assertAllowedGroup(categoryId, groupId);

  const optionIds = Array.from(new Set(raw.optionIds.map(trimText).filter(Boolean)));
  return {
    _id: buildOrderDocId(categoryId, groupId),
    recordType: 'group_order',
    categoryId,
    groupId,
    optionIds,
    updatedAt,
  };
}

function isDuplicateCandidate(candidate, record) {
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.recordType === 'option') {
    return !candidate.deleted && candidate.optionId !== record.optionId;
  }
  if ('recordType' in candidate) return false;
  const legacyId = `cloud_${trimText(candidate.categoryId)}_${normalizeOptionName(candidate.normalizedName || candidate.name)}`;
  return legacyId !== record.optionId;
}

function getDuplicateCandidateOptionId(candidate) {
  if (candidate.recordType === 'option') return trimText(candidate.optionId);
  return `cloud_${trimText(candidate.categoryId)}_${normalizeOptionName(candidate.normalizedName || candidate.name)}`;
}

function getDuplicateCandidateTime(candidate) {
  if (candidate.recordType === 'option') {
    const updatedAt = Number(candidate.updatedAt);
    if (Number.isFinite(updatedAt)) return updatedAt;
  }
  const createdAt = Number(candidate.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function compareDuplicateCandidates(left, right) {
  const timeDiff = getDuplicateCandidateTime(left) - getDuplicateCandidateTime(right);
  if (timeDiff !== 0) return timeDiff;
  return trimText(left._id).localeCompare(trimText(right._id));
}

function getLatestDuplicateCandidates(candidates) {
  const latest = new Map();
  candidates.forEach(candidate => {
    const optionId = getDuplicateCandidateOptionId(candidate);
    if (!optionId) return;
    const current = latest.get(optionId);
    if (!current || compareDuplicateCandidates(candidate, current) >= 0) {
      latest.set(optionId, candidate);
    }
  });
  return Array.from(latest.values());
}

function splitDocId(record) {
  const { _id, ...data } = record;
  return { id: _id, data };
}

async function assertNoDuplicate(record) {
  if (record.deleted) return;
  const candidates = [];
  let skip = 0;
  while (true) {
    const res = await db.collection(COLLECTION_NAME)
      .where({
        categoryId: record.categoryId,
        normalizedName: record.normalizedName,
      })
      .skip(skip)
      .limit(PAGE_SIZE)
      .get();
    const page = Array.isArray(res.data) ? res.data : [];
    candidates.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  if (getLatestDuplicateCandidates(candidates).some(candidate => isDuplicateCandidate(candidate, record))) {
    fail('duplicate', '这个活动已经存在了');
  }
}

async function saveOptionRecord(rawRecord) {
  const record = normalizeManagedRecord(rawRecord);
  await assertNoDuplicate(record);
  const { id, data } = splitDocId(record);
  await db.collection(COLLECTION_NAME).doc(id).set({ data });
  return record;
}

async function saveGroupOrders(rawRecords) {
  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    fail('record', '排序记录不能为空');
  }
  const records = rawRecords.map(normalizeGroupOrderRecord);
  await db.runTransaction(async transaction => {
    const collection = transaction.collection(COLLECTION_NAME);
    for (const record of records) {
      const { id, data } = splitDocId(record);
      await collection.doc(id).set({ data });
    }
  });
  return records;
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  assertAuthorized(wxContext.OPENID);

  const action = trimText(event.action);
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};

  if (action === 'createOption' || action === 'updateOption' || action === 'deleteOption') {
    const record = await saveOptionRecord(payload.record);
    return { ok: true, record };
  }

  if (action === 'saveGroupOrders') {
    const records = await saveGroupOrders(payload.records);
    return { ok: true, records };
  }

  fail('action', '未知的活动管理操作');
};
