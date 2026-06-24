/**
 * filterMapper
 * ------------
 * Maps PostgreSQL `data_type` strings to AG Grid filter configuration.
 *
 * Nothing here is hardcoded per table — filters are derived purely from the
 * column's data type, so any schema (mock or real) produces correct filters
 * automatically.
 */

// AG Grid Community filter component names.
const TEXT = 'agTextColumnFilter';
const NUMBER = 'agNumberColumnFilter';
const DATE = 'agDateColumnFilter';
const SET = 'agSetColumnFilter'; // NOTE: Set Filter is Enterprise; see fallback below.

/**
 * Resolve a PostgreSQL data type to an AG Grid filter type.
 *
 * Mapping (per spec):
 *   character varying / text  -> Text Filter
 *   integer / numeric         -> Number Filter
 *   date / timestamp          -> Date Filter
 *   boolean                   -> Set Filter
 *
 * @param {string} dataType
 * @returns {string} AG Grid filter component name
 */
export function getFilterType(dataType) {
  const t = (dataType || '').toLowerCase();

  if (t.includes('char') || t === 'text' || t.includes('uuid')) return TEXT;
  if (t === 'integer' || t === 'bigint' || t === 'smallint') return NUMBER;
  if (t === 'numeric' || t === 'decimal' || t.includes('double') || t === 'real') return NUMBER;
  if (t === 'date' || t.includes('timestamp') || t.includes('time')) return DATE;
  if (t === 'boolean') return SET;

  // Unknown types fall back to a text filter.
  return TEXT;
}

/**
 * Build the full filter-related column properties for a given data type:
 * the filter component, "Multi Filter"-style floating filter, and any
 * type-specific params (e.g. date comparator).
 *
 * @param {string} dataType
 * @returns {object} partial colDef with filter config
 */
export function buildFilterConfig(dataType) {
  const filter = getFilterType(dataType);

  const config = {
    filter,
    // Floating filters give the "multi filter" feel: an always-visible input
    // under each header in addition to the menu filter.
    floatingFilter: true,
    filterParams: {
      buttons: ['apply', 'reset', 'clear'],
      closeOnApply: true,
    },
  };

  if (filter === DATE) {
    config.filterParams = {
      ...config.filterParams,
      // AG Grid date filter compares Date objects against cell values.
      comparator: dateComparator,
      browserDatePicker: true,
    };
  }

  if (filter === SET) {
    // Set Filter is an Enterprise feature. In Community it gracefully degrades
    // to a text filter; we set the type to text so boolean columns stay usable
    // without an Enterprise license.
    config.filter = TEXT;
  }

  return config;
}

/**
 * Comparator AG Grid uses for date filtering. Cell values are ISO strings
 * (date or timestamp); this parses them to a comparable date-only value.
 */
function dateComparator(filterLocalDateAtMidnight, cellValue) {
  if (cellValue == null) return -1;
  const cellDate = new Date(cellValue);
  if (Number.isNaN(cellDate.getTime())) return -1;

  // Compare date-only (ignore time-of-day) to match the date picker semantics.
  const cellMidnight = new Date(
    cellDate.getFullYear(),
    cellDate.getMonth(),
    cellDate.getDate()
  );

  if (cellMidnight < filterLocalDateAtMidnight) return -1;
  if (cellMidnight > filterLocalDateAtMidnight) return 1;
  return 0;
}
