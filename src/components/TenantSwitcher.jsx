import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { mensajeDeError } from "@/lib/format";
import { Building2, Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// The restaurant you are working in, made switchable when there is somewhere to
// switch to. With one membership it stays plain text: a dropdown arrow that
// opens a menu of one is a lie about what the app can do.
//
// Switching goes through switchTenant() → the switch-tenant function, which
// re-derives membership server-side before repointing business_id. Everything
// rendered here is a label.
export default function TenantSwitcher() {
  const { business, memberships, switchTenant } = useAuth();
  const [open, setOpen] = useState(false);
  const [nombres, setNombres] = useState({});
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const ref = useRef(null);

  const otros = (memberships || []).filter((m) => m.business_id !== business?.id);
  const puedeCambiar = (memberships || []).length > 1;

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (!open || otros.length === 0) return undefined;
    let cancelado = false;
    (async () => {
      const entries = await Promise.all(
        otros.map(async (m) => {
          try {
            const b = await base44.entities.Business.get(m.business_id);
            return [m.business_id, b?.name || "Negocio sin nombre"];
          } catch {
            return [m.business_id, "Negocio sin nombre"];
          }
        }),
      );
      if (!cancelado) setNombres(Object.fromEntries(entries));
    })();
    return () => { cancelado = true; };
     
  }, [open, memberships, business?.id]);

  const ir = async (businessId) => {
    setError("");
    setOcupado(businessId);
    try {
      await switchTenant(businessId);
      // Full reload rather than a re-render: every screen's data belongs to the
      // tenant that was active when it loaded, and re-mounting the tree is the
      // honest way to guarantee nothing from the previous restaurant is still
      // on screen.
      window.location.reload();
    } catch (err) {
      setError(mensajeDeError(err, "No pudimos cambiar de negocio."));
      setOcupado("");
    }
  };

  const nombre = business?.name || "KitchOps";

  if (!puedeCambiar) {
    return (
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-semibold uppercase tracking-wide text-chalk" title={nombre}>
          {nombre}
        </p>
        <p className="truncate text-[0.6875rem] text-slate-dim">KitchOps</p>
      </div>
    );
  }

  return (
    <div className="relative min-w-0 flex-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="-mx-1 flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-steel-high"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1">
            <span className="truncate font-display text-sm font-semibold uppercase tracking-wide text-chalk" title={nombre}>
              {nombre}
            </span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 text-slate-dim transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </span>
          <span className="block truncate text-[0.6875rem] text-slate-dim">Cambiar de negocio</span>
        </span>
      </button>

      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-60 rounded-lg border border-border bg-card p-1 shadow-xl">
          {error && <p className="px-2 py-1.5 text-xs text-rojo">{error}</p>}

          <div className="flex items-center gap-2 rounded-sm bg-steel-high px-2 py-2">
            <Check className="h-3.5 w-3.5 shrink-0 text-copper" aria-hidden="true" />
            <span className="truncate text-sm text-chalk">{nombre}</span>
          </div>

          {otros.map((m) => (
            <button
              key={m.id || m.business_id}
              role="menuitem"
              disabled={Boolean(ocupado)}
              onClick={() => ir(m.business_id)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors hover:bg-steel-high disabled:opacity-60"
            >
              {ocupado === m.business_id ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-copper" />
              ) : (
                <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-dim" aria-hidden="true" />
              )}
              <span className="truncate text-sm text-slate">{nombres[m.business_id] || "Cargando…"}</span>
            </button>
          ))}

          <a
            href="/onboarding"
            className="mt-1 flex w-full items-center gap-2 border-t border-border px-2 pb-2 pt-2.5 text-left transition-colors hover:bg-steel-high"
          >
            <Plus className="h-3.5 w-3.5 shrink-0 text-slate-dim" aria-hidden="true" />
            <span className="text-sm text-slate">Crear o unirme a otro</span>
          </a>
        </div>
      )}
    </div>
  );
}
