import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionContext";
import { PERMISSION_SECTIONS, registryDefault } from "@/lib/permissionRegistry";
import { ROLES, ROLE_DESCRIPTIONS } from "@/lib/rbac";
import { mensajeDeError } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, RotateCcw, Shield } from "lucide-react";

// Module 3's tenant-side screen: what the kitchen staff can do, beyond the
// defaults in permissionRegistry.js.
//
// Only 'staff' appears here. business_admin is definitionally the person who
// runs the restaurant — the server never consults a profile for that role, so
// rendering switches for it would be a lie the UI told convincingly.
//
// Saving writes a PermissionProfile row scoped to this business_id, and RLS
// enforces that scoping independently of this page, so a tenant can never reach
// another tenant's staff permissions even by calling the API directly.
export default function Permisos() {
  const { user } = useAuth();
  const { can, refreshOverrides } = usePermissions();
  const { toast } = useToast();

  const [perms, setPerms] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const puedeGestionar = can("Cuenta:manage_members");

  const cargar = useCallback(async () => {
    if (!puedeGestionar || !user?.business_id) {
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const rows = await base44.entities.PermissionProfile.filter({
        business_id: user.business_id,
        role: ROLES.STAFF,
      });
      setPerms(rows?.[0]?.permissions || {});
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  }, [puedeGestionar, user?.business_id]);

  useEffect(() => { cargar(); }, [cargar]);

  const alternar = (key, valor) => setPerms((prev) => ({ ...prev, [key]: valor }));

  // Removing the key entirely, rather than writing the default value into it,
  // keeps the stored profile meaning "these are the deliberate exceptions" —
  // so a later change to the registry default reaches every tenant who never
  // overrode that key.
  const restablecer = (key) => {
    setPerms((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await base44.functions.invoke("permisos", {
        action: "savePermissionProfileSafe",
        business_id: user.business_id,
        permissions: perms,
      });
      toast({ title: "Permisos guardados" });
      await refreshOverrides();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos guardar"), variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  if (!puedeGestionar) {
    return (
      <div>
        <PageHeader title="Permisos" />
        <p className="rounded-lg border border-border bg-card px-6 py-12 text-center text-sm text-slate">
          Sólo el dueño o gerente del negocio configura los permisos.
        </p>
      </div>
    );
  }

  if (cargando) {
    return (
      <div>
        <PageHeader title="Permisos" description="Cargando…" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-lg border border-border bg-card" />)}
        </div>
      </div>
    );
  }

  const cambios = Object.keys(perms).length;

  return (
    <div>
      <PageHeader
        title="Permisos"
        description={ROLE_DESCRIPTIONS[ROLES.STAFF]}
        action={
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        }
      />

      <p className="mb-6 rounded-md border border-border bg-steel-high/40 p-3 text-sm leading-relaxed text-slate">
        Estos permisos aplican al <strong className="text-chalk">personal de cocina</strong>. El
        dueño y el gerente siempre tienen acceso completo dentro de su propio negocio.
        {cambios > 0 && (
          <>
            {" "}Llevas <span className="money text-chalk">{cambios}</span>{" "}
            {cambios === 1 ? "permiso personalizado" : "permisos personalizados"}.
          </>
        )}
      </p>

      <div className="space-y-4">
        {PERMISSION_SECTIONS.map((seccion) => (
          <section key={seccion.section} className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border bg-steel-high/50 px-4 py-2.5">
              <Shield className="h-3.5 w-3.5 text-slate-dim" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-chalk">
                {seccion.section}
              </h2>
            </div>

            <ul className="divide-y divide-border">
              {seccion.keys.map(({ key, label }) => {
                const personalizado = perms[key] !== undefined;
                const valor = personalizado ? perms[key] : registryDefault(key, ROLES.STAFF);
                return (
                  <li key={key} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-chalk">{label}</p>
                      {personalizado ? (
                        <button
                          type="button"
                          onClick={() => restablecer(key)}
                          className="mt-0.5 inline-flex items-center gap-1 font-mono text-[0.6875rem] text-copper hover:underline"
                        >
                          <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />
                          personalizado — volver al valor por defecto
                        </button>
                      ) : (
                        <p className="mt-0.5 font-mono text-[0.6875rem] text-slate-dim">
                          por defecto: {valor ? "permitido" : "no permitido"}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={valor}
                      onCheckedChange={(v) => alternar(key, v)}
                      aria-label={label}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-6">
        <Button onClick={guardar} disabled={guardando}>
          {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar permisos
        </Button>
      </div>
    </div>
  );
}
