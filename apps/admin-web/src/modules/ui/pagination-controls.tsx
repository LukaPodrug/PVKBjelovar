interface PaginationControlsProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function PaginationControls({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
}: PaginationControlsProps) {
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t-2 border-line bg-panel px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="font-medium text-muted">
        Prikaz {firstItem}-{lastItem} od {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          className="ui-pill ui-pill-button ui-pill--outline"
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Prethodna
        </button>
        <span className="px-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
          {page} / {totalPages}
        </span>
        <button
          className="ui-pill ui-pill-button ui-pill--outline"
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Sljedeća
        </button>
      </div>
    </div>
  );
}
