import { Link, useLocation } from "react-router-dom";

export function BrandHeader() {
  const { pathname } = useLocation();

  if (pathname === "/") return null;

  return (
    <header className="px-4 pt-4 text-center">
      <Link
        to="/"
        className="inline-block rounded-lg px-3 py-1 font-display text-xl font-bold text-primary transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Fork Run — página inicial"
      >
        Fork Run
      </Link>
    </header>
  );
}
