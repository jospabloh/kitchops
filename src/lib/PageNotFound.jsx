import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { LogoWordmark } from "@/components/Logo";

// Base44 scaffold until 2026-08-22: English copy on Tailwind's numeric `slate`
// scale, which tailwind.config.js replaces with a two-value token — so
// `bg-slate-50` and friends compiled to nothing and this page rendered
// unstyled. It also carried a builder-facing note about asking the AI to
// implement the page, which is not something a restaurant's admin should read.
export default function PageNotFound() {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6">
      <LogoWordmark size={30} />

      <div className="w-full max-w-md text-center">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-slate-dim">
          404
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-tight text-foreground">
          Esta pantalla no existe
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate">
          No hay nada en{" "}
          <span className="money rounded-sm bg-muted px-1.5 py-0.5 text-foreground">
            {pathname}
          </span>
          . Puede que el enlace esté mal escrito o que la sección se haya movido.
        </p>

        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver al tablero
        </Link>
      </div>
    </div>
  );
}
