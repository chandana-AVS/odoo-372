import * as React from 'react';

/**
 * Flattens any value reachable from a row into a single lowercase haystack.
 * Dates are formatted the way the tables render them so that typing "12 Mar"
 * matches what the user actually sees on screen.
 */
function collect(value: unknown, out: string[], depth = 0) {
  if (value === null || value === undefined || depth > 4) return;

  if (typeof value === 'string') {
    out.push(value);
    // "MISSING_CHECKOUT" should also match a search for "missing checkout".
    if (value.includes('_')) out.push(value.replace(/_/g, ' '));
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
    return;
  }
  if (value instanceof Date) {
    out.push(value.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collect(item, out, depth + 1);
    }
  }
}

/** Build the searchable text for one row. */
export function haystack(row: unknown, fields?: (row: any) => unknown[]): string {
  const parts: string[] = [];
  collect(fields ? fields(row) : row, parts);
  return parts.join(' ').toLowerCase();
}

/**
 * Every whitespace-separated term must appear somewhere in the row, so
 * "aarav paid" narrows rather than widens. Quoted phrases stay intact.
 */
export function matches(text: string, query: string): boolean {
  const terms = query.toLowerCase().match(/"[^"]+"|\S+/g);
  if (!terms) return true;
  return terms.every((term) => text.includes(term.replace(/"/g, '')));
}

/**
 * Filter a list of rows against a query string.
 *
 * @param rows    the already-fetched rows (server paging is not in play here)
 * @param query   the raw text typed by the user
 * @param fields  optional narrowing — return only the values worth searching,
 *                which keeps ids and internal flags out of the haystack
 */
export function useSearch<T>(
  rows: T[] | undefined,
  query: string,
  fields?: (row: T) => unknown[],
): T[] {
  // Callers pass `fields` as an inline arrow, so it is a new function on every
  // render. Holding it in a ref keeps it out of the dependency list and lets
  // the memo actually cache between unrelated re-renders.
  const fieldsRef = React.useRef(fields);
  fieldsRef.current = fields;

  return React.useMemo(() => {
    const list = rows ?? [];
    const trimmed = query.trim();
    if (!trimmed) return list;
    return list.filter((row) => matches(haystack(row, fieldsRef.current), trimmed));
  }, [rows, query]);
}

/** Delay a fast-changing value — used by the global palette's API lookups. */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
