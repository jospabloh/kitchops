import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { mensajeDeError } from "@/lib/format";
import AuthLayout from "@/components/AuthLayout";
import { Building2, Loader2, Plus } from "lucide-react";

// Remembered per browser session so the question is asked once, not on every
// render. sessionStorage rather than localStorage on purpose: "which restaurant
// am I working on today" is a per-sitting decision, and a stale answer carried
// across days is worse than one extra click.
export const TENANT_CHOSEN_KEY = "kitchops:tenant-chosen";

// Belonging to more than one restaurant means the app cannot guess whose
// numbers you meant to open — and the numbers look identical either way. With a
// single membership this screen never appears: confirming a choice you don't
// have is just a click in the way.
export default function SelectTenant({ onChosen }) {
  const { memberships, business, switchTenant } = useAuth();
  const [nombres, setNombres] = useState({});
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const entries = await Promise.all(
        (memberships || []).map(async (m) => {
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
  }, [memberships]);

  const elegir = async (businessId) => {
    setError("");
    setOcupado(businessId);
    try {
      // Already here — no need to round-trip switch-tenant just to confirm.
      if (businessId !== business?.id) await switchTenant(businessId);
      sessionStorage.setItem(TENANT_CHOSEN_KEY, businessId);
      onChosen?.();
    } catch (err) {
      setError(mensajeDeError(err, "No pudimos abrir ese negocio."));
      setOcupado("");
    }
  };

  return (
    <AuthLayout
      icon={Building2}
      title="¿Cuál abrimos?"
      subtitle="Perteneces a varios restaurantes. Elige con cuál vas a trabajar."
      footer={
        <a href="/onboarding" className="inline-flex items-center gap-1.5 text-copper hover:underline">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Crear o unirme a otro
        </a>
      }
    >
      {error && (
        <p role="alert" className="mb-4 rounded-md border border-rojo/30 bg-rojo/10 p-3 text-sm text-rojo">
          {error}
        </p>
      )}

      <div className="space-y-2">
        {(memberships || []).map((m) => (
          <button
            key={m.id || m.business_id}
            type="button"
            disabled={Boolean(ocupado)}
            onClick={() => elegir(m.business_id)}
            className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-copper hover:bg-steel-high disabled:opacity-60"
          >
            {ocupado === m.business_id ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-copper" />
            ) : (
              <Building2 className="h-4 w-4 shrink-0 text-slate-dim" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-base font-semibold text-chalk">
                {nombres[m.business_id] || "Cargando…"}
              </span>
              <span className="block text-xs text-slate">
                {m.role === "business_admin" ? "Dueño / gerente" : "Personal de cocina"}
              </span>
            </span>
          </button>
        ))}
      </div>
    </AuthLayout>
  );
}
