import React from "react";
import { cn } from "@/lib/utils";
import { haceRato } from "@/lib/format";
import { AlertTriangle, Check, PackageOpen, Receipt, TrendingUp, Wallet } from "lucide-react";

// The signature element. See the .rail / .ticket block in src/index.css for the
// reasoning: alerts in this app are open items you clear, exactly like tickets
// on an expediter's rail, so they are drawn as slips clipped to a rail rather
// than as rows in a table.
//
// Severity is carried by the clip colour AND by a word. Colour alone fails
// anyone who can't separate amber from red, and this is the screen where the
// difference decides whether you deal with it today.

const SEVERIDAD = {
  rojo: { clase: "ticket-rojo", etiqueta: "Urgente", texto: "text-rojo" },
  amarillo: { clase: "ticket-amber", etiqueta: "Revisar", texto: "text-amber" },
  verde: { clase: "ticket-verde", etiqueta: "Aviso", texto: "text-verde" },
};

const ICONO = {
  gasto_alto: TrendingUp,
  deposito_faltante: Wallet,
  stock_bajo: PackageOpen,
  ticket_pendiente: Receipt,
  pago_pendiente: Wallet,
};

export function Rail({ children, className }) {
  return <div className={cn("rail grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>{children}</div>;
}

export function Ticket({ alerta, onLeer, puedeLeer = true, saliendo = false, index = 0 }) {
  const sev = SEVERIDAD[alerta.severidad] || SEVERIDAD.amarillo;
  const Icono = ICONO[alerta.tipo] || AlertTriangle;

  return (
    <article
      className={cn("ticket animate-rise-in", sev.clase, saliendo && "ticket-leaving")}
      // Staggered reveal — one orchestrated page-load moment, not motion
      // sprinkled on every element.
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <span className="ticket-clip" aria-hidden="true" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icono className={cn("mt-0.5 h-4 w-4 shrink-0", sev.texto)} aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold leading-tight text-chalk">
              {alerta.titulo}
            </h3>
            <p className={cn("eyebrow mt-0.5", sev.texto)}>{sev.etiqueta}</p>
          </div>
        </div>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-slate">{alerta.mensaje}</p>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-2.5">
        <time className="font-mono text-[0.6875rem] text-slate-dim" dateTime={alerta.fecha}>
          {haceRato(alerta.fecha)}
        </time>
        {puedeLeer && (
          <button
            type="button"
            onClick={() => onLeer?.(alerta)}
            className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium text-slate transition-colors hover:bg-steel-high hover:text-chalk"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Listo
          </button>
        )}
      </div>
    </article>
  );
}
