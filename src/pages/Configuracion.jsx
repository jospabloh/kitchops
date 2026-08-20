import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionContext";
import { mensajeDeError } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, SlidersHorizontal } from "lucide-react";

const VACIO = {
  gasto_alto_umbral_pct: "20",
  gasto_alto_critico_pct: "50",
  deposito_diferencia_critica: "500",
  semana_inicia_lunes: true,
  alertas_email: "",
  alertas_whatsapp_activas: false,
  alertas_whatsapp_destino: "",
  moneda_simbolo: "$",
};

// The thresholds the alert engine reads. Exposed rather than hardcoded because
// what counts as "un gasto disparado" is not the same for a taquería that buys
// daily and a restaurant that buys weekly — and an alert tuned to someone
// else's business is an alert people learn to ignore.
export default function Configuracion() {
  const { user } = useAuth();
  const { can, writeBlockedReason } = usePermissions();
  const { toast } = useToast();

  const [form, setForm] = useState(VACIO);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const puedeEditar = can("Configuracion:edit");

  const cargar = useCallback(async () => {
    if (!user?.business_id) return;
    setCargando(true);
    try {
      const rows = await base44.entities.AppSettings.filter({ business_id: user.business_id }, null, 1);
      const s = rows?.[0];
      if (s) {
        setForm({
          gasto_alto_umbral_pct: String(s.gasto_alto_umbral_pct ?? 20),
          gasto_alto_critico_pct: String(s.gasto_alto_critico_pct ?? 50),
          deposito_diferencia_critica: String(s.deposito_diferencia_critica ?? 500),
          semana_inicia_lunes: s.semana_inicia_lunes !== false,
          alertas_email: s.alertas_email || "",
          alertas_whatsapp_activas: Boolean(s.alertas_whatsapp_activas),
          alertas_whatsapp_destino: s.alertas_whatsapp_destino || "",
          moneda_simbolo: s.moneda_simbolo || "$",
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  }, [user?.business_id]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await base44.functions.invoke("business", {
        action: "saveAppSettingsSafe",
        business_id: user.business_id,
        gasto_alto_umbral_pct: Number(form.gasto_alto_umbral_pct),
        gasto_alto_critico_pct: Number(form.gasto_alto_critico_pct),
        deposito_diferencia_critica: Number(form.deposito_diferencia_critica),
        semana_inicia_lunes: form.semana_inicia_lunes,
        alertas_email: form.alertas_email,
        alertas_whatsapp_activas: form.alertas_whatsapp_activas,
        alertas_whatsapp_destino: form.alertas_whatsapp_destino,
        moneda_simbolo: form.moneda_simbolo,
      });
      toast({ title: "Configuración guardada" });
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos guardar"), variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div>
        <PageHeader title="Configuración" description="Cargando…" />
        <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Cuándo quieres que KitchOps te avise, y por dónde."
      />

      {writeBlockedReason && (
        <p className="mb-5 rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber">{writeBlockedReason}</p>
      )}

      <form onSubmit={guardar} className="space-y-5">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-slate-dim" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-chalk">Cuándo avisarte de un gasto</h2>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate">
            Comparamos lo que llevas gastado con cada proveedor este mes contra el mes pasado.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="umbral">Avísame si subió más de</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="umbral"
                  type="number"
                  min="1"
                  max="500"
                  value={form.gasto_alto_umbral_pct}
                  onChange={(e) => setForm({ ...form, gasto_alto_umbral_pct: e.target.value })}
                  className="font-mono"
                  disabled={!puedeEditar}
                />
                <span className="text-sm text-slate">%</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="critico">Márcalo en rojo si subió más de</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="critico"
                  type="number"
                  min="1"
                  max="1000"
                  value={form.gasto_alto_critico_pct}
                  onChange={(e) => setForm({ ...form, gasto_alto_critico_pct: e.target.value })}
                  className="font-mono"
                  disabled={!puedeEditar}
                />
                <span className="text-sm text-slate">%</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold text-chalk">Depósitos de plataformas</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate">
            Cuando te depositan menos de lo que reportaron, te avisamos siempre. Esto define a
            partir de cuánto lo marcamos en rojo.
          </p>

          <div className="mt-4 max-w-xs space-y-2">
            <Label htmlFor="dif">Rojo si faltan más de</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate">{form.moneda_simbolo}</span>
              <Input
                id="dif"
                type="number"
                min="0"
                value={form.deposito_diferencia_critica}
                onChange={(e) => setForm({ ...form, deposito_diferencia_critica: e.target.value })}
                className="font-mono"
                disabled={!puedeEditar}
              />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold text-chalk">Por dónde te avisamos</h2>

          <div className="mt-4 space-y-4">
            <div className="max-w-md space-y-2">
              <Label htmlFor="mail">Correo para alertas críticas</Label>
              <Input
                id="mail"
                type="email"
                value={form.alertas_email}
                onChange={(e) => setForm({ ...form, alertas_email: e.target.value })}
                placeholder="tu@correo.com"
                disabled={!puedeEditar}
              />
            </div>

            <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
              <div>
                <p className="text-sm font-medium text-chalk">Mandarme las alertas por WhatsApp</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate">
                  Requiere el agente de WhatsApp encendido y configurado.
                </p>
              </div>
              <Switch
                checked={form.alertas_whatsapp_activas}
                onCheckedChange={(v) => setForm({ ...form, alertas_whatsapp_activas: v })}
                disabled={!puedeEditar}
                aria-label="Mandarme las alertas por WhatsApp"
              />
            </div>

            {form.alertas_whatsapp_activas && (
              <div className="max-w-md space-y-2">
                <Label htmlFor="wadest">¿A qué número?</Label>
                <Input
                  id="wadest"
                  value={form.alertas_whatsapp_destino}
                  onChange={(e) => setForm({ ...form, alertas_whatsapp_destino: e.target.value })}
                  placeholder="+525512345678"
                  inputMode="tel"
                  className="font-mono"
                  disabled={!puedeEditar}
                />
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold text-chalk">Cómo cuentas la semana</h2>

          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-chalk">La semana empieza en lunes</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate">
                Apágalo si tus cortes van de domingo a sábado.
              </p>
            </div>
            <Switch
              checked={form.semana_inicia_lunes}
              onCheckedChange={(v) => setForm({ ...form, semana_inicia_lunes: v })}
              disabled={!puedeEditar}
              aria-label="La semana empieza en lunes"
            />
          </div>
        </section>

        {puedeEditar && (
          <Button type="submit" disabled={guardando}>
            {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar configuración
          </Button>
        )}
      </form>
    </div>
  );
}
