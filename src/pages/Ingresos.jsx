import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionContext";
import { fecha, mensajeDeError, money, moneySigned, semanaDe, semanaLegible } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, Loader2, Plus, Trash2, Wallet } from "lucide-react";

const PLATAFORMAS = ["Rappi", "Uber Eats", "Didi Food", "Otros"];

// Reconciling the weekly platform cut is the highest-value thing this app does:
// it is where a restaurant finds out a platform paid less than it reported.
// So the screen is built around the difference, not around the list — the cut
// is drawn as the paper artifact it is (reported / perforation / deposited /
// total), because the shape teaches which number is which.
export default function Ingresos() {
  const { user } = useAuth();
  const { can, writeBlockedReason } = usePermissions();
  const { toast } = useToast();

  const [cortes, setCortes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const puedeCrear = can("Ingresos:create");
  const puedeConciliar = can("Ingresos:conciliar");
  const puedeBorrar = can("Ingresos:delete");
  const verFinanzas = can("Dashboard:financials");

  const cargar = useCallback(async () => {
    if (!user?.business_id) return;
    setCargando(true);
    try {
      const rows = await base44.entities.IngresoPlataforma.filter(
        { business_id: user.business_id }, "-semana", 500,
      );
      setCortes(rows || []);
    } catch (e) {
      console.error(e);
      toast({ title: "No pudimos cargar los cortes", variant: "destructive" });
    } finally {
      setCargando(false);
    }
  }, [user?.business_id, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const resumen = useMemo(() => {
    const pendientes = cortes.filter(
      (c) => c.monto_depositado === null || c.monto_depositado === undefined || c.monto_depositado === "",
    );
    const cortos = cortes.filter((c) => Number(c.diferencia ?? 0) < -1);
    const faltante = cortos.reduce((s, c) => s + Math.abs(Number(c.diferencia || 0)), 0);
    const cobrado = cortes.reduce((s, c) => s + Number(c.monto_depositado || 0), 0);
    return { pendientes, cortos, faltante, cobrado };
  }, [cortes]);

  function abrirNuevo() {
    setEditando(null);
    setForm({
      plataforma: "Rappi",
      semana: semanaDe(),
      monto_corte: "",
      monto_depositado: "",
      fecha_deposito: "",
      notas: "",
    });
    setError("");
    setAbierto(true);
  }

  function abrirEdicion(c) {
    setEditando(c);
    setForm({
      plataforma: c.plataforma,
      semana: c.semana,
      monto_corte: String(c.monto_corte ?? ""),
      monto_depositado: c.monto_depositado === null || c.monto_depositado === undefined ? "" : String(c.monto_depositado),
      fecha_deposito: c.fecha_deposito || "",
      notas: c.notas || "",
    });
    setError("");
    setAbierto(true);
  }

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      const payload = {
        business_id: user.business_id,
        plataforma: form.plataforma,
        semana: form.semana,
        monto_corte: Number(form.monto_corte),
        // "" means "not deposited yet", which is different from zero — sending
        // 0 would render as "cuadra" against a cut nobody has been paid for.
        monto_depositado: form.monto_depositado === "" ? null : Number(form.monto_depositado),
        fecha_deposito: form.fecha_deposito || null,
        notas: form.notas,
      };
      if (editando) {
        await base44.functions.invoke("ingresos", { action: "updateIngresoSafe", id: editando.id, ...payload });
        toast({ title: "Corte actualizado" });
      } else {
        await base44.functions.invoke("ingresos", { action: "createIngresoSafe", ...payload });
        toast({ title: "Corte registrado" });
      }
      setAbierto(false);
      cargar();
    } catch (err) {
      setError(mensajeDeError(err, "No pudimos guardar el corte."));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (c) => {
    if (!window.confirm(`¿Eliminar el corte de ${c.plataforma} de la ${semanaLegible(c.semana).toLowerCase()}?`)) return;
    try {
      await base44.functions.invoke("ingresos", { action: "deleteIngresoSafe", id: c.id, business_id: user.business_id });
      toast({ title: "Corte eliminado" });
      cargar();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos eliminarlo"), variant: "destructive" });
    }
  };

  return (
    <div>
      <PageHeader
        title="Cortes"
        description="Lo que te reportan Rappi, Uber Eats y Didi — contra lo que de verdad te depositan."
        action={puedeCrear ? <Button onClick={abrirNuevo}><Plus className="mr-2 h-4 w-4" />Registrar corte</Button> : null}
      />

      {writeBlockedReason && (
        <p className="mb-5 rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber">{writeBlockedReason}</p>
      )}

      {!cargando && cortes.length > 0 && (
        <section className="mb-7 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Depositado en total"
            value={money(resumen.cobrado)}
            sublabel={`${cortes.length} ${cortes.length === 1 ? "corte" : "cortes"} registrados`}
            icon={Wallet}
            tone="copper"
            sensitive={!verFinanzas}
          />
          <StatCard
            label="Sin depósito"
            value={String(resumen.pendientes.length)}
            sublabel={resumen.pendientes.length === 0 ? "Todo conciliado" : "Cortes esperando el depósito"}
            icon={AlertTriangle}
            tone={resumen.pendientes.length > 0 ? "warning" : "positive"}
          />
          <StatCard
            label="Te quedaron a deber"
            value={money(resumen.faltante)}
            sublabel={
              resumen.cortos.length === 0
                ? "Ningún corte salió corto"
                : `En ${resumen.cortos.length} ${resumen.cortos.length === 1 ? "corte" : "cortes"}`
            }
            icon={AlertTriangle}
            tone={resumen.faltante > 0 ? "negative" : "positive"}
            sensitive={!verFinanzas}
          />
        </section>
      )}

      {cargando ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-lg border border-border bg-card" />)}
        </div>
      ) : cortes.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Todavía no registras cortes"
          body="Cada semana, captura lo que te reportó la plataforma y lo que te depositó el banco. Ahí es donde se ve si te pagaron completo."
          actionLabel={puedeCrear ? "Registrar el primer corte" : undefined}
          onAction={puedeCrear ? abrirNuevo : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cortes.map((c) => {
            const pendiente = c.monto_depositado === null || c.monto_depositado === undefined || c.monto_depositado === "";
            const dif = Number(c.diferencia ?? 0);
            const corto = dif < -0.01;
            return (
              <article
                key={c.id}
                className={`rounded-lg border bg-card p-4 transition-colors ${
                  corto ? "border-rojo/35" : pendiente ? "border-amber/30" : "border-border"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold text-chalk">{c.plataforma}</h3>
                  <span className="font-mono text-[0.6875rem] text-slate-dim">{semanaLegible(c.semana)}</span>
                </div>

                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-xs text-slate">Te reportaron</span>
                  <span className="money text-sm text-chalk">{money(c.monto_corte)}</span>
                </div>

                <div className="cut-line" />

                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate">Te depositaron</span>
                  <span className={`money text-sm ${pendiente ? "text-slate-dim" : "text-chalk"}`}>
                    {pendiente ? "pendiente" : money(c.monto_depositado)}
                  </span>
                </div>

                {c.fecha_deposito && (
                  <p className="mt-1 text-right font-mono text-[0.625rem] text-slate-dim">{fecha(c.fecha_deposito)}</p>
                )}

                <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                  <span className="eyebrow">Diferencia</span>
                  {pendiente ? (
                    <span className="text-sm text-amber">falta el depósito</span>
                  ) : (
                    <span className={`money text-lg font-semibold ${corto ? "text-rojo" : dif > 0.01 ? "text-amber" : "text-verde"}`}>
                      {Math.abs(dif) < 0.01 ? "cuadra" : moneySigned(dif)}
                    </span>
                  )}
                </div>

                {c.notas && <p className="mt-2.5 text-xs leading-relaxed text-slate">{c.notas}</p>}

                {(puedeConciliar || puedeBorrar) && (
                  <div className="mt-3 flex gap-2 border-t border-border pt-3">
                    {puedeConciliar && (
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => abrirEdicion(c)}>
                        {pendiente ? "Registrar depósito" : "Editar"}
                      </Button>
                    )}
                    {puedeBorrar && (
                      <button
                        type="button"
                        onClick={() => borrar(c)}
                        aria-label={`Eliminar el corte de ${c.plataforma}`}
                        className="rounded-sm p-2 text-slate-dim transition-colors hover:bg-rojo/15 hover:text-rojo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase tracking-tight">
              {editando ? "Editar corte" : "Registrar corte"}
            </DialogTitle>
          </DialogHeader>

          {form && (
            <form onSubmit={guardar} className="space-y-4">
              {error && <p role="alert" className="rounded-md border border-rojo/30 bg-rojo/10 p-3 text-sm text-rojo">{error}</p>}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Plataforma</Label>
                  <Select value={form.plataforma} onValueChange={(v) => setForm({ ...form, plataforma: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATAFORMAS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="semana">Semana</Label>
                  <Input
                    id="semana"
                    value={form.semana}
                    onChange={(e) => setForm({ ...form, semana: e.target.value })}
                    placeholder="2026-34"
                    pattern="\d{4}-\d{2}"
                    className="font-mono"
                    required
                  />
                  <p className="text-[0.6875rem] text-slate-dim">{semanaLegible(form.semana)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="corte">Lo que te reportó la plataforma</Label>
                <Input
                  id="corte"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.monto_corte}
                  onChange={(e) => setForm({ ...form, monto_corte: e.target.value })}
                  placeholder="18400"
                  className="font-mono"
                  required
                />
              </div>

              {puedeConciliar ? (
                <div className="rounded-md border border-border bg-steel-high/40 p-3">
                  <p className="eyebrow mb-3">El depósito</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="deposito">Lo que cayó al banco</Label>
                      <Input
                        id="deposito"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={form.monto_depositado}
                        onChange={(e) => setForm({ ...form, monto_depositado: e.target.value })}
                        placeholder="déjalo vacío si aún no llega"
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fdep">Cuándo</Label>
                      <Input
                        id="fdep"
                        type="date"
                        value={form.fecha_deposito}
                        onChange={(e) => setForm({ ...form, fecha_deposito: e.target.value })}
                      />
                    </div>
                  </div>
                  {form.monto_depositado !== "" && form.monto_corte !== "" && (
                    <p className="mt-3 border-t border-border pt-2.5 text-sm">
                      <span className="text-slate">Diferencia: </span>
                      <span
                        className={`money font-semibold ${
                          Number(form.monto_depositado) - Number(form.monto_corte) < -0.01 ? "text-rojo" : "text-verde"
                        }`}
                      >
                        {moneySigned(Number(form.monto_depositado) - Number(form.monto_corte))}
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-md border border-border bg-steel-high/40 p-3 text-xs leading-relaxed text-slate">
                  El depósito lo registra el dueño. Tú puedes capturar lo que reportó la plataforma.
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="notas">Notas</Label>
                <Textarea
                  id="notas"
                  rows={2}
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  placeholder="Descontaron comisión extra por promoción"
                />
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
                <Button type="submit" disabled={guardando}>
                  {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editando ? "Guardar" : "Registrar"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
