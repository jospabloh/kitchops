import React from "react";
import { cn } from "@/lib/utils";

// A figure with a label. The number is set in the condensed display face at a
// size that reads from arm's length — this gets glanced at on the pass, not
// studied at a desk.
//
// `sensitive` renders a locked placeholder instead of hiding the card entirely.
// A staff member who sees five cards where the owner sees seven learns the app
// is inconsistent; one who sees a card saying "sólo el dueño ve esto" learns
// where the line is. The value itself is never fetched for them — the gate is
// the server's, not this component's.
export default function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = "neutral",
  sensitive = false,
  className,
}) {
  const tones = {
    neutral: "text-chalk",
    copper: "text-copper",
    positive: "text-verde",
    negative: "text-rojo",
    warning: "text-amber",
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4",
        "transition-colors hover:border-navy-high",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {Icon && <Icon className={cn("h-4 w-4 shrink-0", sensitive ? "text-slate-dim" : tones[tone])} aria-hidden="true" />}
      </div>

      {sensitive ? (
        <p className="mt-2 text-sm text-slate-dim">Sólo el dueño ve esta cifra</p>
      ) : (
        <p className={cn("money mt-1.5 text-[1.75rem] font-semibold leading-none", tones[tone])}>{value}</p>
      )}

      {sublabel && !sensitive && <p className="mt-1.5 text-xs text-slate">{sublabel}</p>}
    </div>
  );
}
