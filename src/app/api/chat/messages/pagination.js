const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_OFFSET = 0;

export function normalizeMessagePagination(searchParams) {
  return {
    limit: readInteger(searchParams.get('limit'), {
      fallback: DEFAULT_LIMIT,
      min: 1,
      max: MAX_LIMIT
    }),
    offset: readInteger(searchParams.get('offset'), {
      fallback: DEFAULT_OFFSET,
      min: 0
    })
  };
}

function readInteger(value, { fallback, min, max }) {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(value)) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;

  return typeof max === 'number' ? Math.min(parsed, max) : parsed;
}
