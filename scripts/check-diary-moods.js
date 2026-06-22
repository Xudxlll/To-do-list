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

const {
  buildMoodSelections,
  getPrimaryMoodId,
  getInitialMoodState,
  normalizeMoodIds,
  toggleMoodSelection,
} = require('../miniprogram/utils/diaryMoods.ts');

const initialState = getInitialMoodState();
assert(initialState.mood === '', '新建日记时默认不应选择开心或任何心情');
assert(initialState.selectedMoodIds.length === 0, '新建日记时 selectedMoodIds 应为空');
assert(Object.keys(initialState.moodSelections).length === 0, '新建日记时心情选中映射应为空');

const unselected = toggleMoodSelection(['happy'], 'happy');
assert(unselected.length === 0, '点击最后一个已选心情后，应该允许变为未选择');
assert(getPrimaryMoodId(unselected) === '', '没有选择心情时，保存用主心情应为空');
assert(Object.keys(buildMoodSelections(unselected)).length === 0, '没有选择心情时，UI 不应有任何 active 心情');

const explicitEmpty = normalizeMoodIds([], 'happy');
assert(explicitEmpty.length === 0, '显式保存的空 moods 应保持为空，不能回填默认心情');

const legacyMood = normalizeMoodIds(undefined, 'calm');
assert(legacyMood.length === 1 && legacyMood[0] === 'calm', '旧数据只有 mood 时应继续按旧心情展示');

console.log('diary mood checks passed');
