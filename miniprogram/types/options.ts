import type { Option } from '../data/categories';

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

export type OptionValidationCode =
  | 'ok'
  | 'empty'
  | 'too_long'
  | 'description_too_long'
  | 'category'
  | 'group'
  | 'duplicate';

export interface OptionValidationResult {
  ok: boolean;
  code: OptionValidationCode;
}

export interface OptionValidationInput {
  categoryId: string;
  groupId: string;
  name: string;
  description?: string;
}

export interface OptionSearchResult {
  categoryId: string;
  categoryName: string;
  groupId: string;
  groupName: string;
  option: Option;
}
