const DEFAULT_TTL_SECONDS = 60;

export function readMenuCacheTtlSeconds(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_TTL_SECONDS;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('MENU_CACHE_TTL_SECONDS must be a positive integer');
  }
  return parsed;
}
