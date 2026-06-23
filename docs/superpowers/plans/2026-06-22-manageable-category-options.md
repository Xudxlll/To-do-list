# Manageable Category Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn “今天干什么” into a shared, cloud-backed option catalog where every option can be created, edited, permanently deleted, searched, collapsed, and dragged within or across fixed subcategories, while diary auto-tagging uses the same catalog and creation path.

**Architecture:** Keep `CATEGORIES` as the preset fallback and build a cloud override layer in `custom_options`. Put catalog merge/validation/search/reorder logic in pure utilities, keep cloud pagination and writes in a service, and let both `index` and `diary-edit` consume the same final catalog plus the same `createSharedOption` operation.

**Tech Stack:** WeChat Mini Program TypeScript, Skyline, Glass-Easel, `wx.cloud` database, local storage cache, native touch events for drag-and-drop, Node-based TypeScript check scripts, `npx --no-install tsc --noEmit`.

---

## Scope And Working-Tree Guard

This plan implements `docs/superpowers/specs/2026-06-22-manageable-category-options-design.md`.

The worktree already contains uncommitted diary mood, clear-draft, and tag-editing changes. Do not reset, replace, or stage unrelated files. Before every task, run `git status --short`; each task commit must list only the files named in that task.

The fixed subcategories remain defined in `miniprogram/data/categories.ts`. The implementation does not add subcategory CRUD, deleted-item recovery, or historical diary tag rewrites.

## File Structure

- Create `miniprogram/types/options.ts`: legacy, managed-option, group-order, catalog snapshot, editor input, and search-result types.
- Modify `miniprogram/data/categories.ts`: add stable `groupId` to every runtime option while keeping old share-data validation compatible.
- Create `miniprogram/utils/optionCatalog.ts`: merge presets and cloud records, normalize input, generate stable IDs, validate names, search the whole catalog, and reconcile selected snapshots.
- Modify `miniprogram/utils/optionOrder.ts`: add pure same-group and cross-group reorder output while preserving legacy local order reading.
- Replace `miniprogram/services/customOptions.ts`: paginate all catalog records, cache successful reads, and expose shared create/update/delete/order operations.
- Modify `miniprogram/pages/index/index.ts|wxml|wxss`: management mode, option editor, deletion, global search, collapse state, and drag interaction.
- Modify `miniprogram/types/diary.ts`: add candidate subgroup metadata and move option-catalog types out of the diary module.
- Modify `miniprogram/utils/diaryTags.ts` and `miniprogram/utils/diaryTagEditing.ts`: match the final catalog by stable ID and require subgroup selection for candidates.
- Modify `miniprogram/pages/diary-edit/diary-edit.ts|wxml|wxss`: select candidate category/group, use shared creation, and stop diary submission when catalog sync fails.
- Modify `miniprogram/pages/result/result.ts|wxml` only if compile or regression checks show description snapshots are not rendered safely.
- Create `scripts/check-option-catalog.js`, `scripts/check-option-management.js`, `scripts/check-option-service.js`, and `scripts/check-diary-option-sync.js`.
- Modify `scripts/check-diary-tags.js` and `scripts/check-category-options.js` for the new model.

---

### Task 1: Catalog Types And Preset Group Identity

**Files:**
- Create: `miniprogram/types/options.ts`
- Modify: `miniprogram/data/categories.ts`
- Modify: `miniprogram/types/diary.ts`
- Create: `scripts/check-option-catalog.js`

- [ ] **Step 1: Write the failing catalog model check**

Create `scripts/check-option-catalog.js` using the repository's existing TypeScript require hook. The first assertions must require `groupId` on preset options and the new record shapes:

```js
const { CATEGORIES } = require('../miniprogram/data/categories.ts');
const { buildCatalog } = require('../miniprogram/utils/optionCatalog.ts');

const preset = CATEGORIES.find(category => category.id === 'eat');
assert(preset.optionGroups[0].options[0].groupId === 'cuisine', '默认选项应携带稳定 groupId');

const catalog = buildCatalog([
  {
    recordType: 'option',
    optionId: preset.optionGroups[0].options[0].id,
    categoryId: 'eat',
    groupId: 'hotpot',
    source: 'preset',
    name: '改名湘菜',
    normalizedName: '改名湘菜',
    description: '新的描述',
    deleted: false,
    createdAt: 1,
    updatedAt: 2,
  },
]);
const moved = catalog.find(category => category.id === 'eat').optionGroups
  .find(group => group.id === 'hotpot').options
  .find(option => option.name === '改名湘菜');
assert(moved && moved.description === '新的描述', '覆盖记录应改名、改描述并跨组移动默认项');
```

- [ ] **Step 2: Run the check and verify RED**

Run: `node scripts/check-option-catalog.js`

Expected: FAIL because `utils/optionCatalog.ts` does not exist or preset options have no `groupId`.

- [ ] **Step 3: Add option catalog types**

Create `miniprogram/types/options.ts` with these exported interfaces:

```ts
export interface LegacyCustomOptionRecord {
  _id?: string;
  categoryId: string;
  name: string;
  normalizedName: string;
  createdAt: number;
}

export interface ManagedOptionRecord {
  _id?: string;
  recordType: 'option';
  optionId: string;
  categoryId: string;
  groupId: string;
  source: 'preset' | 'custom';
  name: string;
  normalizedName: string;
  description: string;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GroupOrderRecord {
  _id?: string;
  recordType: 'group_order';
  categoryId: string;
  groupId: string;
  optionIds: string[];
  updatedAt: number;
}

export type OptionCatalogRecord = LegacyCustomOptionRecord | ManagedOptionRecord | GroupOrderRecord;

export interface SharedOptionInput {
  categoryId: string;
  groupId: string;
  name: string;
  description?: string;
}
```

Remove `CustomOptionRecord` from `types/diary.ts`; import option-specific types from `types/options.ts` wherever needed.

- [ ] **Step 4: Give every runtime option a stable group ID**

Change `Option` and `opts` in `data/categories.ts`:

```ts
export interface Option {
  id: string;
  groupId: string;
  name: string;
  emoji: string;
  isCustom: boolean;
  description?: string;
}

return {
  id: `${categoryId}_${groupId}_${i}`,
  groupId,
  name,
  emoji: '',
  isCustom: false,
  description,
};
```

Keep `isValidOption` backward compatible by not requiring `groupId` when decoding older shared links.

- [ ] **Step 5: Implement the minimal preset clone in `optionCatalog.ts` and verify GREEN**

Create `miniprogram/utils/optionCatalog.ts` with `clonePresetCatalog()` and an initial `buildCatalog(records)` implementation that clones presets, applies managed overrides by `optionId`, creates legacy options in `other`, filters `deleted`, moves options by `groupId`, then rebuilds each category's flat `options` array.

Run: `node scripts/check-option-catalog.js`

Expected: `option catalog checks passed`.

- [ ] **Step 6: Compile and commit**

Run: `npx --no-install tsc --noEmit`

Commit only Task 1 files:

```bash
git add miniprogram/types/options.ts miniprogram/types/diary.ts miniprogram/data/categories.ts miniprogram/utils/optionCatalog.ts scripts/check-option-catalog.js
git commit -m "feat: add managed option catalog model"
```

---

### Task 2: Deterministic Merge, Validation, Search, And Selection Reconciliation

**Files:**
- Modify: `miniprogram/utils/optionCatalog.ts`
- Modify: `scripts/check-option-catalog.js`
- Modify: `scripts/check-category-options.js`

- [ ] **Step 1: Extend the failing check**

Add cases for a tombstone, complete group order, legacy migration, duplicate validation, global description search, and stable selection reconciliation:

```js
assert(!deletedCatalog.find(c => c.id === 'eat').options.some(o => o.id === deletedId), '删除记录不应重新出现');
assertEqual(orderedGroup.options.map(o => o.id), ['third', 'first', 'second'], '应应用云端完整顺序');
assert(validateOptionInput(catalog, { categoryId: 'eat', groupId: 'cuisine', name: '  湘菜  ' }).code === 'duplicate', '应拦截同类重名');
assert(searchCatalog(catalog, '清甜')[0].option.name === '椰子鸡', '应匹配描述');
assert(reconcileSelections([{ id: option.id, name: '旧名', emoji: '', isCustom: false }], catalog)[0].name === option.name, '应按稳定 ID 刷新当前选择');
```

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/check-option-catalog.js`

Expected: FAIL at the first missing behavior.

- [ ] **Step 3: Implement pure catalog helpers**

Export these exact APIs from `optionCatalog.ts`:

```ts
export function buildCatalog(records: OptionCatalogRecord[], legacyOrderMap: OptionOrderMap = {}): Category[];
export function normalizeOptionName(name: string): string;
export function validateOptionInput(categories: Category[], input: SharedOptionInput, excludeOptionId?: string): { ok: boolean; code: 'ok' | 'empty' | 'too_long' | 'description_too_long' | 'category' | 'group' | 'duplicate' };
export function createStableOptionId(now: number = Date.now(), randomPart: string = Math.random().toString(36).slice(2, 10)): string;
export function findOptionByName(categories: Category[], categoryId: string, name: string): Option | null;
export function searchCatalog(categories: Category[], query: string): OptionSearchResult[];
export function reconcileSelections(selections: Option[], categories: Category[]): Option[];
```

`buildCatalog` must apply records in this order: preset clone, legacy records, latest managed record per `optionId`, tombstone filtering, group-order filtering, append missing live IDs, flat `options` rebuild. `searchCatalog` must return category/group names and match normalized name or description.

- [ ] **Step 4: Run checks and compile**

Run:

```bash
node scripts/check-option-catalog.js
node scripts/check-category-options.js
npx --no-install tsc --noEmit
```

Expected: both scripts print their passed messages; TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/optionCatalog.ts scripts/check-option-catalog.js scripts/check-category-options.js
git commit -m "feat: merge and search option catalog"
```

---

### Task 3: Shared Cloud Catalog Service And Cache

**Files:**
- Modify: `miniprogram/services/customOptions.ts`
- Create: `scripts/check-option-service.js`

- [ ] **Step 1: Write a failing service check with a fake database**

The fake collection must return 20 records on page one and 3 on page two. Assert pagination, deterministic document keys, shared validation, and cache writes:

```js
const records = await listOptionCatalogRecords(fakeDb);
assertEqual(records.length, 23, '应分页读取全部记录');
assertEqual(fakeDb.skips, [0, 20], '应使用固定页长继续读取');

const created = await createSharedOption(input, categories, fakeDb, { now: 100, randomPart: 'abc' });
assertEqual(created.id, 'option_2s_abc', '新选项应使用稳定 ID');
assert(fakeDb.saved.some(item => item.recordType === 'option' && item.groupId === input.groupId), '应保存完整选项记录');
```

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/check-option-service.js`

Expected: FAIL because the service APIs do not exist.

- [ ] **Step 3: Replace name-derived upsert with shared catalog operations**

Export these APIs from `services/customOptions.ts`:

```ts
export async function listOptionCatalogRecords(db = getCloudDb()): Promise<OptionCatalogRecord[]>;
export function readOptionCatalogCache(): OptionCatalogRecord[];
export function saveOptionCatalogCache(records: OptionCatalogRecord[]): void;
export async function createSharedOption(input: SharedOptionInput, categories: Category[], db = getCloudDb(), idParts?: { now: number; randomPart: string }): Promise<Option>;
export async function updateSharedOption(option: Option, input: SharedOptionInput, categories: Category[], db = getCloudDb()): Promise<Option>;
export async function deleteSharedOption(option: Option, categoryId: string, db = getCloudDb()): Promise<void>;
export async function saveSharedGroupOrders(categoryId: string, groups: OptionGroup[], db = getCloudDb()): Promise<void>;
```

Use page size 20 with `skip(offset).limit(20)` until a short page. Save managed options at `managed_<optionId>` and group orders at `order_<categoryId>_<groupId>` after sanitizing ID parts. `createSharedOption` and `updateSharedOption` must call `validateOptionInput` before writing. `deleteSharedOption` writes a tombstone instead of removing the document. Cache only after a successful complete list or successful mutation.

Keep temporary compatibility exports `listCustomOptions` and `upsertCustomOptions` only until Task 6 migrates the diary caller; remove them in Task 7.

- [ ] **Step 4: Run service checks and compile**

Run:

```bash
node scripts/check-option-service.js
node scripts/check-option-catalog.js
npx --no-install tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/services/customOptions.ts scripts/check-option-service.js
git commit -m "feat: add shared option catalog service"
```

---

### Task 4: Pure Management State, Collapse, And Cross-Group Reorder

**Files:**
- Modify: `miniprogram/utils/optionOrder.ts`
- Create: `miniprogram/utils/optionManagement.ts`
- Create: `scripts/check-option-management.js`

- [ ] **Step 1: Write failing state checks**

Test collapse state independently per category and cross-group moves at start, middle, and end:

```js
const collapsed = collapseAllGroups({}, 'eat', groups);
assert(groups.every(group => collapsed[`eat:${group.id}`]), '全部收起应只影响当前大分类');
const reopened = toggleGroup(collapsed, 'eat', groups[0].id);
assert(reopened[`eat:${groups[0].id}`] === false, '应能单独展开子分类');

const move = moveOptionAcrossGroups(groups, 'a', 'hotpot', 1);
assertEqual(move.groups[0].options.map(o => o.id), ['b'], '源分组应移除选项');
assertEqual(move.groups[1].options.map(o => o.id), ['c', 'a', 'd'], '目标分组应按落点插入');
assert(move.moved.groupId === 'hotpot', '跨组后应更新 groupId');
```

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/check-option-management.js`

Expected: FAIL because the management APIs are missing.

- [ ] **Step 3: Implement exact state APIs**

Create `optionManagement.ts`:

```ts
export type CollapsedGroupMap = Record<string, boolean>;

export function groupCollapseKey(categoryId: string, groupId: string): string {
  return `${categoryId}:${groupId}`;
}

export function toggleGroup(state: CollapsedGroupMap, categoryId: string, groupId: string): CollapsedGroupMap;
export function collapseAllGroups(state: CollapsedGroupMap, categoryId: string, groups: OptionGroup[]): CollapsedGroupMap;
export function isGroupCollapsed(state: CollapsedGroupMap, categoryId: string, groupId: string): boolean;
```

Add to `optionOrder.ts`:

```ts
export interface MoveAcrossGroupsResult {
  groups: OptionGroup[];
  moved: Option;
  sourceGroupId: string;
  targetGroupId: string;
}

export function moveOptionAcrossGroups(groups: OptionGroup[], optionId: string, targetGroupId: string, targetIndex: number): MoveAcrossGroupsResult;
```

Clamp `targetIndex`, clone every changed object, remove the source before calculating the final insertion index, and return unchanged clones for invalid input.

- [ ] **Step 4: Verify and commit**

Run:

```bash
node scripts/check-option-management.js
node scripts/check-option-order.js
npx --no-install tsc --noEmit
```

Commit:

```bash
git add miniprogram/utils/optionManagement.ts miniprogram/utils/optionOrder.ts scripts/check-option-management.js
git commit -m "feat: add option collapse and cross-group reorder"
```

---

### Task 5: Index Page CRUD, Search, Collapse, And Drag UI

**Files:**
- Modify: `miniprogram/pages/index/index.ts`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Create: `scripts/check-option-management-ui.js`

- [ ] **Step 1: Write a failing UI contract check**

Read the three page files and assert the required bindings/classes exist:

```js
assert(wxml.includes('bind:tap="openOptionEditor"'), '每个子分类应有新增入口');
assert(wxml.includes('bind:tap="collapseAllOptionGroups"'), '应有全部收起操作');
assert(wxml.includes('bind:input="onCatalogSearchInput"'), '应有全局搜索输入');
assert(wxml.includes('catch:longpress="onOptionDragStart"'), '管理模式应有长按拖动手柄');
assert(wxml.includes('option-desc'), '描述应沿用现有名称下方样式');
assert(ts.includes('createSharedOption') && ts.includes('updateSharedOption') && ts.includes('deleteSharedOption'), '页面应使用统一云服务');
```

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/check-option-management-ui.js`

Expected: FAIL at the first missing UI contract.

- [ ] **Step 3: Replace page data with catalog-driven state**

In `index.ts`, keep existing share hydration and selection summary methods, then add these fields:

```ts
catalogRecords: [] as OptionCatalogRecord[],
manageMode: false,
collapsedGroups: {} as CollapsedGroupMap,
searchQuery: '',
searchResults: [] as OptionSearchResult[],
editorVisible: false,
editorMode: 'create' as 'create' | 'edit',
editingOptionId: '',
editorGroupId: '',
editorName: '',
editorDescription: '',
editorSaving: false,
draggingOptionId: '',
dragSourceGroupId: '',
dragTargetGroupId: '',
dragTargetIndex: -1,
dragY: 0,
```

Replace `loadCustomCategoryOptions` with `loadOptionCatalog`: render cached records first, fetch complete cloud records, rebuild categories, reconcile `app.globalData.selections`, save reconciled selections, and refresh the current category.

- [ ] **Step 4: Add editor and deletion methods**

Implement `openOptionEditor`, `openEditOption`, `closeOptionEditor`, `onEditorNameInput`, `onEditorDescriptionInput`, `saveOptionEditor`, and `confirmDeleteOption`. Both create and edit must keep the form open on failure and map validation codes to Chinese messages. Delete must show a confirmation containing the option name and remove the deleted stable ID from all local selections only after cloud success.

- [ ] **Step 5: Add collapse and search methods**

Implement `toggleOptionGroup`, `collapseAllOptionGroups`, `onCatalogSearchInput`, `clearCatalogSearch`, and `selectSearchResult`. Persist `collapsedGroups` under `categoryCollapsedGroups:v1`. Selecting a result must clear search, switch category, expand its group, select the stable option, then call `wx.createSelectorQuery().select('#option-' + option.id).boundingClientRect()` and scroll the right pane to the item.

- [ ] **Step 6: Add native drag lifecycle**

Implement `onOptionDragStart`, `onOptionDragMove`, and `onOptionDragEnd`. On start, query all `.option-group-dropzone` and `.option-item` rectangles and store a snapshot. On move, update a fixed drag ghost, choose the rectangle containing `clientY`, compute insertion index by item midpoint, highlight the target group, and auto-expand a collapsed target after 500 ms. On end, call `moveOptionAcrossGroups`, save both affected complete group orders with `saveSharedGroupOrders`, update `groupId` through `updateSharedOption` for cross-group moves, and restore the pre-drag groups if either cloud write fails.

- [ ] **Step 7: Update WXML and WXSS**

Keep the current option card markup and `.option-desc`. Add:

- a compact search row plus icon buttons for collapse-all and management;
- clickable subgroup headers with chevrons and a `＋` icon button;
- management-only drag handle, edit icon, and delete icon;
- an unframed search result list showing `大分类 · 子分类`;
- a bottom editor modal with name input, optional description textarea, category/group context, cancel, and save;
- fixed drag ghost, source placeholder, target-group highlight, loading and empty states.

Use existing pink accent variables, card radius at or below 8 px, stable icon-button dimensions, and no nested cards.

- [ ] **Step 8: Run page checks and compile**

Run:

```bash
node scripts/check-option-management-ui.js
node scripts/check-option-catalog.js
node scripts/check-option-management.js
npx --no-install tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add miniprogram/pages/index/index.ts miniprogram/pages/index/index.wxml miniprogram/pages/index/index.wxss scripts/check-option-management-ui.js
git commit -m "feat: manage shared activity options"
```

---

### Task 6: Diary Recognition And Shared Candidate Creation

**Files:**
- Modify: `miniprogram/types/diary.ts`
- Modify: `miniprogram/utils/diaryTags.ts`
- Modify: `miniprogram/utils/diaryTagEditing.ts`
- Modify: `miniprogram/pages/diary-edit/diary-edit.ts`
- Modify: `miniprogram/pages/diary-edit/diary-edit.wxml`
- Modify: `miniprogram/pages/diary-edit/diary-edit.wxss`
- Modify: `scripts/check-diary-tags.js`
- Create: `scripts/check-diary-option-sync.js`

- [ ] **Step 1: Write failing diary catalog checks**

Cover existing stable matches, deleted-item exclusion through the final catalog, required group selection, candidate-to-existing conversion, and sync failure:

```js
const matched = recognizeDiaryTagsForDiary('晚上去吃湘菜', '', catalog);
assert(matched[0].optionId === existing.id && matched[0].source !== 'candidate', '已有标签应复用稳定 ID');

const candidate = prepareEditableDiaryTags(recognizeDiaryTagsForDiary('去吃新菜馆', '', catalog))[0];
assert(candidate.groupId === '' && candidate.editable, '新标签保存前应选择子分类');

const rebound = updateEditableDiaryTagName([candidate], 0, existing.name, catalog)[0];
assert(rebound.optionId === existing.id && rebound.source !== 'candidate', '改成已有名称后应绑定已有选项');

await assertRejects(() => syncDiaryCandidateTags(tags, catalog, failingCreate), '同步失败应阻止日记提交');
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node scripts/check-diary-tags.js
node scripts/check-diary-option-sync.js
```

Expected: at least one new assertion fails because subgroup metadata and unified sync are missing.

- [ ] **Step 3: Extend recognized-tag state**

Add to `RecognizedTag`:

```ts
groupId: string;
groupName: string;
```

Existing option matches copy `option.groupId`; candidates start with an empty `groupId`. Location candidates keep suggested category `goout` but no implicit subgroup.

- [ ] **Step 4: Make tag editing catalog-aware**

Change editing APIs to accept the final catalog. Name or category changes must look up a normalized existing option; a match replaces the candidate ID/source/group metadata. A non-match stays a candidate and clears an invalid previous group. Add `updateEditableDiaryTagGroup(tags, index, group)`.

- [ ] **Step 5: Add a pure sync coordinator**

Export from `diaryTagEditing.ts`:

```ts
export async function syncDiaryCandidateTags(
  tags: EditableRecognizedTag[],
  categories: Category[],
  createOption: (input: SharedOptionInput, categories: Category[]) => Promise<Option>
): Promise<EditableRecognizedTag[]>;
```

Reject candidates without a valid group. Process candidates sequentially, call the injected shared creator, and replace each candidate with the returned stable option. Do not swallow errors.

- [ ] **Step 6: Update the diary confirmation panel**

Load records with `listOptionCatalogRecords`, build the same final catalog, and show category plus subgroup pickers only for candidates. Existing matches remain read-only and directly selectable/removable. The confirm button is disabled while any candidate lacks a group.

In `confirmSave`, call `syncDiaryCandidateTags` before photo upload and `saveDiary`. On failure, keep `tagPanelVisible` open, keep every draft/photo field unchanged, show a retryable error, and return without uploading photos or saving the diary. Historical `DiaryTag` storage remains `{ categoryId, optionId, name, isCustom }` so later catalog edits do not rewrite old diary snapshots.

- [ ] **Step 7: Verify and commit**

Run:

```bash
node scripts/check-diary-tags.js
node scripts/check-diary-tag-editing.js
node scripts/check-diary-option-sync.js
node scripts/check-diary-clear-draft.js
node scripts/check-diary-moods.js
npx --no-install tsc --noEmit
```

Commit only the diary-sync files, preserving all pre-existing diary changes:

```bash
git add miniprogram/types/diary.ts miniprogram/utils/diaryTags.ts miniprogram/utils/diaryTagEditing.ts miniprogram/pages/diary-edit/diary-edit.ts miniprogram/pages/diary-edit/diary-edit.wxml miniprogram/pages/diary-edit/diary-edit.wxss scripts/check-diary-tags.js scripts/check-diary-option-sync.js
git commit -m "feat: sync diary tags with shared options"
```

---

### Task 7: Remove Legacy Paths And Run Full Regression

**Files:**
- Modify: `miniprogram/services/customOptions.ts`
- Modify: `miniprogram/utils/categoryOptions.ts`
- Modify: `miniprogram/utils/optionOrder.ts`
- Modify: `miniprogram/pages/result/result.ts` only if required by compile/runtime checks
- Modify: `miniprogram/pages/result/result.wxml` only if required by description rendering checks
- Modify: `scripts/check-share-data-validation.js` if a new backward-compatibility case is needed

- [ ] **Step 1: Prove no production caller uses the legacy API**

Run:

```bash
rg -n "listCustomOptions|upsertCustomOptions|deleteCustomOption|mergeCustomOptions|buildCustomOptionId" miniprogram
```

Expected: only compatibility implementations remain; page and diary callers use the catalog APIs.

- [ ] **Step 2: Remove compatibility exports and duplicate merge code**

Delete legacy service exports once the search is clean. Make `categoryOptions.ts` either re-export `normalizeOptionName` for remaining safe callers or migrate those callers to `optionCatalog.ts`; do not leave two merge implementations. Keep legacy local order reading only as the first-load migration fallback.

- [ ] **Step 3: Run the complete automated verification**

Run:

```bash
npx --no-install tsc --noEmit
node scripts/check-diary-date-utils.js
node scripts/check-diary-tags.js
node scripts/check-diary-tag-editing.js
node scripts/check-diary-option-sync.js
node scripts/check-diary-clear-draft.js
node scripts/check-diary-moods.js
node scripts/check-category-options.js
node scripts/check-option-catalog.js
node scripts/check-option-service.js
node scripts/check-option-management.js
node scripts/check-option-management-ui.js
node scripts/check-option-order.js
node scripts/check-safety-guards.js
node scripts/check-share-data-validation.js
node scripts/check-locked-plan-service.js
git diff --check
```

Expected: every script prints its pass message, TypeScript exits 0, and `git diff --check` has no output.

- [ ] **Step 4: Manual WeChat DevTools verification**

Verify these exact flows on desktop and a narrow phone viewport:

1. Add an option with and without description from every subgroup `＋` entry.
2. Edit a preset option, refresh, and confirm the stable selection remains selected.
3. Permanently delete a preset and a custom option; confirm neither returns after reload.
4. Drag within one subgroup, across expanded groups, and onto a collapsed group; confirm order on the second experience account.
5. Collapse one group and all groups; switch categories and return to confirm local collapse state.
6. Search by name and description; select a result and confirm category switch, expansion, scrolling, and selection count.
7. Save a diary that matches an existing option; confirm no duplicate cloud record.
8. Save a diary candidate after choosing category and subgroup; confirm it appears in “今天干什么” on both accounts.
9. Simulate a catalog write failure; confirm diary content, location, moods, local photos, and uploaded-photo draft references remain intact.
10. Confirm long descriptions wrap without overlapping controls in normal, management, search, and diary confirmation states.

- [ ] **Step 5: Inspect final scope and commit cleanup**

Run `git status --short` and `git diff --stat`. Confirm no `.superpowers/`, `.codex/`, `AGENTS.md`, private config, or unrelated diary files are staged.

Commit only cleanup and compatibility files:

```bash
git add miniprogram/services/customOptions.ts miniprogram/utils/categoryOptions.ts miniprogram/utils/optionOrder.ts scripts/check-share-data-validation.js
git commit -m "refactor: retire legacy custom option paths"
```

If `result.ts`, `result.wxml`, or `check-share-data-validation.js` did not require changes, omit them from `git add` rather than touching them.
