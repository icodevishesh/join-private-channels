import Button from './Button';
import Icon from './Icon';

export default function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-4 py-2.5 sm:px-5">
      <p className="text-sm text-zinc-500">
        {from}–{to} of <span className="font-medium text-zinc-700">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <Icon name="chevronLeft" />
        </Button>
        <span className="text-sm text-zinc-600">
          {page} / {pages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <Icon name="chevronRight" />
        </Button>
      </div>
    </div>
  );
}
