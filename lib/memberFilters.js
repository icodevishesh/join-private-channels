/** Reads Members page filters from a URL's query string. */
export function filtersFromSearchParams(sp) {
  return {
    search: (sp.get('search') ?? '').trim().slice(0, 100),
    show: sp.get('show') ?? '',
    sort: sp.get('sort') ?? 'verified_at',
    dir: sp.get('dir') ?? 'desc',
    page: Number(sp.get('page') ?? 1),
    pageSize: Number(sp.get('pageSize') ?? 25),
  };
}
