import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionContext";
import { ASSIGNABLE_ROLES, ROLE_LABELS, ROLES } from "@/lib/rbac";
import { APP_VERSION, CHANGELOG, KITCHOPS_SITE_URL, RELEASE_DATE } from "@/lib/appConfig";
import { fecha, mensajeDeError } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserMinus,
  UserPlus,
  Users2,
  X,
} from "lucide-react";

const BILLING = {
  trial: { label: "Prueba", clase: "text-copper" },
  active: { label: "Activa", clase: "text-verde" },
  view_only: { label: "Solo lectura", clase: "text-amber" },
  suspended: { label: "Suspendida", clase: "text-rojo" },
};

// Module 7. Every write on this screen goes through a base44/functions/* Safe
// function — member management and account deletion are precisely the actions
// RLS alone cannot express safely, and this page never touches an entity
// directly for them.
export default function Cuenta() {
  const { user, business, refreshBusiness } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();

  const [miembros, setMiembros] = useState([]);
  const [cargandoMiembros, setCargandoMiembros] = useState(true);
  // Solicitudes de unión: quien entró con el código y espera aprobación. Cada una
  // lleva el rol que el dueño elige al aprobar (por defecto, personal de cocina).
  const [solicitudes, setSolicitudes] = useState([]);
  const [rolesElegidos, setRolesElegidos] = useState({});
  const [decidiendo, setDecidiendo] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const puedeMiembros = can("Cuenta:manage_members");
  const puedePerfil = can("Cuenta:edit_profile");
  const puedePeligro = can("Cuenta:danger_zone");

  useEffect(() => {
    if (business) {
      setPerfil({
        name: business.name || "",
        legal_name: business.legal_name || "",
        rfc: business.rfc || "",
        phone: business.phone || "",
        address: business.address || "",
      });
    }
  }, [business]);

  const cargarMiembros = useCallback(async () => {
    if (!puedeMiembros || !user?.business_id) {
      setCargandoMiembros(false);
      return;
    }
    setCargandoMiembros(true);
    try {
      const rows = await base44.entities.User.filter({ business_id: user.business_id });
      setMiembros(rows || []);
    } catch (e) {
      console.error(e);
    } finally {
      setCargandoMiembros(false);
    }
  }, [puedeMiembros, user?.business_id]);

  useEffect(() => { cargarMiembros(); }, [cargarMiembros]);

  const cargarSolicitudes = useCallback(async () => {
    if (!puedeMiembros || !user?.business_id) return;
    try {
      const res = await base44.functions.invoke("manage-member", { action: "list_requests" });
      setSolicitudes((res?.data ?? res)?.requests || []);
    } catch (e) {
      console.error(e);
    }
  }, [puedeMiembros, user?.business_id]);

  useEffect(() => { cargarSolicitudes(); }, [cargarSolicitudes]);

  const decidir = async (s, aprobar) => {
    setDecidiendo(s.id);
    try {
      await base44.functions.invoke("manage-member", {
        action: aprobar ? "approve_request" : "reject_request",
        memberId: s.id,
        role: rolesElegidos[s.id] || ROLES.STAFF,
      });
      toast({ title: aprobar ? "Persona aprobada" : "Solicitud rechazada" });
      await Promise.all([cargarSolicitudes(), cargarMiembros()]);
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos procesar la solicitud"), variant: "destructive" });
      cargarSolicitudes();
    } finally {
      setDecidiendo(null);
    }
  };

  const guardarPerfil = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await base44.functions.invoke("business", {
        action: "updateBusinessSafe", business_id: user.business_id, ...perfil,
      });
      toast({ title: "Datos guardados" });
      refreshBusiness();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos guardar"), variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const cambiarRol = async (memberId, role) => {
    try {
      await base44.functions.invoke("manage-member", { action: "change_role", memberId, role });
      toast({ title: "Rol actualizado" });
      cargarMiembros();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos cambiar el rol"), variant: "destructive" });
    }
  };

  const quitar = async (m) => {
    if (!window.confirm(`¿Quitar a ${m.full_name || m.email} de ${business?.name}? Pierde el acceso, pero su cuenta sigue existiendo.`)) return;
    try {
      await base44.functions.invoke("manage-member", { action: "remove", memberId: m.id });
      toast({ title: "Persona removida" });
      cargarMiembros();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos removerla"), variant: "destructive" });
    }
  };

  const rotarCodigo = async (desactivar = false) => {
    try {
      await base44.functions.invoke("business", {
        action: "rotateInviteCodeSafe", business_id: user.business_id, active: desactivar ? false : undefined,
      });
      toast({
        title: desactivar ? "Código desactivado" : "Código nuevo generado",
        description: desactivar ? "Ya nadie puede unirse con el anterior." : "El código anterior dejó de servir.",
      });
      refreshBusiness();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos cambiarlo"), variant: "destructive" });
    }
  };

  const copiarCodigo = async () => {
    try {
      await navigator.clipboard.writeText(business.invite_code);
      toast({ title: "Código copiado" });
    } catch {
      toast({ title: "No pudimos copiarlo", description: "Cópialo a mano.", variant: "destructive" });
    }
  };

  // Everything the tenant owns, in one JSON file. Deliberately assembled here
  // rather than server-side: the client already has read access to exactly the
  // rows the user is entitled to (RLS decides that, not this function), so
  // there's no separate export endpoint to keep in sync with the permission
  // model.
  const exportar = async () => {
    setExportando(true);
    try {
      const scope = { business_id: user.business_id };
      const [gastos, ingresos, inventario, proveedores, alertas] = await Promise.all([
        base44.entities.Gasto.filter(scope, "-fecha", 5000),
        base44.entities.IngresoPlataforma.filter(scope, "-semana", 2000),
        base44.entities.InventarioItem.filter(scope, "nombre", 2000),
        base44.entities.Proveedor.filter(scope, "nombre", 1000),
        base44.entities.Alerta.filter(scope, "-fecha", 2000),
      ]);
      const blob = new Blob(
        [JSON.stringify({
          negocio: business,
          exportado_el: new Date().toISOString(),
          version: APP_VERSION,
          gastos, ingresos, inventario, proveedores, alertas,
        }, null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kitchops-${(business?.name || "negocio").replace(/[^\w-]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Datos exportados" });
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos exportar"), variant: "destructive" });
    } finally {
      setExportando(false);
    }
  };

  const eliminar = async () => {
    if (!business || confirmacion.trim() !== business.name) return;
    setBorrando(true);
    try {
      await base44.functions.invoke("delete-account", { businessId: business.id, confirmName: confirmacion });
      toast({ title: "Negocio eliminado" });
      window.location.href = "/";
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos eliminarlo"), variant: "destructive" });
      setBorrando(false);
    }
  };

  const billing = BILLING[business?.billing_status] || { label: business?.billing_status || "—", clase: "text-slate" };

  return (
    <div>
      <PageHeader title="Cuenta" description={business?.name || "Tu negocio"} />

      <Tabs defaultValue="general">
        <TabsList className="mb-6 grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="equipo">Equipo</TabsTrigger>
          <TabsTrigger value="novedades">Novedades</TabsTrigger>
          {puedePeligro && <TabsTrigger value="peligro" className="text-rojo">Zona de peligro</TabsTrigger>}
        </TabsList>

        {/* ── General ──────────────────────────────────────────────────── */}
        <TabsContent value="general" className="space-y-5">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold text-chalk">Tu licencia</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-slate">Estado</dt>
                <dd className={cn("font-medium", billing.clase)}>{billing.label}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-slate">Plan</dt>
                <dd className="font-medium capitalize text-chalk">{business?.license_plan || "—"}</dd>
              </div>
              {business?.billing_status === "trial" && business?.trial_end_at && (
                <div className="flex items-baseline justify-between">
                  <dt className="text-slate">La prueba termina</dt>
                  <dd className="money text-chalk">{fecha(business.trial_end_at)}</dd>
                </div>
              )}
              {business?.license_expires_at && (
                <div className="flex items-baseline justify-between">
                  <dt className="text-slate">Siguiente cobro</dt>
                  <dd className="money text-chalk">{fecha(business.license_expires_at)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between">
                <dt className="text-slate">Tu rol</dt>
                <dd className="font-medium text-chalk">{ROLE_LABELS[user?.role] || user?.role}</dd>
              </div>
            </dl>

            {/* Read-only by design (Module 1): billing_status is written by
                Mission Control's cron alone. A "cambiar plan" control here
                would be a self-serve path around the payment it represents. */}
            <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-slate-dim">
              Para cambiar de plan o renovar, escríbenos desde Soporte o revisa{" "}
              <a href={KITCHOPS_SITE_URL} className="text-copper hover:underline">los planes</a>.
            </p>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold text-chalk">Datos del negocio</h2>

            {perfil && (
              <form onSubmit={guardarPerfil} className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="nom">Nombre</Label>
                  <Input
                    id="nom"
                    value={perfil.name}
                    onChange={(e) => setPerfil({ ...perfil, name: e.target.value })}
                    disabled={!puedePerfil}
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="razon">Razón social</Label>
                    <Input
                      id="razon"
                      value={perfil.legal_name}
                      onChange={(e) => setPerfil({ ...perfil, legal_name: e.target.value })}
                      disabled={!puedePerfil}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rfc">RFC</Label>
                    <Input
                      id="rfc"
                      value={perfil.rfc}
                      onChange={(e) => setPerfil({ ...perfil, rfc: e.target.value.toUpperCase() })}
                      className="font-mono uppercase"
                      disabled={!puedePerfil}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tel">Teléfono</Label>
                    <Input
                      id="tel"
                      value={perfil.phone}
                      onChange={(e) => setPerfil({ ...perfil, phone: e.target.value })}
                      inputMode="tel"
                      className="font-mono"
                      disabled={!puedePerfil}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dir">Dirección</Label>
                    <Input
                      id="dir"
                      value={perfil.address}
                      onChange={(e) => setPerfil({ ...perfil, address: e.target.value })}
                      disabled={!puedePerfil}
                    />
                  </div>
                </div>

                {puedePerfil && (
                  <Button type="submit" disabled={guardando}>
                    {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar
                  </Button>
                )}
              </form>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold text-chalk">Tus datos</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate">
              Descarga todo lo que KitchOps guarda de tu negocio: gastos, cortes, inventario,
              proveedores y alertas, en un archivo que puedes abrir o guardar donde quieras.
            </p>
            <Button variant="outline" className="mt-4" onClick={exportar} disabled={exportando}>
              {exportando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Exportar mis datos
            </Button>
          </section>
        </TabsContent>

        {/* ── Equipo ───────────────────────────────────────────────────── */}
        <TabsContent value="equipo" className="space-y-5">
          {!puedeMiembros ? (
            <p className="rounded-lg border border-border bg-card px-6 py-12 text-center text-sm text-slate">
              Sólo el dueño o gerente ve y administra al equipo.
            </p>
          ) : (
            <>
              {business?.invite_code && (
                <section className="rounded-lg border border-border bg-card p-5">
                  <h2 className="font-display text-lg font-semibold text-chalk">Invitar a alguien</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate">
                    Pásale este código. Quien lo use envía una solicitud: no entra hasta que tú la
                    apruebes aquí abajo y elijas su rol.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <code
                      className={cn(
                        "rounded-md border border-border bg-carbon px-4 py-2.5 font-mono text-xl tracking-[0.3em]",
                        business.invite_code_active === false ? "text-slate-dim line-through" : "text-copper",
                      )}
                    >
                      {business.invite_code}
                    </code>
                    <Button variant="outline" size="sm" onClick={copiarCodigo} disabled={business.invite_code_active === false}>
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Copiar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => rotarCodigo(false)}>
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      Generar otro
                    </Button>
                    {business.invite_code_active !== false && (
                      <Button variant="outline" size="sm" onClick={() => rotarCodigo(true)}>
                        Desactivar
                      </Button>
                    )}
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-slate-dim">
                    Aunque alguien tenga el código, sin tu aprobación no ve nada de tu negocio. Si se
                    te salió de las manos, genera otro: el anterior deja de servir al instante.
                  </p>
                </section>
              )}

              {solicitudes.length > 0 && (
                <section className="overflow-hidden rounded-lg border border-copper/40 bg-card">
                  <div className="border-b border-border bg-copper/10 px-4 py-2.5">
                    <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-chalk">
                      Solicitudes para unirse ({solicitudes.length})
                    </h2>
                  </div>
                  <ul className="divide-y divide-border">
                    {solicitudes.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <UserPlus className="h-4 w-4 shrink-0 text-copper" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-chalk">{s.full_name || s.email}</p>
                            <p className="truncate font-mono text-[0.6875rem] text-slate-dim">
                              {s.email}{s.requested_at ? ` · ${fecha(s.requested_at)}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={rolesElegidos[s.id] || ROLES.STAFF}
                            onValueChange={(v) => setRolesElegidos({ ...rolesElegidos, [s.id]: v })}
                          >
                            <SelectTrigger className="h-9 w-44" aria-label={`Rol para ${s.email}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ASSIGNABLE_ROLES.map((r) => (
                                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" disabled={decidiendo === s.id} onClick={() => decidir(s, true)}>
                            {decidiendo === s.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                            Aprobar
                          </Button>
                          <button
                            type="button"
                            disabled={decidiendo === s.id}
                            onClick={() => decidir(s, false)}
                            aria-label={`Rechazar a ${s.email}`}
                            className="rounded-sm p-2 text-slate-dim transition-colors hover:bg-rojo/15 hover:text-rojo"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="border-b border-border bg-steel-high/50 px-4 py-2.5">
                  <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-chalk">
                    Quién tiene acceso
                  </h2>
                </div>

                {cargandoMiembros ? (
                  <p className="px-4 py-8 text-center text-sm text-slate">Cargando…</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {miembros.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Users2 className="h-4 w-4 shrink-0 text-slate-dim" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-chalk">{m.full_name || m.email}</p>
                            <p className="truncate font-mono text-[0.6875rem] text-slate-dim">{m.email}</p>
                          </div>
                        </div>

                        {m.id === user.id ? (
                          <span className="text-xs text-slate-dim">{ROLE_LABELS[m.role]} · tú</span>
                        ) : m.role === ROLES.ADMIN ? (
                          <span className="text-xs text-slate-dim">{ROLE_LABELS[m.role]}</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Select value={m.role} onValueChange={(v) => cambiarRol(m.id, v)}>
                              <SelectTrigger className="h-9 w-44" aria-label={`Rol de ${m.email}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ASSIGNABLE_ROLES.map((r) => (
                                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <button
                              type="button"
                              onClick={() => quitar(m)}
                              aria-label={`Quitar a ${m.email}`}
                              className="rounded-sm p-2 text-slate-dim transition-colors hover:bg-rojo/15 hover:text-rojo"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </TabsContent>

        {/* ── Novedades ────────────────────────────────────────────────── */}
        <TabsContent value="novedades" className="space-y-4">
          <p className="font-mono text-xs text-slate-dim">
            Versión {APP_VERSION} · {fecha(RELEASE_DATE)}
          </p>
          {CHANGELOG.map((v) => (
            <section key={v.version} className="rounded-lg border border-border bg-card p-5">
              <h2 className="font-display text-lg font-semibold text-chalk">
                v{v.version} <span className="font-mono text-xs font-normal text-slate-dim">· {fecha(v.date)}</span>
              </h2>
              <ul className="mt-3 space-y-2">
                {v.notes.map((n, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-copper" aria-hidden="true" />
                    {n}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </TabsContent>

        {/* ── Zona de peligro ──────────────────────────────────────────── */}
        {puedePeligro && (
          <TabsContent value="peligro">
            <section className="rounded-lg border border-rojo/35 bg-card p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rojo" aria-hidden="true" />
                <div>
                  <h2 className="font-display text-lg font-semibold text-rojo">Eliminar el negocio</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate">
                    Se borran para siempre todos los gastos, cortes, insumos, proveedores, alertas,
                    conversaciones de WhatsApp y la bitácora de{" "}
                    <strong className="text-chalk">{business?.name}</strong>.
                  </p>
                  {/* Module 7 requires saying explicitly what deletion does NOT
                      touch. A login identity is a person, not tenant data. */}
                  <p className="mt-2 text-sm leading-relaxed text-slate">
                    Las cuentas de tu equipo <strong className="text-chalk">no</strong> se eliminan:
                    siguen existiendo y pueden entrar a otros negocios, sólo pierden el acceso a
                    este. Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <Label htmlFor="confirmar">
                  Escribe <span className="font-mono text-chalk">{business?.name}</span> para confirmar
                </Label>
                <Input
                  id="confirmar"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  placeholder={business?.name}
                  autoComplete="off"
                />
              </div>

              <Button
                variant="destructive"
                className="mt-4"
                disabled={borrando || confirmacion.trim() !== business?.name}
                onClick={eliminar}
              >
                {borrando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                Eliminar {business?.name} para siempre
              </Button>

              <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-slate-dim">
                ¿Sólo quieres una copia antes de irte? Exporta tus datos desde la pestaña General.
              </p>
            </section>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
