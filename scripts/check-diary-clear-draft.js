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

const { clearDiaryDraftFields } = require('../miniprogram/utils/diaryForm.ts');

const result = clearDiaryDraftFields({
  content: '今天一起吃了火锅',
  location: '深圳湾公园',
  localPhotoPaths: ['/tmp/one.jpg'],
  existingPhotoFileIds: ['cloud://diaries/2026-06-18/one.jpg'],
  mood: 'happy',
  selectedMoodIds: ['happy', 'calm'],
  moodSelections: { happy: true, calm: true },
});

assert(result.content === '', '清空草稿应清空今天发生了什么');
assert(result.location === '', '清空草稿应清空地点');
assert(result.localPhotoPaths.length === 0, '清空草稿应清空本地待上传照片');
assert(result.existingPhotoFileIds.length === 0, '清空草稿应清空页面中已有照片');
assert(result.mood === '', '清空草稿应清空主心情');
assert(result.selectedMoodIds.length === 0, '清空草稿应清空已选心情');
assert(Object.keys(result.moodSelections).length === 0, '清空草稿应清空心情选中映射');

console.log('diary clear draft checks passed');
