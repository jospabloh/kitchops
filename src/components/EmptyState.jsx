import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// An empty screen is an invitation to act, not a shrug. Every use of this
// component says what goes here and offers the one action that fills it —
// "No hay datos" tells a person nothing they didn't already know from looking.
export default function EmptyState({ icon: Icon, title, body, actionLabel, onAction, className }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-steel-high">
          <Icon className="h-5 w-5 text-slate" aria-hidden="true" />
        </span>
      )}
      <h3 className="font-display text-lg font-semibold text-chalk">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate">{body}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-5">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
