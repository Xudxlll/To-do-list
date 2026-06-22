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

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}: expected ${e}, received ${a}`);
}

function buildGroups() {
  return [
    {
      id: 'food',
      title: '吃',
      options: [
        { id: 'a', groupId: 'food', name: 'A', emoji: '', isCustom: false },
        { id: 'b', groupId: 'food', name: 'B', emoji: '', isCustom: false },
        { id: 'c', groupId: 'food', name: 'C', emoji: '', isCustom: false },
      ],
    },
    {
      id: 'drink',
      title: '喝',
      options: [
        { id: 'd', groupId: 'drink', name: 'D', emoji: '', isCustom: false },
        { id: 'e', groupId: 'drink', name: 'E', emoji: '', isCustom: false },
        { id: 'f', groupId: 'drink', name: 'F', emoji: '', isCustom: false },
      ],
    },
    {
      id: 'play',
      title: '玩',
      options: [
        { id: 'g', groupId: 'play', name: 'G', emoji: '', isCustom: false },
      ],
    },
  ];
}

const { collapseAllGroups, groupCollapseKey, isGroupCollapsed, toggleGroup } = require('../miniprogram/utils/optionManagement.ts');
const { moveOptionAcrossGroups } = require('../miniprogram/utils/optionOrder.ts');

const collapsedBase = {
  [groupCollapseKey('drink', 'tea')]: true,
  [groupCollapseKey('play', 'game')]: true,
};
const collapsedBefore = JSON.parse(JSON.stringify(collapsedBase));
const foodGroups = buildGroups().slice(0, 2);
const collapsedAfterAll = collapseAllGroups('eat', foodGroups, collapsedBase);
assert(collapsedAfterAll !== collapsedBase, 'collapseAllGroups 应返回新对象');
assertEqual(collapsedBase, collapsedBefore, 'collapseAllGroups 不应修改原始状态');
assert(isGroupCollapsed('eat', 'food', collapsedAfterAll), 'collapseAllGroups 应折叠当前分类的第一个分组');
assert(isGroupCollapsed('eat', 'drink', collapsedAfterAll), 'collapseAllGroups 应折叠当前分类的第二个分组');
assert(isGroupCollapsed('drink', 'tea', collapsedAfterAll), 'collapseAllGroups 不应改动其他分类状态');
assert(isGroupCollapsed('play', 'game', collapsedAfterAll), 'collapseAllGroups 不应改动无关分类状态');
assert(!isGroupCollapsed('eat', 'missing', collapsedAfterAll), '未设置的分组应视为未折叠');

const toggledOff = toggleGroup('eat', 'food', collapsedAfterAll);
assert(!isGroupCollapsed('eat', 'food', toggledOff), 'toggleGroup 应能关闭已折叠状态');
assert(isGroupCollapsed('eat', 'drink', toggledOff), 'toggleGroup 不应影响同分类其他分组');
assert(isGroupCollapsed('drink', 'tea', toggledOff), 'toggleGroup 不应影响其他分类');
const toggledOn = toggleGroup('eat', 'food', toggledOff);
assert(isGroupCollapsed('eat', 'food', toggledOn), 'toggleGroup 应能重新打开折叠状态');
assert(toggledOff !== toggledOn, 'toggleGroup 应返回新对象');
assertEqual(toggledOff, JSON.parse(JSON.stringify(toggledOff)), 'toggleGroup 结果应可序列化');

const originalGroups = buildGroups();
const sameGroupDown = moveOptionAcrossGroups(originalGroups, 'a', 'food', 2);
assert(sameGroupDown.groups !== originalGroups, 'moveOptionAcrossGroups 应返回深克隆 groups');
assert(sameGroupDown.source !== null && sameGroupDown.target !== null, '同组移动应返回 source/target');
assert(sameGroupDown.source !== originalGroups[0], 'source 应是克隆对象');
assert(sameGroupDown.target !== originalGroups[0], 'target 应是克隆对象');
assertEqual(originalGroups[0].options.map(option => option.id), ['a', 'b', 'c'], 'moveOptionAcrossGroups 不应修改原始同组顺序');
assertEqual(sameGroupDown.groups[0].options.map(option => option.id), ['b', 'c', 'a'], '同组移动到尾部应按目标索引插入');
assert(sameGroupDown.moved && sameGroupDown.moved.groupId === 'food', '同组移动应保持 groupId');
assert(sameGroupDown.moved && sameGroupDown.moved !== originalGroups[0].options[0], 'moved 应是克隆对象');

const sameGroupUp = moveOptionAcrossGroups(originalGroups, 'c', 'food', 0);
assertEqual(sameGroupUp.groups[0].options.map(option => option.id), ['c', 'a', 'b'], '同组移动到头部应正确重排');

const crossToHead = moveOptionAcrossGroups(originalGroups, 'b', 'drink', 0);
assertEqual(crossToHead.groups[0].options.map(option => option.id), ['a', 'c'], '跨组移动应从源组移除选项');
assertEqual(crossToHead.groups[1].options.map(option => option.id), ['b', 'd', 'e', 'f'], '跨组移动到头部应插入目标组头部');
assert(crossToHead.moved && crossToHead.moved.groupId === 'drink', '跨组移动后 moved.groupId 应更新为目标组');

const crossToMiddle = moveOptionAcrossGroups(originalGroups, 'a', 'drink', 2);
assertEqual(crossToMiddle.groups[1].options.map(option => option.id), ['d', 'e', 'a', 'f'], '跨组移动到中间应插入指定位置');

const crossToTail = moveOptionAcrossGroups(originalGroups, 'c', 'drink', 99);
assertEqual(crossToTail.groups[1].options.map(option => option.id), ['d', 'e', 'f', 'c'], '跨组目标索引超出范围时应钳制到尾部');

const crossToNegative = moveOptionAcrossGroups(originalGroups, 'a', 'drink', -7);
assertEqual(crossToNegative.groups[1].options.map(option => option.id), ['a', 'd', 'e', 'f'], '跨组目标索引小于 0 时应钳制到头部');

const invalidOption = moveOptionAcrossGroups(originalGroups, 'missing', 'drink', 1);
assert(invalidOption.moved === null, '无效选项应返回 null moved');
assert(invalidOption.source === null && invalidOption.target === null, '无效选项应返回空 source/target');
assert(invalidOption.groups !== originalGroups, '无效选项也应返回克隆后的 groups');
assertEqual(invalidOption.groups, buildGroups(), '无效选项不应破坏 groups 内容');

const invalidGroup = moveOptionAcrossGroups(originalGroups, 'a', 'missing', 1);
assert(invalidGroup.moved === null, '无效分组应返回 null moved');
assert(invalidGroup.source === null && invalidGroup.target === null, '无效分组应返回空 source/target');
assertEqual(invalidGroup.groups, buildGroups(), '无效分组不应破坏 groups 内容');

const sameGroupClamp = moveOptionAcrossGroups(originalGroups, 'b', 'food', 999);
assertEqual(sameGroupClamp.groups[0].options.map(option => option.id), ['a', 'c', 'b'], '同组移动时目标索引也应钳制');
assertEqual(originalGroups[0].options.map(option => option.id), ['a', 'b', 'c'], '所有移动都不应修改传入参数');

const invalidNaN = moveOptionAcrossGroups(originalGroups, 'a', 'drink', Number.NaN);
assert(invalidNaN.moved === null, 'NaN 目标索引应视为无效操作');
assert(invalidNaN.source === null && invalidNaN.target === null, 'NaN 目标索引应返回空 source/target');
assert(invalidNaN.groups !== originalGroups, 'NaN 目标索引也应返回深克隆 groups');
assertEqual(invalidNaN.groups, buildGroups(), 'NaN 目标索引不应改变顺序');

const invalidInfinity = moveOptionAcrossGroups(originalGroups, 'a', 'drink', Number.POSITIVE_INFINITY);
assert(invalidInfinity.moved === null, 'Infinity 目标索引应视为无效操作');
assert(invalidInfinity.source === null && invalidInfinity.target === null, 'Infinity 目标索引应返回空 source/target');
assertEqual(invalidInfinity.groups, buildGroups(), 'Infinity 目标索引不应改变顺序');

const invalidNegativeInfinity = moveOptionAcrossGroups(originalGroups, 'a', 'drink', Number.NEGATIVE_INFINITY);
assert(invalidNegativeInfinity.moved === null, '-Infinity 目标索引应视为无效操作');
assert(invalidNegativeInfinity.source === null && invalidNegativeInfinity.target === null, '-Infinity 目标索引应返回空 source/target');
assertEqual(invalidNegativeInfinity.groups, buildGroups(), '-Infinity 目标索引不应改变顺序');

console.log('option management checks passed');
