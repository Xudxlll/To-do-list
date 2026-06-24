const fs = require('fs');
const ts = require('typescript');

require.extensions['.ts'] = function registerTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(compiled, filename);
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertRejects(fn, message) {
  let caughtError = null;
  try {
    await fn();
  } catch (error) {
    caughtError = error;
  }
  assert(caughtError, message);
  return caughtError;
}

const { buildCatalog } = require('../miniprogram/utils/optionCatalog.ts');
const { recognizeDiaryTagsForDiary } = require('../miniprogram/utils/diaryTags.ts');
const {
  prepareEditableDiaryTags,
  updateEditableDiaryTagGroup,
  updateEditableDiaryTagName,
  syncDiaryCandidateTags,
} = require('../miniprogram/utils/diaryTagEditing.ts');

async function main() {
  const catalog = buildCatalog([]);
  const eatCategory = catalog.find(category => category.id === 'eat');
  const existing = eatCategory.options.find(option => option.name === '湘菜');
  const cuisineGroup = eatCategory.optionGroups.find(group => group.id === 'cuisine');

  const [candidate] = prepareEditableDiaryTags(recognizeDiaryTagsForDiary('去吃新菜馆', '', catalog));
  assert(candidate.groupId === '' && candidate.editable, '新标签保存前应选择子分类');
  assert(candidate.optionId.indexOf('cloud_') !== 0, '日记候选标签不应复用旧 cloud_* 选项 ID');
  assert(candidate.optionId.indexOf('diary_candidate_') === 0, '日记候选标签应使用日记专用临时 ID');

  const rebound = updateEditableDiaryTagName([candidate], 0, existing.name, catalog)[0];
  assert(rebound.optionId === existing.id && rebound.source !== 'candidate', '改成已有名称后应绑定已有选项');
  assert(rebound.groupId === existing.groupId && rebound.groupName === cuisineGroup.title, '绑定已有选项后应同步子分类元数据');

  const renamed = updateEditableDiaryTagName([candidate], 0, '新菜馆 plus', catalog)[0];
  assert(renamed.source === 'candidate' && renamed.groupId === '', '候选改成非已有名称时仍需重新选择子分类');

  const grouped = updateEditableDiaryTagGroup([candidate], 0, cuisineGroup)[0];
  assert(grouped.groupId === cuisineGroup.id && grouped.groupName === cuisineGroup.title, '候选标签应能选择固定子分类');

  await assertRejects(
    () => syncDiaryCandidateTags([candidate], catalog, async () => existing),
    '缺少子分类的候选标签应阻止同步'
  );

  const failingCreate = async () => {
    throw new Error('network down');
  };
  await assertRejects(
    () => syncDiaryCandidateTags([grouped], catalog, failingCreate),
    '同步失败应阻止日记提交'
  );

  const synced = await syncDiaryCandidateTags([grouped], catalog, async input => ({
    id: 'option_synced',
    groupId: input.groupId,
    name: input.name,
    emoji: '',
    isCustom: true,
    canDelete: true,
  }));
  assert(synced[0].optionId === 'option_synced', '同步成功后应替换为稳定 optionId');
  assert(synced[0].source !== 'candidate' && synced[0].editable, '同步成功后应退出候选态但仍允许继续修改');

  const firstGrouped = updateEditableDiaryTagGroup([candidate], 0, cuisineGroup)[0];
  const secondCandidate = updateEditableDiaryTagName([candidate], 0, '失败新菜馆', catalog)[0];
  const secondGrouped = updateEditableDiaryTagGroup([secondCandidate], 0, cuisineGroup)[0];
  let createCalls = 0;
  const partialError = await assertRejects(
    () => syncDiaryCandidateTags([firstGrouped, secondGrouped], catalog, async input => {
      createCalls += 1;
      if (createCalls === 2) throw new Error('network down');
      return {
        id: 'option_partial_success',
        groupId: input.groupId,
        name: input.name,
        emoji: '',
        isCustom: true,
        canDelete: true,
      };
    }),
    '部分候选同步失败时应整体阻止日记提交'
  );
  assert(createCalls === 2, '部分失败场景应先创建成功项再暴露后续失败');
  assert(Array.isArray(partialError.syncedTags), '部分失败错误应携带可回写的标签状态');
  assert(partialError.syncedTags[0].optionId === 'option_partial_success', '部分成功标签应回写为稳定 optionId');
  assert(partialError.syncedTags[0].source !== 'candidate', '部分成功标签应退出候选态，重试时不应重复创建');
  assert(partialError.syncedTags[1].source === 'candidate', '失败标签仍应保留候选态等待重试');
  assert(
    partialError.categories
      .find(category => category.id === 'eat')
      .options.some(option => option.id === 'option_partial_success'),
    '部分成功后的目录快照应包含已创建标签'
  );

  let retryCreateCalls = 0;
  const retried = await syncDiaryCandidateTags(partialError.syncedTags, partialError.categories, async input => {
    retryCreateCalls += 1;
    return {
      id: 'option_retry_success',
      groupId: input.groupId,
      name: input.name,
      emoji: '',
      isCustom: true,
      canDelete: true,
    };
  });
  assert(retryCreateCalls === 1, '部分失败后重试不应重复创建已经成功同步的标签');
  assert(retried[1].optionId === 'option_retry_success', '部分失败后重试应只补齐剩余候选标签');
}

main().then(() => {
  console.log('diary option sync checks passed');
});
