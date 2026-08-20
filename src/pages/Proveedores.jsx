import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionContext";
import { mensajeDeError, money } from "@/lib/format";
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
import { Loader2, Pencil, Phone, Plus, Search, Trash2, Truck } from "lucide-react";

const CATEGORIAS = ["Insumos", "Servicios", "Renta", "Equipos", "Mantenimiento", "Otros"];
const VACIO = { nombre: "", categoria: "Insumos", contacto: "", whatsapp: "", notas: "", activo: true };

export default function Proveedores() {
  const { user } = useAuth();
  const { can, writeBlockedReason } = usePermissions();
  const { toast } = useToast();

  const [proveedores, setProveedores] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const puedeCrear = can("Proveedores:create");
  const puedeEditar = can("Proveedores:edit");
  const puedeBorrar = can("Proveedores:delete");
  const verFinanzas = can("Dashboard:financials");

  const cargar = useCallback(async () => {
    if (!user?.business_id) return;
    setCargando(true);
    try {
      const [p, g] = await Promise.all([
        base44.entities.Proveedor.filter({ business_id: user.business_id }, "nombre", 500),
        base44.entities.Gasto.filter({ business_id: user.business_id }, "-fecha", 1000),
      ]);
      setProveedores(p || []);
      setGastos(g || []);
    } catch (e) {
      console.error(e);
      toast({ title: "No pudimos cargar los proveedores", variant: "destructive" });
    } finally {
      setCargando(false);
    }
  }, [user?.business_id, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  // Spend per supplier, so the catalogue answers the question people actually
  // bring to it — "¿a quién le compro más?" — rather than just listing names.
  const gastoPorProveedor = useMemo(() => {
    const out = {};
    for (const g of gastos) {
      const k = (g.proveedor || "").trim().toLowerCase();
      if (!k) continue;
      out[k] = (out[k] || 0) + Number(g.monto || 0);
    }
    return out;
  }, [gastos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return proveedores;
    return proveedores.filter(
      (p) => (p.nombre || "").toLowerCase().includes(q) || (p.contacto || "").toLowerCase().includes(q),
    );
  }, [proveedores, busqueda]);

  function abrirNuevo() {
    setEditando(null);
    setForm(VACIO);
    setError("");
    setAbierto(true);
  }

  function abrirEdicion(p) {
    setEditando(p);
    setForm({
      nombre: p.nombre || "",
      categoria: p.categoria || "Insumos",
      contacto: p.contacto || "",
      whatsapp: p.whatsapp || "",
      notas: p.notas || "",
      activo: p.activo !== false,
    });
    setError("");
    setAbierto(true);
  }

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      const payload = { business_id: user.business_id, ...form, nombre: form.nombre.trim() };
      if (editando) {
        await base44.functions.invoke("proveedores", { action: "updateProveedorSafe", id: editando.id, ...payload });
        toast({ title: "Proveedor actualizado" });
      } else {
        await base44.functions.invoke("proveedores", { action: "createProveedorSafe", ...payload });
        toast({ title: "Proveedor agregado" });
      }
      setAbierto(false);
      cargar();
    } catch (err) {
      setError(mensajeDeError(err, "No pudimos guardar el proveedor."));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (p) => {
    if (!window.confirm(`¿Eliminar a "${p.nombre}"? Sus gastos registrados no se borran.`)) return;
    try {
      const r = await base44.functions.invoke("proveedores", {
        action: "deleteProveedorSafe", id: p.id, business_id: user.business_id,
      });
      // The backend deactivates rather than deletes when there's spend history,
      // and says so — pass that through instead of claiming "eliminado".
      toast({ title: r?.data?.deactivated ? "Proveedor desactivado" : "Proveedor eliminado", description: r?.data?.message });
      cargar();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos eliminarlo"), variant: "destructive" });
    }
  };

  return (
    <div>
      <PageHeader
        title="Proveedores"
        description="A quién le compras, cómo contactarlo y cuánto llevas con cada uno."
        action={puedeCrear ? <Button onClick={abrirNuevo}><Plus className="mr-2 h-4 w-4" />Agregar proveedor</Button> : null}
      />

      {writeBlockedReason && (
        <p className="mb-5 rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber">{writeBlockedReason}</p>
      )}

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-dim" aria-hidden="true" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar proveedor"
          className="pl-9"
          aria-label="Buscar proveedor"
        />
      </div>

      {cargando ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-card" />)}
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={proveedores.length === 0 ? "Sin proveedores todavía" : "Ninguno coincide"}
          body={
            proveedores.length === 0
              ? "Dalos de alta una vez y los eliges al vuelo cada que capturas un gasto — y tienes su WhatsApp a la mano cuando toque pedir."
              : "Prueba con otra búsqueda."
          }
          actionLabel={proveedores.length === 0 && puedeCrear ? "Agregar proveedor" : undefined}
          onAction={proveedores.length === 0 && puedeCrear ? abrirNuevo : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtrados.map((p) => {
            const total = gastoPorProveedor[(p.nombre || "").trim().toLowerCase()] || 0;
            const inactivo = p.activo === false;
            return (
              <article
                key={p.id}
                className={cn("rounded-lg border border-border bg-card p-4", inactivo && "opacity-60")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-base font-semibold text-chalk">{p.nombre}</h3>
                    <p className="font-mono text-[0.6875rem] text-slate-dim">
                      {p.categoria}
                      {inactivo && " · inactivo"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {puedeEditar && (
                      <button
                        type="button"
                        onClick={() => abrirEdicion(p)}
                        aria-label={`Editar ${p.nombre}`}
                        className="rounded-sm p-1.5 text-slate-dim transition-colors hover:bg-steel-high hover:text-chalk"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {puedeBorrar && (
                      <button
                        type="button"
                        onClick={() => borrar(p)}
                        aria-label={`Eliminar ${p.nombre}`}
                        className="rounded-sm p-1.5 text-slate-dim transition-colors hover:bg-rojo/15 hover:text-rojo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {(p.contacto || p.whatsapp) && (
                  <div className="mt-2.5 space-y-1">
                    {p.contacto && <p className="truncate text-sm text-slate">{p.contacto}</p>}
                    {p.whatsapp && (
                      <a
                        href={`https://wa.me/${p.whatsapp.replace(/[^\d]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-mono text-xs text-copper hover:underline"
                      >
                        <Phone className="h-3 w-3" aria-hidden="true" />
                        {p.whatsapp}
                      </a>
                    )}
                  </div>
                )}

                {p.notas && <p className="mt-2 text-xs leading-relaxed text-slate-dim">{p.notas}</p>}

                {verFinanzas && total > 0 && (
                  <p className="mt-3 border-t border-border pt-2.5 text-xs text-slate">
                    Llevas <span className="money font-semibold text-chalk">{money(total)}</span> con él
                  </p>
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
              {editando ? "Editar proveedor" : "Agregar proveedor"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={guardar} className="space-y-4">
            {error && <p role="alert" className="rounded-md border border-rojo/30 bg-rojo/10 p-3 text-sm text-rojo">{error}</p>}

            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                autoFocus
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="La Central"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="contacto">Contacto</Label>
                <Input
                  id="contacto"
                  value={form.contacto}
                  onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                  placeholder="Don Beto"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wa">WhatsApp</Label>
                <Input
                  id="wa"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  placeholder="5512345678"
                  inputMode="tel"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea
                id="notas"
                rows={2}
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Entrega martes y viernes antes de las 9"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button type="submit" disabled={guardando}>
                {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editando ? "Guardar" : "Agregar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
