export function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

export function placeholderDisplayName(userId: string): string {
  return userId.slice(0, 80);
}
