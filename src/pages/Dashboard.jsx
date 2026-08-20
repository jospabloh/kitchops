import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionContext";
import { fecha, inicioDeMes, money, moneySigned, semanaLegible } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { Rail, Ticket } from "@/components/Ticket";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  Package,
  Receipt,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";

// The one job of this screen: tell the owner what is bleeding money right now.
//
// That's why it opens with the alert rail rather than with a chart. A chart
// tells you what happened; the rail tells you what to do next, and the second
// question is the one someone opens this app at 11pm to answer. Totals come
// after, because they're the context for the rail, not the point of it.

export default function Dashboard() {
  const { user, business } = useAuth();
  const { can } = usePermissions();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [saliendo, setSaliendo] = useState({});

  const verFinanzas = can("Dashboard:financials");
  const simbolo = "$";

  const cargar = useCallback(async () => {
    if (!user?.business_id) return;
    setCargando(true);
    try {
      const scope = { business_id: user.business_id };
      const [gastos, ingresos, inventario, alertas] = await Promise.all([
        base44.entities.Gasto.filter(scope, "-fecha", 1000),
        base44.entities.IngresoPlataforma.filter(scope, "-created_date", 100),
        base44.entities.InventarioItem.filter(scope, "nombre", 500),
        base44.entities.Alerta.filter({ ...scope, leida: false }, "-fecha", 60),
      ]);
      setDatos({ gastos: gastos || [], ingresos: ingresos || [], inventario: inventario || [], alertas: alertas || [] });
    } catch (error) {
      console.error("No se pudo cargar el resumen:", error);
      setDatos({ gastos: [], ingresos: [], inventario: [], alertas: [] });
    } finally {
      setCargando(false);
    }
  }, [user?.business_id]);

  useEffect(() => { cargar(); }, [cargar]);

  const resumen = useMemo(() => {
    if (!datos) return null;
    const desde = inicioDeMes();
    const delMes = datos.gastos.filter((g) => (g.fecha || "") >= desde);
    const totalMes = delMes.reduce((s, g) => s + Number(g.monto || 0), 0);

    const sinDeposito = datos.ingresos.filter(
      (i) => i.monto_depositado === null || i.monto_depositado === undefined || i.monto_depositado === "",
    );
    const cortos = datos.ingresos.filter((i) => Number(i.diferencia ?? 0) < -1);
    const faltante = cortos.reduce((s, i) => s + Math.abs(Number(i.diferencia || 0)), 0);

    const bajos = datos.inventario.filter(
      (i) => Number(i.stock_minimo || 0) > 0 && Number(i.stock_actual || 0) <= Number(i.stock_minimo),
    );
    const sinFacturar = datos.gastos.filter((g) => g.metodo_pago === "Tarjeta de crédito" && !g.facturado);

    // Ordered red → amber → green so the rail reads top-left to bottom-right in
    // the order things should actually be dealt with.
    const orden = { rojo: 0, amarillo: 1, verde: 2 };
    const alertas = [...datos.alertas].sort((a, b) => (orden[a.severidad] ?? 3) - (orden[b.severidad] ?? 3));

    return {
      totalMes,
      gastosDelMes: delMes.length,
      sinDeposito,
      cortos,
      faltante,
      bajos,
      sinFacturar,
      alertas,
      ultimosGastos: datos.gastos.slice(0, 6),
      ultimosCortes: datos.ingresos.slice(0, 3),
    };
  }, [datos]);

  const marcarLeida = async (alerta) => {
    setSaliendo((s) => ({ ...s, [alerta.id]: true }));
    try {
      await base44.functions.invoke("alertas", { action: "markReadSafe", ids: [alerta.id] });
      // Wait out the slide-off animation before removing the node, so the slip
      // actually leaves the rail instead of blinking out of existence.
      setTimeout(() => {
        setDatos((d) => (d ? { ...d, alertas: d.alertas.filter((a) => a.id !== alerta.id) } : d));
        setSaliendo((s) => {
          const next = { ...s };
          delete next[alerta.id];
          return next;
        });
      }, 260);
    } catch (error) {
      console.error("No se pudo marcar la alerta:", error);
      setSaliendo((s) => {
        const next = { ...s };
        delete next[alerta.id];
        return next;
      });
    }
  };

  if (cargando || !resumen) {
    return (
      <div>
        <PageHeader title="Resumen" description="Cargando lo de tu cocina…" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  const nada =
    resumen.alertas.length === 0 &&
    resumen.gastosDelMes === 0 &&
    datos.ingresos.length === 0 &&
    datos.inventario.length === 0;

  return (
    <div>
      <PageHeader
        title={business?.name || "Resumen"}
        description={
          resumen.alertas.length > 0
            ? `${resumen.alertas.length} ${resumen.alertas.length === 1 ? "cosa" : "cosas"} por revisar.`
            : "Todo en orden por ahora."
        }
        action={
          can("Gastos:create") ? (
            <Button asChild>
              <Link to="/gastos?nuevo=1">
                <Receipt className="mr-2 h-4 w-4" />
                Registrar gasto
              </Link>
            </Button>
          ) : null
        }
      />

      {nada ? (
        <EmptyState
          icon={Sparkles}
          title="Aquí no hay nada todavía"
          body="Registra tu primer gasto o da de alta tus insumos y este resumen empieza a llenarse solo."
          actionLabel={can("Gastos:create") ? "Registrar el primer gasto" : undefined}
          onAction={can("Gastos:create") ? () => { window.location.href = "/gastos?nuevo=1"; } : undefined}
        />
      ) : (
        <>
          {/* ── The rail. The thesis of the screen. ───────────────────────── */}
          <section className="mb-8">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="eyebrow">Por revisar</h2>
              {resumen.alertas.length > 3 && (
                <Link to="/alertas" className="inline-flex items-center gap-1 text-xs text-copper hover:underline">
                  Ver las {resumen.alertas.length}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              )}
            </div>

            {resumen.alertas.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-verde/25 bg-verde/10 px-4 py-3.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-verde" aria-hidden="true" />
                <p className="text-sm text-chalk">
                  Nada pendiente. Ni depósitos faltantes, ni insumos por acabarse.
                </p>
              </div>
            ) : (
              <Rail>
                {resumen.alertas.slice(0, 3).map((a, i) => (
                  <Ticket
                    key={a.id}
                    alerta={a}
                    index={i}
                    saliendo={Boolean(saliendo[a.id])}
                    puedeLeer={can("Alertas:mark_read")}
                    onLeer={marcarLeida}
                  />
                ))}
              </Rail>
            )}
          </section>

          {/* ── The numbers behind the rail ───────────────────────────────── */}
          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Gastado este mes"
              value={money(resumen.totalMes, simbolo)}
              sublabel={`${resumen.gastosDelMes} ${resumen.gastosDelMes === 1 ? "gasto" : "gastos"} desde el ${fecha(inicioDeMes())}`}
              icon={TrendingUp}
              tone="copper"
              sensitive={!verFinanzas}
            />
            <StatCard
              label="Depósitos por confirmar"
              value={String(resumen.sinDeposito.length)}
              sublabel={
                resumen.sinDeposito.length === 0
                  ? "Todos los cortes están conciliados"
                  : "Cortes sin depósito registrado"
              }
              icon={Wallet}
              tone={resumen.sinDeposito.length > 0 ? "warning" : "positive"}
            />
            <StatCard
              label="Te depositaron de menos"
              value={money(resumen.faltante, simbolo)}
              sublabel={
                resumen.cortos.length === 0
                  ? "Ningún corte salió corto"
                  : `En ${resumen.cortos.length} ${resumen.cortos.length === 1 ? "corte" : "cortes"}`
              }
              icon={Wallet}
              tone={resumen.faltante > 0 ? "negative" : "positive"}
              sensitive={!verFinanzas}
            />
            <StatCard
              label="Insumos por acabarse"
              value={String(resumen.bajos.length)}
              sublabel={
                resumen.bajos.length === 0
                  ? "Nada bajo el mínimo"
                  : resumen.bajos.slice(0, 3).map((i) => i.nombre).join(", ")
              }
              icon={Package}
              tone={resumen.bajos.length > 0 ? "warning" : "positive"}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── The cut line ───────────────────────────────────────────── */}
            {can("Ingresos:view") && (
              <section>
                <div className="mb-3 flex items-end justify-between">
                  <h2 className="eyebrow">Últimos cortes</h2>
                  <Link to="/ingresos" className="text-xs text-copper hover:underline">Ver todos</Link>
                </div>

                {resumen.ultimosCortes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-slate">
                    Todavía no registras cortes de Rappi, Uber Eats o Didi.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {resumen.ultimosCortes.map((i) => {
                      const dep = i.monto_depositado;
                      const pendiente = dep === null || dep === undefined || dep === "";
                      const dif = Number(i.diferencia ?? 0);
                      return (
                        <article key={i.id} className="rounded-lg border border-border bg-card p-4">
                          <div className="flex items-baseline justify-between gap-2">
                            <h3 className="font-display text-base font-semibold text-chalk">{i.plataforma}</h3>
                            <span className="font-mono text-[0.6875rem] text-slate-dim">
                              {semanaLegible(i.semana)}
                            </span>
                          </div>

                          <div className="mt-3 flex items-baseline justify-between">
                            <span className="text-xs text-slate">Te reportaron</span>
                            <span className="money text-sm text-chalk">{money(i.monto_corte, simbolo)}</span>
                          </div>

                          {/* The perforation. See .cut-line in index.css — the
                              shape of the receipt is what teaches which number
                              is which. */}
                          <div className="cut-line" />

                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-slate">Te depositaron</span>
                            <span className={`money text-sm ${pendiente ? "text-slate-dim" : "text-chalk"}`}>
                              {pendiente ? "pendiente" : money(dep, simbolo)}
                            </span>
                          </div>

                          {!pendiente && (
                            <div className="mt-2.5 flex items-baseline justify-between border-t border-border pt-2.5">
                              <span className="eyebrow">Diferencia</span>
                              <span
                                className={`money text-base font-semibold ${
                                  dif < -0.01 ? "text-rojo" : dif > 0.01 ? "text-amber" : "text-verde"
                                }`}
                              >
                                {Math.abs(dif) < 0.01 ? "cuadra" : moneySigned(dif, simbolo)}
                              </span>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* ── Recent expenses ────────────────────────────────────────── */}
            {can("Gastos:view") && (
              <section>
                <div className="mb-3 flex items-end justify-between">
                  <h2 className="eyebrow">Últimos gastos</h2>
                  <Link to="/gastos" className="text-xs text-copper hover:underline">Ver todos</Link>
                </div>

                {resumen.ultimosGastos.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-slate">
                    Aún no hay gastos registrados.
                  </div>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                    {resumen.ultimosGastos.map((g) => (
                      <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-chalk">{g.proveedor}</p>
                          <p className="truncate font-mono text-[0.6875rem] text-slate-dim">
                            {fecha(g.fecha)} · {g.categoria || "Insumos"}
                            {g.origen === "whatsapp" && " · por WhatsApp"}
                          </p>
                        </div>
                        <span className="money shrink-0 text-sm text-chalk">
                          {verFinanzas ? money(g.monto, simbolo) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
