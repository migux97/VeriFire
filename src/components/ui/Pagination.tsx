import { useEffect, useState } from 'react';
import { Icon } from './Icon';

// One page of `items`. When the list shrinks (a search, a transfer), the page moves back so it is never empty.
export function usePagination<T>(items: readonly T[], pageSize: number) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const [page, setPage] = useState(1);
  const current = Math.min(page, pages);

  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  return {
    page: current,
    pages,
    items: items.slice((current - 1) * pageSize, current * pageSize),
    setPage
  };
}

interface PaginationProps {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  label: string;
}

// Hidden while everything fits in one page.
export function Pagination({ page, pages, onPage, label }: PaginationProps) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label={label}>
      <button className="button button-secondary" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <Icon name="fa-solid fa-chevron-left" /> Anterior
      </button>
      <span aria-live="polite">Página {page} de {pages}</span>
      <button className="button button-secondary" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Siguiente <Icon name="fa-solid fa-chevron-right" />
      </button>
    </nav>
  );
}
