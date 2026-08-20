import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionContext";
import { fecha, hoy, mensajeDeError, money } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { Check, Loader2, MessageCircle, Pencil, Plus, Receipt, Search, Trash2, X } from "lucide-react";

const CATEGORIAS = ["Insumos", "Servicios", "Renta", "Equipos", "Mantenimiento", "Otros"];
const METODOS = ["Tarjeta de crédito", "Transferencia", "Efectivo", "Otros"];

const VACIO = {
  monto: "",
  fecha: hoy(),
  proveedor: "",
  categoria: "Insumos",
  metodo_pago: "Efectivo",
  descripcion: "",
  facturado: false,
  pagado: false,
};

export default function Gastos() {
  const { user } = useAuth();
  const { can, writeBlockedReason } = usePermissions();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const [gastos, setGastos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const puedeCrear = can("Gastos:create");
  const puedeEditar = can("Gastos:edit");
  const puedeBorrar = can("Gastos:delete");
  const puedeFacturado = can("Gastos:mark_facturado");
  const puedePagado = can("Gastos:mark_pagado");

  const cargar = useCallback(async () => {
    if (!user?.business_id) return;
    setCargando(true);
    try {
      const [g, p] = await Promise.all([
        base44.entities.Gasto.filter({ business_id: user.business_id }, "-fecha", 1000),
        base44.entities.Proveedor.filter({ business_id: user.business_id }, "nombre", 300),
      ]);
      setGastos(g || []);
      setProveedores(p || []);
    } catch (e) {
      console.error(e);
      toast({ title: "No pudimos cargar los gastos", variant: "destructive" });
    } finally {
      setCargando(false);
    }
  }, [user?.business_id, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  // Deep link from the dashboard's "Registrar gasto" button.
  useEffect(() => {
    if (params.get("nuevo") === "1" && puedeCrear) {
      abrirNuevo();
      params.delete("nuevo");
      setParams(params, { replace: true });
    }
     
  }, [params, puedeCrear]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return gastos.filter((g) => {
      if (filtroCategoria !== "todas" && g.categoria !== filtroCategoria) return false;
      if (!q) return true;
      return (
        (g.proveedor || "").toLowerCase().includes(q) ||
        (g.descripcion || "").toLowerCase().includes(q)
      );
    });
  }, [gastos, busqueda, filtroCategoria]);

  const total = useMemo(
    () => filtrados.reduce((s, g) => s + Number(g.monto || 0), 0),
    [filtrados],
  );

  function abrirNuevo() {
    setEditando(null);
    setForm(VACIO);
    setError("");
    setAbierto(true);
  }

  function abrirEdicion(g) {
    setEditando(g);
    setForm({
      monto: String(g.monto ?? ""),
      fecha: g.fecha || hoy(),
      proveedor: g.proveedor || "",
      categoria: g.categoria || "Insumos",
      metodo_pago: g.metodo_pago || "Efectivo",
      descripcion: g.descripcion || "",
      facturado: Boolean(g.facturado),
      pagado: Boolean(g.pagado),
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
        monto: Number(form.monto),
        fecha: form.fecha,
        proveedor: form.proveedor.trim(),
        categoria: form.categoria,
        metodo_pago: form.metodo_pago,
        descripcion: form.descripcion.trim(),
        facturado: form.facturado,
        pagado: form.pagado,
      };
      if (editando) {
        await base44.functions.invoke("gastos", { action: "updateGastoSafe", id: editando.id, ...payload });
        toast({ title: "Gasto actualizado" });
      } else {
        await base44.functions.invoke("gastos", { action: "createGastoSafe", ...payload });
        toast({ title: "Gasto registrado" });
      }
      setAbierto(false);
      cargar();
    } catch (err) {
      // The server writes a specific, useful sentence for every rejection —
      // "no tienes permiso", "tu negocio está en solo lectura", "esa fecha no
      // existe". Showing it beats a generic failure message.
      setError(mensajeDeError(err, "No pudimos guardar el gasto."));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (g) => {
    if (!window.confirm(`¿Eliminar el gasto de ${money(g.monto)} con ${g.proveedor}? No se puede deshacer.`)) return;
    try {
      await base44.functions.invoke("gastos", { action: "deleteGastoSafe", id: g.id, business_id: user.business_id });
      toast({ title: "Gasto eliminado" });
      cargar();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos eliminarlo"), variant: "destructive" });
    }
  };

  const alternar = async (g, campo) => {
    try {
      await base44.functions.invoke("gastos", {
        action: "updateGastoSafe",
        id: g.id,
        business_id: user.business_id,
        [campo]: !g[campo],
      });
      cargar();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos actualizarlo"), variant: "destructive" });
    }
  };

  return (
    <div>
      <PageHeader
        title="Gastos"
        description="Todo lo que sale: insumos, servicios, renta, mantenimiento."
        action={
          puedeCrear ? (
            <Button onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Registrar gasto
            </Button>
          ) : null
        }
      />

      {writeBlockedReason && (
        <p className="mb-5 rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber">
          {writeBlockedReason}
        </p>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-dim" aria-hidden="true" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por proveedor o descripción"
            className="pl-9"
            aria-label="Buscar gastos"
          />
        </div>
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="sm:w-52" aria-label="Filtrar por categoría">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            {CATEGORIAS.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {cargando ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={gastos.length === 0 ? "Todavía no hay gastos" : "Ningún gasto coincide"}
          body={
            gastos.length === 0
              ? "Registra el primero y empieza a ver a dónde se va el dinero de la semana. También puedes mandarle la foto del ticket al asistente de WhatsApp."
              : "Prueba con otra búsqueda o quita el filtro de categoría."
          }
          actionLabel={gastos.length === 0 && puedeCrear ? "Registrar gasto" : undefined}
          onAction={gastos.length === 0 && puedeCrear ? abrirNuevo : undefined}
        />
      ) : (
        <>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="eyebrow">
              {filtrados.length} {filtrados.length === 1 ? "gasto" : "gastos"}
            </p>
            {can("Dashboard:financials") && (
              <p className="text-sm text-slate">
                Suman <span className="money font-semibold text-chalk">{money(total)}</span>
              </p>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {filtrados.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-chalk">{g.proveedor}</p>
                      {g.origen === "whatsapp" && (
                        <span
                          className="inline-flex items-center gap-1 rounded-sm bg-navy/50 px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wide text-slate"
                          title="Se registró desde WhatsApp"
                        >
                          <MessageCircle className="h-2.5 w-2.5" aria-hidden="true" />
                          WA
                        </span>
                      )}
                    </div>
                    <p className="truncate font-mono text-[0.6875rem] text-slate-dim">
                      {fecha(g.fecha)} · {g.categoria} · {g.metodo_pago}
                      {g.descripcion ? ` · ${g.descripcion}` : ""}
                    </p>
                  </div>

                  {/* Two facts about a card expense that people chase weekly.
                      Rendered as toggles rather than badges because chasing
                      them IS the task. */}
                  {g.metodo_pago === "Tarjeta de crédito" && (
                    <div className="flex shrink-0 gap-1.5">
                      <EstadoToggle
                        activo={g.facturado}
                        onSi="Facturado"
                        onNo="Sin factura"
                        disabled={!puedeFacturado}
                        onClick={() => alternar(g, "facturado")}
                      />
                      <EstadoToggle
                        activo={g.pagado}
                        onSi="Pagado"
                        onNo="Sin pagar"
                        disabled={!puedePagado}
                        onClick={() => alternar(g, "pagado")}
                      />
                    </div>
                  )}

                  <span className="money w-24 shrink-0 text-right text-sm font-semibold text-chalk">
                    {money(g.monto)}
                  </span>

                  <div className="flex shrink-0 gap-1">
                    {puedeEditar && (
                      <button
                        type="button"
                        onClick={() => abrirEdicion(g)}
                        aria-label={`Editar gasto de ${g.proveedor}`}
                        className="rounded-sm p-1.5 text-slate-dim transition-colors hover:bg-steel-high hover:text-chalk"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {puedeBorrar && (
                      <button
                        type="button"
                        onClick={() => borrar(g)}
                        aria-label={`Eliminar gasto de ${g.proveedor}`}
                        className="rounded-sm p-1.5 text-slate-dim transition-colors hover:bg-rojo/15 hover:text-rojo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase tracking-tight">
              {editando ? "Editar gasto" : "Registrar gasto"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={guardar} className="space-y-4">
            {error && (
              <p role="alert" className="rounded-md border border-rojo/30 bg-rojo/10 p-3 text-sm text-rojo">
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="monto">Monto</Label>
                <Input
                  id="monto"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  autoFocus
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                  placeholder="850"
                  className="font-mono"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha</Label>
                <Input
                  id="fecha"
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proveedor">Proveedor</Label>
              <Input
                id="proveedor"
                list="proveedores-conocidos"
                value={form.proveedor}
                onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                placeholder="La Central"
                required
              />
              {/* Suggests the suppliers already on file without forcing the
                  choice — a one-off purchase shouldn't require adding a
                  supplier to the catalogue first. */}
              <datalist id="proveedores-conocidos">
                {proveedores.map((p) => <option key={p.id} value={p.nombre} />)}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cómo se pagó</Label>
                <Select value={form.metodo_pago} onValueChange={(v) => setForm({ ...form, metodo_pago: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METODOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Qué se compró</Label>
              <Textarea
                id="descripcion"
                rows={2}
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Verdura de la semana"
              />
            </div>

            {form.metodo_pago === "Tarjeta de crédito" && (
              <div className="flex flex-wrap gap-2 rounded-md border border-border bg-steel-high/40 p-3">
                <EstadoToggle
                  activo={form.facturado}
                  onSi="Facturado"
                  onNo="Sin factura"
                  disabled={!puedeFacturado}
                  onClick={() => setForm({ ...form, facturado: !form.facturado })}
                />
                <EstadoToggle
                  activo={form.pagado}
                  onSi="Pagado"
                  onNo="Sin pagar"
                  disabled={!puedePagado}
                  onClick={() => setForm({ ...form, pagado: !form.pagado })}
                />
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editando ? "Guardar cambios" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EstadoToggle({ activo, onSi, onNo, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[0.6875rem] font-medium transition-colors",
        activo
          ? "border-verde/40 bg-verde/15 text-verde"
          : "border-border bg-transparent text-slate-dim",
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-copper/50",
      )}
    >
      {activo ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
      {activo ? onSi : onNo}
    </button>
  );
}
