import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionContext";
import { mensajeDeError } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Rail, Ticket } from "@/components/Ticket";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { CheckCheck, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

const FILTROS = [
  { id: "abiertas", label: "Por revisar" },
  { id: "todas", label: "Todas" },
];

// The rail, at full size. Same component the dashboard shows three of.
//
// Alerts here are open items you clear, not a log you scroll — which is why
// there is no "leídas" tab by default and why clearing one animates it off the
// rail. The archive is one click away for anyone who needs to check what was
// dismissed, but it isn't the default view, because a list that only grows is
// a list people stop opening.
export default function Alertas() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();

  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("abiertas");
  const [saliendo, setSaliendo] = useState({});
  const [recalculando, setRecalculando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);

  const puedeLeer = can("Alertas:mark_read");
  const puedeGenerar = can("Alertas:generate");

  const cargar = useCallback(async () => {
    if (!user?.business_id) return;
    setCargando(true);
    try {
      const rows = await base44.entities.Alerta.filter({ business_id: user.business_id }, "-fecha", 300);
      setAlertas(rows || []);
    } catch (e) {
      console.error(e);
      toast({ title: "No pudimos cargar las alertas", variant: "destructive" });
    } finally {
      setCargando(false);
    }
  }, [user?.business_id, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const orden = { rojo: 0, amarillo: 1, verde: 2 };
    const base = filtro === "abiertas" ? alertas.filter((a) => !a.leida) : alertas;
    return [...base].sort((a, b) => {
      // Unread first, then by severity, then newest — so the thing to deal with
      // is always top-left.
      if (Boolean(a.leida) !== Boolean(b.leida)) return a.leida ? 1 : -1;
      const s = (orden[a.severidad] ?? 3) - (orden[b.severidad] ?? 3);
      if (s !== 0) return s;
      return String(b.fecha || "").localeCompare(String(a.fecha || ""));
    });
  }, [alertas, filtro]);

  const abiertas = useMemo(() => alertas.filter((a) => !a.leida), [alertas]);

  const marcar = async (alerta) => {
    setSaliendo((s) => ({ ...s, [alerta.id]: true }));
    try {
      await base44.functions.invoke("alertas", { action: "markReadSafe", ids: [alerta.id] });
      setTimeout(() => {
        setAlertas((list) => list.map((a) => (a.id === alerta.id ? { ...a, leida: true } : a)));
        setSaliendo((s) => {
          const next = { ...s };
          delete next[alerta.id];
          return next;
        });
      }, 260);
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos marcarla"), variant: "destructive" });
      setSaliendo((s) => {
        const next = { ...s };
        delete next[alerta.id];
        return next;
      });
    }
  };

  const marcarTodas = async () => {
    setLimpiando(true);
    try {
      const r = await base44.functions.invoke("alertas", { action: "markReadSafe", all: true });
      toast({ title: `${r?.data?.marcadas ?? 0} alertas archivadas` });
      cargar();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos archivarlas"), variant: "destructive" });
    } finally {
      setLimpiando(false);
    }
  };

  const recalcular = async () => {
    setRecalculando(true);
    try {
      const r = await base44.functions.invoke("alertas", { action: "generarAlertasSafe" });
      const creadas = r?.data?.alertas_creadas ?? 0;
      toast({
        title: creadas === 0 ? "Nada nuevo" : `${creadas} ${creadas === 1 ? "alerta nueva" : "alertas nuevas"}`,
        description: creadas === 0 ? "Revisamos todo y no encontramos nada que no supieras ya." : undefined,
      });
      cargar();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos recalcular"), variant: "destructive" });
    } finally {
      setRecalculando(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Alertas"
        description="Gastos que se dispararon, depósitos que no llegaron, insumos por acabarse."
        action={
          <div className="flex gap-2">
            {puedeGenerar && (
              <Button variant="outline" onClick={recalcular} disabled={recalculando}>
                <RefreshCw className={cn("mr-2 h-4 w-4", recalculando && "animate-spin")} />
                Recalcular
              </Button>
            )}
            {puedeLeer && abiertas.length > 0 && (
              <Button variant="outline" onClick={marcarTodas} disabled={limpiando}>
                {limpiando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
                Archivar todas
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-6 flex gap-1 rounded-md border border-border bg-card p-1">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={cn(
              "flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              filtro === f.id ? "bg-steel-high text-chalk" : "text-slate hover:text-chalk",
            )}
          >
            {f.label}
            {f.id === "abiertas" && abiertas.length > 0 && (
              <span className="ml-2 font-mono text-[0.6875rem] text-copper">{abiertas.length}</span>
            )}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-lg border border-border bg-card" />)}
        </div>
      ) : visibles.length === 0 ? (
        filtro === "abiertas" ? (
          <div className="flex flex-col items-center rounded-lg border border-verde/25 bg-verde/10 px-6 py-14 text-center">
            <CheckCircle2 className="mb-3 h-8 w-8 text-verde" aria-hidden="true" />
            <h3 className="font-display text-lg font-semibold text-chalk">Todo en orden</h3>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate">
              Ningún depósito faltante, ningún insumo bajo el mínimo, ningún gasto disparado.
            </p>
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="Sin alertas"
            body="KitchOps revisa tus gastos, cortes e inventario cada noche. Cuando algo se salga de lo normal, aparece aquí."
          />
        )
      ) : (
        <Rail>
          {visibles.map((a, i) => (
            <div key={a.id} className={cn(a.leida && "opacity-55")}>
              <Ticket
                alerta={a}
                index={i}
                saliendo={Boolean(saliendo[a.id])}
                puedeLeer={puedeLeer && !a.leida}
                onLeer={marcar}
              />
            </div>
          ))}
        </Rail>
      )}
    </div>
  );
}
