import { Button } from "../ui";
export function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  if (pages < 2) return null;
  return (
    <nav className="communication-actions" aria-label="Phân trang">
      <Button
        variant="secondary"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        ← Trang trước
      </Button>
      <span>
        Trang {page}/{pages}
      </span>
      <Button
        variant="secondary"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Trang sau →
      </Button>
    </nav>
  );
}
