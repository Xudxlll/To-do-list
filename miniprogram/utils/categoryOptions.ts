export function normalizeOptionName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}
