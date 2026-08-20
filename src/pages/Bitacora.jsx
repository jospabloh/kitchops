import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { fechaHora } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MessageCircle, Monitor, ScrollText, Search, Server } from "lucide-react";

const ORIGEN = {
  app: { icono: Monitor, etiqueta: "En la app", clase: "text-slate" },
  whatsapp: { icono: MessageCircle, etiqueta: "Por WhatsApp", clase: "text-copper" },
  mission_control: { icono: Server, etiqueta: "Soporte ACACIA", clase: "text-navy-high" },
  cron: { icono: Server, etiqueta: "Automático", clase: "text-slate-dim" },
};

// Who did what, and from where.
//
// The `origen` column is the reason this screen exists rather than being a
// nice-to-have: once a bot can write to the books from a phone, "el sistema
// registró un gasto de $4,200" needs an answer, and the answer is a row here
// naming the number that sent the message. AuditLog is append-only and
// admin-write-only precisely so this record can't be edited by the people it
// records.
export default function Bitacora() {
  const { user } = useAuth();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState("todos");

  const cargar = useCallback(async () => {
    if (!user?.business_id) return;
    setCargando(true);
    try {
      const rows = await base44.entities.AuditLog.filter(
        { business_id: user.business_id }, "-occurred_at", 500,
      );
      setFilas(rows || []);
    } catch (e) {
      console.error(e);
      setFilas([]);
    } finally {
      setCargando(false);
    }
  }, [user?.business_id]);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtroOrigen !== "todos" && (f.source || "app") !== filtroOrigen) return false;
      if (!q) return true;
      return (
        (f.summary || "").toLowerCase().includes(q) ||
        (f.actor_email || "").toLowerCase().includes(q) ||
        (f.action || "").toLowerCase().includes(q)
      );
    });
  }, [filas, busqueda, filtroOrigen]);

  return (
    <div>
      <PageHeader
        title="Bitácora"
        description="Quién hizo qué, cuándo y desde dónde. Incluye todo lo que entra por WhatsApp."
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-dim" aria-hidden="true" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por persona o por lo que hizo"
            className="pl-9"
            aria-label="Buscar en la bitácora"
          />
        </div>
        <Select value={filtroOrigen} onValueChange={setFiltroOrigen}>
          <SelectTrigger className="sm:w-48" aria-label="Filtrar por origen">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">De todos lados</SelectItem>
            <SelectItem value="app">En la app</SelectItem>
            <SelectItem value="whatsapp">Por WhatsApp</SelectItem>
            <SelectItem value="mission_control">Soporte ACACIA</SelectItem>
            <SelectItem value="cron">Automático</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {cargando ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-card" />)}
        </div>
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={filas.length === 0 ? "Todavía no hay movimientos" : "Nada coincide"}
          body={
            filas.length === 0
              ? "En cuanto alguien registre un gasto, mueva inventario o cambie algo, queda anotado aquí."
              : "Prueba con otra búsqueda o cambia el filtro."
          }
        />
      ) : (
        <ol className="overflow-hidden rounded-lg border border-border bg-card">
          {visibles.map((f) => {
            const origen = ORIGEN[f.source || "app"] || ORIGEN.app;
            const Icono = origen.icono;
            return (
              <li key={f.id} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <Icono className={cn("mt-0.5 h-4 w-4 shrink-0", origen.clase)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-chalk">{f.summary || f.action}</p>
                  <p className="mt-0.5 font-mono text-[0.6875rem] text-slate-dim">
                    {f.actor_email || "sistema"} · {origen.etiqueta} · {f.action}
                  </p>
                </div>
                <time className="shrink-0 font-mono text-[0.6875rem] text-slate-dim" dateTime={f.occurred_at}>
                  {fechaHora(f.occurred_at || f.created_date)}
                </time>
              </li>
            );
          })}
        </ol>
      )}

      {!cargando && filas.length >= 500 && (
        <p className="mt-4 text-center text-xs text-slate-dim">
          Mostrando los 500 movimientos más recientes.
        </p>
      )}
    </div>
  );
}
