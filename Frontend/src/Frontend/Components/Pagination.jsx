import React, { useEffect, useState } from 'react';

/**
 * Shared pagination bar (Bootstrap styling).
 *
 *   « ‹  1 … 12 13 [14] 15 16 … 31  › »   Go to [ ] page   Rows [10 ▾]
 *
 * Props
 *  page, totalPages, total, limit       – values from the API's `pagination`
 *  onPageChange(page)                   – called with a valid 1-based page
 *  onLimitChange(limit)  (optional)     – shows the page-size selector
 *  itemLabel             (optional)     – e.g. "customers"
 *  pageSizeOptions       (optional)     – default [10, 25, 50, 100]
 */
const buildPageList = (page, totalPages, windowSize = 5) => {
  if (totalPages <= windowSize + 2) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const half = Math.floor(windowSize / 2);
  let start = Math.max(2, page - half);
  let end   = Math.min(totalPages - 1, page + half);
  // keep the window size constant near the edges
  if (page - half < 2)              end   = Math.min(totalPages - 1, 1 + windowSize);
  if (page + half > totalPages - 1) start = Math.max(2, totalPages - windowSize);

  const pages = [1];
  if (start > 2) pages.push('…start');
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < totalPages - 1) pages.push('…end');
  pages.push(totalPages);
  return pages;
};

const Pagination = ({
  page = 1,
  totalPages = 0,
  total = 0,
  limit = 10,
  onPageChange,
  onLimitChange,
  itemLabel = 'records',
  pageSizeOptions = [10, 25, 50, 100],
}) => {
  const [jump, setJump] = useState('');
  useEffect(() => { setJump(''); }, [page]);

  const safeTotalPages = Math.max(0, Number(totalPages) || 0);
  const safePage       = Math.min(Math.max(1, Number(page) || 1), Math.max(1, safeTotalPages));
  const from = total === 0 ? 0 : (safePage - 1) * limit + 1;
  const to   = Math.min(safePage * limit, total);

  const go = (p) => {
    const target = Math.min(Math.max(1, p), Math.max(1, safeTotalPages));
    if (target !== safePage) onPageChange(target);
  };

  const submitJump = (e) => {
    e.preventDefault();
    const n = parseInt(jump, 10);
    if (Number.isFinite(n)) go(n);
  };

  const isFirst = safePage <= 1;
  const isLast  = safePage >= safeTotalPages;

  return (
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 p-3 border-top">
      <div className="text-muted small">
        {total === 0
          ? `No ${itemLabel}`
          : <>Showing {from}–{to} of <strong>{total}</strong> {itemLabel}</>}
      </div>

      <div className="d-flex flex-wrap align-items-center gap-2">
        {onLimitChange && (
          <div className="d-flex align-items-center gap-1">
            <span className="text-muted small">Rows</span>
            <select
              className="form-select form-select-sm"
              style={{ width: 72 }}
              value={limit}
              aria-label="Rows per page"
              onChange={(e) => onLimitChange(parseInt(e.target.value, 10))}
            >
              {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}

        {safeTotalPages > 1 && (
          <>
            <nav aria-label="Pagination">
              <ul className="pagination pagination-sm mb-0">
                <li className={`page-item ${isFirst ? 'disabled' : ''}`}>
                  <button type="button" className="page-link" onClick={() => go(1)} aria-label="First page" disabled={isFirst}>
                    <i className="bi bi-chevron-double-left" />
                  </button>
                </li>
                <li className={`page-item ${isFirst ? 'disabled' : ''}`}>
                  <button type="button" className="page-link" onClick={() => go(safePage - 1)} aria-label="Previous page" disabled={isFirst}>
                    <i className="bi bi-chevron-left" />
                  </button>
                </li>

                {buildPageList(safePage, safeTotalPages).map((p) =>
                  typeof p === 'string' ? (
                    <li key={p} className="page-item disabled"><span className="page-link">…</span></li>
                  ) : (
                    <li key={p} className={`page-item ${p === safePage ? 'active' : ''}`}>
                      <button
                        type="button"
                        className="page-link"
                        onClick={() => go(p)}
                        aria-current={p === safePage ? 'page' : undefined}
                      >
                        {p}
                      </button>
                    </li>
                  ),
                )}

                <li className={`page-item ${isLast ? 'disabled' : ''}`}>
                  <button type="button" className="page-link" onClick={() => go(safePage + 1)} aria-label="Next page" disabled={isLast}>
                    <i className="bi bi-chevron-right" />
                  </button>
                </li>
                <li className={`page-item ${isLast ? 'disabled' : ''}`}>
                  <button type="button" className="page-link" onClick={() => go(safeTotalPages)} aria-label="Last page" disabled={isLast}>
                    <i className="bi bi-chevron-double-right" />
                  </button>
                </li>
              </ul>
            </nav>

            <form className="d-flex align-items-center gap-1" onSubmit={submitJump}>
              <input
                type="number"
                min={1}
                max={safeTotalPages}
                className="form-control form-control-sm"
                style={{ width: 70 }}
                placeholder="Page"
                value={jump}
                aria-label="Go to page"
                onChange={(e) => setJump(e.target.value)}
              />
              <button type="submit" className="btn btn-sm btn-outline-secondary">Go</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default Pagination;
