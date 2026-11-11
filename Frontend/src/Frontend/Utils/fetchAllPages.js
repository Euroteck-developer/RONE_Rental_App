// ─────────────────────────────────────────────────────────────────────────────
// fetchAllPages — load EVERY row of a paginated endpoint (no silent truncation)
//
// fetchPage({ page, limit }) must resolve to { items: [], pagination: { total, totalPages } }.
// The helper walks every page, then verifies that the number of rows received
// equals the server's `total`. If not (data changed mid-way, a page failed,
// or the hard cap was hit) it THROWS instead of returning a partial list, so a
// report can never be produced from incomplete data.
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_TIMEOUT = 60000;   // 60 s per page for report endpoints
const DEFAULT_PAGE_SIZE     = 500;
const HARD_ROW_CAP          = 200000;  // safety stop to protect the browser

export class IncompleteDataError extends Error {
  constructor(message, { expected, received } = {}) {
    super(message);
    this.name = 'IncompleteDataError';
    this.expected = expected;
    this.received = received;
  }
}

export const fetchAllPages = async (fetchPage, { pageSize = DEFAULT_PAGE_SIZE, onProgress } = {}) => {
  const all = [];
  let page = 1;
  let total = null;
  let totalPages = 1;

  do {
    // eslint-disable-next-line no-await-in-loop
    const { items, pagination } = await fetchPage({ page, limit: pageSize });
    all.push(...(items || []));
    if (pagination) {
      total      = Number(pagination.total ?? total ?? 0);
      totalPages = Number(pagination.totalPages ?? totalPages ?? 1);
    }
    if (onProgress) onProgress({ loaded: all.length, total });
    if (all.length > HARD_ROW_CAP) {
      throw new IncompleteDataError(
        `Too many rows (${total}). Please narrow the filters (month / customer) and try again.`,
        { expected: total, received: all.length },
      );
    }
    page += 1;
  } while (page <= totalPages);

  if (total !== null && all.length !== total) {
    throw new IncompleteDataError(
      `Data changed while loading (expected ${total} rows, received ${all.length}). Please try again.`,
      { expected: total, received: all.length },
    );
  }
  return all;
};

export default fetchAllPages;
