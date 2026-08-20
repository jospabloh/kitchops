import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionContext";
import { haceRato, mensajeDeError, money } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, Minus, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";

const CATEGORIAS = ["Carnes", "Verduras", "Lácteos", "Bebidas", "Abarrotes", "Limpieza", "Otros"];

const VACIO = {
  nombre: "",
  categoria: "Abarrotes",
  stock_actual: "0",
  stock_minimo: "0",
  unidad: "kg",
  ultimo_costo: "",
  proveedor: "",
};

export default function Inventario() {
  const { user } = useAuth();
  const { can, writeBlockedReason } = usePermissions();
  const { toast } = useToast();

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [soloBajos, setSoloBajos] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [ajustando, setAjustando] = useState("");
  const [error, setError] = useState("");

  const puedeCrear = can("Inventario:create");
  const puedeEditar = can("Inventario:edit_item");
  const puedeStock = can("Inventario:edit_stock");
  const puedeCosto = can("Inventario:edit_costo");
  const puedeBorrar = can("Inventario:delete");

  const cargar = useCallback(async () => {
    if (!user?.business_id) return;
    setCargando(true);
    try {
      const rows = await base44.entities.InventarioItem.filter({ business_id: user.business_id }, "nombre", 1000);
      setItems(rows || []);
    } catch (e) {
      console.error(e);
      toast({ title: "No pudimos cargar el inventario", variant: "destructive" });
    } finally {
      setCargando(false);
    }
  }, [user?.business_id, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const bajo = (i) => Number(i.stock_minimo || 0) > 0 && Number(i.stock_actual || 0) <= Number(i.stock_minimo);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items.filter((i) => {
      if (soloBajos && !bajo(i)) return false;
      if (!q) return true;
      return (i.nombre || "").toLowerCase().includes(q) || (i.proveedor || "").toLowerCase().includes(q);
    });
  }, [items, busqueda, soloBajos]);

  const conteoBajos = useMemo(() => items.filter(bajo).length, [items]);

  function abrirNuevo() {
    setEditando(null);
    setForm(VACIO);
    setError("");
    setAbierto(true);
  }

  function abrirEdicion(i) {
    setEditando(i);
    setForm({
      nombre: i.nombre || "",
      categoria: i.categoria || "Abarrotes",
      stock_actual: String(i.stock_actual ?? 0),
      stock_minimo: String(i.stock_minimo ?? 0),
      unidad: i.unidad || "kg",
      ultimo_costo: i.ultimo_costo === null || i.ultimo_costo === undefined ? "" : String(i.ultimo_costo),
      proveedor: i.proveedor || "",
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
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        stock_actual: Number(form.stock_actual || 0),
        stock_minimo: Number(form.stock_minimo || 0),
        unidad: form.unidad.trim(),
        proveedor: form.proveedor.trim(),
      };
      // Only send the cost when the user can actually set it — otherwise an
      // edit by a cook would trip the cost permission check on a field they
      // never touched.
      if (puedeCosto) payload.ultimo_costo = form.ultimo_costo === "" ? null : Number(form.ultimo_costo);

      if (editando) {
        await base44.functions.invoke("inventario", { action: "updateItemSafe", id: editando.id, ...payload });
        toast({ title: "Insumo actualizado" });
      } else {
        await base44.functions.invoke("inventario", { action: "createItemSafe", ...payload });
        toast({ title: "Insumo agregado" });
      }
      setAbierto(false);
      cargar();
    } catch (err) {
      setError(mensajeDeError(err, "No pudimos guardar el insumo."));
    } finally {
      setGuardando(false);
    }
  };

  // Adjust by delta, never by writing an absolute. Two people counting the
  // walk-in at once both send "quedan 8" and the second write erases the first;
  // "-3" and "-2" from the same start still land on the right number.
  const ajustar = async (item, delta) => {
    setAjustando(item.id);
    try {
      const r = await base44.functions.invoke("inventario", {
        action: "ajustarStockSafe",
        id: item.id,
        business_id: user.business_id,
        delta,
      });
      if (r?.data?.bajo_minimo) {
        toast({ title: `${item.nombre} quedó bajo el mínimo`, description: "Ya toca pedir más." });
      }
      cargar();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos ajustar el stock"), variant: "destructive" });
    } finally {
      setAjustando("");
    }
  };

  const borrar = async (i) => {
    if (!window.confirm(`¿Eliminar "${i.nombre}" del inventario?`)) return;
    try {
      await base44.functions.invoke("inventario", { action: "deleteItemSafe", id: i.id, business_id: user.business_id });
      toast({ title: "Insumo eliminado" });
      cargar();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos eliminarlo"), variant: "destructive" });
    }
  };

  return (
    <div>
      <PageHeader
        title="Inventario"
        description="Lo que hay en el almacén y lo que ya toca pedir."
        action={puedeCrear ? <Button onClick={abrirNuevo}><Plus className="mr-2 h-4 w-4" />Agregar insumo</Button> : null}
      />

      {writeBlockedReason && (
        <p className="mb-5 rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber">{writeBlockedReason}</p>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-dim" aria-hidden="true" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar insumo"
            className="pl-9"
            aria-label="Buscar insumo"
          />
        </div>
        <Button
          variant={soloBajos ? "default" : "outline"}
          onClick={() => setSoloBajos((v) => !v)}
          aria-pressed={soloBajos}
          className="shrink-0"
        >
          Sólo los bajos
          {conteoBajos > 0 && (
            <span className={cn("ml-2 rounded-sm px-1.5 py-0.5 font-mono text-[0.625rem]", soloBajos ? "bg-black/20" : "bg-amber/20 text-amber")}>
              {conteoBajos}
            </span>
          )}
        </Button>
      </div>

      {cargando ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-card" />)}
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Package}
          title={items.length === 0 ? "El almacén está vacío" : soloBajos ? "Nada bajo el mínimo" : "Ningún insumo coincide"}
          body={
            items.length === 0
              ? "Da de alta tus insumos con su mínimo y KitchOps te avisa cuando toque pedir, antes de que te quedes sin nada a media comida."
              : soloBajos
                ? "Todo está por encima de su mínimo. Buen momento."
                : "Prueba con otra búsqueda."
          }
          actionLabel={items.length === 0 && puedeCrear ? "Agregar el primer insumo" : undefined}
          onAction={items.length === 0 && puedeCrear ? abrirNuevo : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border">
            {filtrados.map((i) => {
              const enBajo = bajo(i);
              return (
                <li
                  key={i.id}
                  className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", enBajo && "border-l-2 border-amber pl-[0.875rem]")}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-chalk">{i.nombre}</p>
                    <p className="truncate font-mono text-[0.6875rem] text-slate-dim">
                      {i.categoria}
                      {i.proveedor ? ` · ${i.proveedor}` : ""}
                      {i.ultima_actualizacion ? ` · movido ${haceRato(i.ultima_actualizacion)}` : ""}
                    </p>
                  </div>

                  {puedeCosto && i.ultimo_costo != null && (
                    <span className="money hidden w-20 shrink-0 text-right text-xs text-slate sm:block">
                      {money(i.ultimo_costo)}
                    </span>
                  )}

                  <div className="flex shrink-0 items-center gap-2">
                    {puedeStock && (
                      <button
                        type="button"
                        disabled={ajustando === i.id || Number(i.stock_actual || 0) <= 0}
                        onClick={() => ajustar(i, -1)}
                        aria-label={`Bajar una unidad de ${i.nombre}`}
                        className="rounded-sm border border-border p-1.5 text-slate transition-colors hover:border-copper hover:text-chalk disabled:opacity-40"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                    )}
                    <span className={cn("money w-24 text-center text-sm font-semibold", enBajo ? "text-amber" : "text-chalk")}>
                      {ajustando === i.id ? (
                        <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          {i.stock_actual ?? 0}
                          <span className="ml-1 text-[0.625rem] font-normal text-slate-dim">{i.unidad}</span>
                        </>
                      )}
                    </span>
                    {puedeStock && (
                      <button
                        type="button"
                        disabled={ajustando === i.id}
                        onClick={() => ajustar(i, 1)}
                        aria-label={`Subir una unidad de ${i.nombre}`}
                        className="rounded-sm border border-border p-1.5 text-slate transition-colors hover:border-copper hover:text-chalk disabled:opacity-40"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  <span className="hidden w-16 shrink-0 text-right font-mono text-[0.625rem] text-slate-dim md:block">
                    mín {i.stock_minimo ?? 0}
                  </span>

                  <div className="flex shrink-0 gap-1">
                    {puedeEditar && (
                      <button
                        type="button"
                        onClick={() => abrirEdicion(i)}
                        aria-label={`Editar ${i.nombre}`}
                        className="rounded-sm p-1.5 text-slate-dim transition-colors hover:bg-steel-high hover:text-chalk"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {puedeBorrar && (
                      <button
                        type="button"
                        onClick={() => borrar(i)}
                        aria-label={`Eliminar ${i.nombre}`}
                        className="rounded-sm p-1.5 text-slate-dim transition-colors hover:bg-rojo/15 hover:text-rojo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase tracking-tight">
              {editando ? "Editar insumo" : "Agregar insumo"}
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
                placeholder="Jitomate saladet"
                required
              />
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
                <Label htmlFor="unidad">Unidad</Label>
                <Input
                  id="unidad"
                  value={form.unidad}
                  onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                  placeholder="kg, lt, pieza…"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="actual">Existencias</Label>
                <Input
                  id="actual"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.stock_actual}
                  onChange={(e) => setForm({ ...form, stock_actual: e.target.value })}
                  className="font-mono"
                  disabled={Boolean(editando) && !puedeStock}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minimo">Avísame cuando baje de</Label>
                <Input
                  id="minimo"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.stock_minimo}
                  onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })}
                  className="font-mono"
                />
                <p className="text-[0.6875rem] text-slate-dim">Déjalo en 0 para no recibir alertas de este insumo.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {puedeCosto && (
                <div className="space-y-2">
                  <Label htmlFor="costo">Último costo</Label>
                  <Input
                    id="costo"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={form.ultimo_costo}
                    onChange={(e) => setForm({ ...form, ultimo_costo: e.target.value })}
                    placeholder="opcional"
                    className="font-mono"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="prov">Proveedor habitual</Label>
                <Input
                  id="prov"
                  value={form.proveedor}
                  onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                  placeholder="opcional"
                />
              </div>
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
