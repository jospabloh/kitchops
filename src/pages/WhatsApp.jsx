import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionContext";
import { fechaHora, haceRato, mensajeDeError } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";

const MODELOS = [
  { id: "claude-opus-5", nombre: "Opus 5", nota: "El más capaz. Lee tickets difíciles y entiende instrucciones enredadas." },
  { id: "claude-sonnet-5", nombre: "Sonnet 5", nota: "Equilibrado. Suficiente para el día a día." },
  { id: "claude-haiku-4-5", nombre: "Haiku 4.5", nota: "El más económico. Mejor sólo para preguntas simples." },
];

const TONOS = [
  { id: "amigable", nombre: "Amigable", nota: "Tutea, cercano, como un compañero de cocina." },
  { id: "profesional", nombre: "Profesional", nota: "De usted, formal y preciso." },
  { id: "directo", nombre: "Directo", nota: "Al grano, sin rodeos." },
];

export default function WhatsAppPage() {
  const { user } = useAuth();
  const { can, writeBlockedReason } = usePermissions();
  const { toast } = useToast();

  const [config, setConfig] = useState(null);
  const [conversaciones, setConversaciones] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [activa, setActiva] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [form, setForm] = useState(null);
  const [numeros, setNumeros] = useState([]);

  const puedeConfigurar = can("WhatsApp:configure");
  const puedeNumeros = can("WhatsApp:manage_numbers");
  const puedeBandeja = can("WhatsApp:read_inbox");

  const cargar = useCallback(async () => {
    if (!user?.business_id) return;
    setCargando(true);
    try {
      const scope = { business_id: user.business_id };
      const [cfgs, convs] = await Promise.all([
        base44.entities.WhatsAppConfig.filter(scope, null, 1),
        puedeBandeja
          ? base44.entities.WhatsAppConversacion.filter(scope, "-ultimo_mensaje_at", 50)
          : Promise.resolve([]),
      ]);
      const cfg = cfgs?.[0] || null;
      setConfig(cfg);
      setConversaciones(convs || []);
      setForm({
        activo: cfg?.activo ?? false,
        proveedor: cfg?.proveedor || "zernio",
        provider_account_id: cfg?.provider_account_id || "",
        provider_phone_number_id: cfg?.provider_phone_number_id || "",
        numero_visible: cfg?.numero_visible || "",
        agente_nombre: cfg?.agente_nombre || "Kitch",
        agente_tono: cfg?.agente_tono || "amigable",
        modelo: cfg?.modelo || "claude-opus-5",
        instrucciones_extra: cfg?.instrucciones_extra || "",
      });
      setNumeros(Array.isArray(cfg?.numeros_autorizados) ? cfg.numeros_autorizados : []);
    } catch (e) {
      console.error(e);
      toast({ title: "No pudimos cargar la configuración", variant: "destructive" });
    } finally {
      setCargando(false);
    }
  }, [user?.business_id, puedeBandeja, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirConversacion = async (conv) => {
    setActiva(conv);
    try {
      const rows = await base44.entities.WhatsAppMensaje.filter(
        { business_id: user.business_id, conversacion_id: conv.id }, "-created_date", 60,
      );
      setMensajes((rows || []).reverse());
    } catch {
      setMensajes([]);
    }
  };

  const guardarConfig = async () => {
    setGuardando(true);
    try {
      await base44.functions.invoke("whatsappAdmin", {
        action: "saveConfigSafe",
        business_id: user.business_id,
        ...form,
      });
      toast({ title: "Configuración guardada" });
      cargar();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos guardar"), variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const guardarNumeros = async () => {
    setGuardando(true);
    try {
      await base44.functions.invoke("whatsappAdmin", {
        action: "saveNumerosSafe",
        business_id: user.business_id,
        numeros,
      });
      toast({ title: "Lista de números actualizada" });
      cargar();
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos guardar los números"), variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const probar = async () => {
    setProbando(true);
    try {
      const r = await base44.functions.invoke("whatsappAdmin", {
        action: "sendTestSafe", business_id: user.business_id, indice: 0,
      });
      toast({ title: "Mensaje enviado", description: `Revisa el WhatsApp de ${r?.data?.enviado_a}.` });
    } catch (err) {
      toast({ title: mensajeDeError(err, "No se pudo enviar"), variant: "destructive" });
    } finally {
      setProbando(false);
    }
  };

  const estado = useMemo(() => {
    if (!config) return { tono: "neutro", texto: "Sin configurar" };
    if (config.ultimo_error) return { tono: "malo", texto: "Con un error" };
    if (!config.activo) return { tono: "neutro", texto: "Apagado" };
    const idOk = config.proveedor === "meta" ? config.provider_phone_number_id : config.provider_account_id;
    if (!idOk) return { tono: "medio", texto: "Falta conectarlo" };
    if (!numeros.length) return { tono: "medio", texto: "Sin números autorizados" };
    return { tono: "bueno", texto: "Encendido" };
  }, [config, numeros]);

  if (cargando || !form) {
    return (
      <div>
        <PageHeader title="Agente de WhatsApp" description="Cargando…" />
        <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Agente de WhatsApp"
        description="Tu equipo le escribe por WhatsApp y él registra gastos, ajusta inventario y te dice cómo va la semana."
        action={
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium",
              estado.tono === "bueno" && "border-verde/35 bg-verde/12 text-verde",
              estado.tono === "medio" && "border-amber/35 bg-amber/12 text-amber",
              estado.tono === "malo" && "border-rojo/35 bg-rojo/12 text-rojo",
              estado.tono === "neutro" && "border-border text-slate",
            )}
          >
            {estado.tono === "bueno" ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            )}
            {estado.texto}
          </span>
        }
      />

      {writeBlockedReason && (
        <p className="mb-5 rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber">{writeBlockedReason}</p>
      )}

      {config?.ultimo_error && (
        <div className="mb-5 rounded-md border border-rojo/30 bg-rojo/10 p-3">
          <p className="text-sm font-medium text-rojo">El último mensaje falló</p>
          <p className="mt-1 font-mono text-xs leading-relaxed text-slate">{config.ultimo_error}</p>
        </div>
      )}

      <Tabs defaultValue={puedeConfigurar ? "conexion" : "bandeja"}>
        <TabsList className="mb-6 grid w-full grid-cols-3">
          <TabsTrigger value="conexion" disabled={!puedeConfigurar}>Conexión</TabsTrigger>
          <TabsTrigger value="numeros" disabled={!puedeNumeros}>Quién puede</TabsTrigger>
          <TabsTrigger value="bandeja" disabled={!puedeBandeja}>Conversaciones</TabsTrigger>
        </TabsList>

        {/* ── Conexión ─────────────────────────────────────────────────── */}
        <TabsContent value="conexion" className="space-y-5">
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-chalk">Encender el agente</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate">
                  Cuando está encendido, contesta los mensajes que le lleguen desde los números que
                  autorizaste. A los demás les responde que este número es sólo para el equipo.
                </p>
              </div>
              <Switch
                checked={form.activo}
                onCheckedChange={(v) => setForm({ ...form, activo: v })}
                disabled={!puedeConfigurar}
                aria-label="Encender el agente"
              />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold text-chalk">Cómo se conecta</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate">
              Zernio se encarga de conectar tu WhatsApp Business sin que crees una app de Facebook.
              Meta directo te da más control, pero tienes que hacer ese trámite tú.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Proveedor</Label>
                <Select
                  value={form.proveedor}
                  onValueChange={(v) => setForm({ ...form, proveedor: v })}
                  disabled={!puedeConfigurar}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zernio">Zernio (recomendado)</SelectItem>
                    <SelectItem value="meta">Meta Cloud API</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="numvis">Tu número de WhatsApp</Label>
                <Input
                  id="numvis"
                  value={form.numero_visible}
                  onChange={(e) => setForm({ ...form, numero_visible: e.target.value })}
                  placeholder="+525512345678"
                  className="font-mono"
                  disabled={!puedeConfigurar}
                />
              </div>

              {form.proveedor === "zernio" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="accid">accountId de Zernio</Label>
                  <Input
                    id="accid"
                    value={form.provider_account_id}
                    onChange={(e) => setForm({ ...form, provider_account_id: e.target.value })}
                    placeholder="Lo encuentras en Connections → WhatsApp"
                    className="font-mono"
                    disabled={!puedeConfigurar}
                  />
                </div>
              ) : (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="pnid">Phone Number ID de Meta</Label>
                  <Input
                    id="pnid"
                    value={form.provider_phone_number_id}
                    onChange={(e) => setForm({ ...form, provider_phone_number_id: e.target.value })}
                    placeholder="En WhatsApp → API Setup"
                    className="font-mono"
                    disabled={!puedeConfigurar}
                  />
                </div>
              )}
            </div>

            {/* Deliberately does not ask for API keys. They live in the app's
                server-side secrets: anything typed into a form here would be
                readable by every member of the tenant. */}
            <p className="mt-4 flex items-start gap-2 rounded-md border border-border bg-steel-high/40 p-3 text-xs leading-relaxed text-slate">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verde" aria-hidden="true" />
              Las llaves de API no se capturan aquí: viven en el servidor, donde nadie del equipo
              puede leerlas. Si te falta configurarlas, escríbenos desde Soporte.
            </p>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold text-chalk">Cómo responde</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="agnom">Cómo se llama</Label>
                <Input
                  id="agnom"
                  value={form.agente_nombre}
                  onChange={(e) => setForm({ ...form, agente_nombre: e.target.value })}
                  placeholder="Kitch"
                  disabled={!puedeConfigurar}
                />
              </div>
              <div className="space-y-2">
                <Label>Tono</Label>
                <Select
                  value={form.agente_tono}
                  onValueChange={(v) => setForm({ ...form, agente_tono: v })}
                  disabled={!puedeConfigurar}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TONOS.map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[0.6875rem] text-slate-dim">
                  {TONOS.find((t) => t.id === form.agente_tono)?.nota}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <Label>Qué modelo lo mueve</Label>
              <Select
                value={form.modelo}
                onValueChange={(v) => setForm({ ...form, modelo: v })}
                disabled={!puedeConfigurar}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODELOS.map((m) => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[0.6875rem] leading-relaxed text-slate-dim">
                {MODELOS.find((m) => m.id === form.modelo)?.nota} Es tu decisión: uno más barato que
                lee mal un ticket te cuesta más de lo que ahorra.
              </p>
            </div>

            <div className="mt-3 space-y-2">
              <Label htmlFor="extra">Lo que debe saber de tu cocina</Label>
              <Textarea
                id="extra"
                rows={4}
                value={form.instrucciones_extra}
                onChange={(e) => setForm({ ...form, instrucciones_extra: e.target.value })}
                placeholder={'Ejemplo: "A La Central le compramos verdura los martes. Cuando digan \'el de la carne\' se refieren a Carnes Don Beto."'}
                disabled={!puedeConfigurar}
              />
              <p className="text-[0.6875rem] text-slate-dim">
                Cómo le llaman a las cosas aquí, quiénes son tus proveedores de siempre, tus horarios.
              </p>
            </div>
          </section>

          {puedeConfigurar && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={guardarConfig} disabled={guardando}>
                {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
              {config && numeros.length > 0 && (
                <Button variant="outline" onClick={probar} disabled={probando}>
                  {probando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Mandarme una prueba
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Números autorizados ──────────────────────────────────────── */}
        <TabsContent value="numeros" className="space-y-5">
          <div className="rounded-md border border-amber/25 bg-amber/10 p-4">
            <p className="flex items-start gap-2 text-sm leading-relaxed text-amber">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Quien esté en esta lista puede registrar gastos y mover inventario desde su celular,
                sin contraseña. Sólo hace falta tener ese número. Pon únicamente a tu gente.
              </span>
            </p>
          </div>

          <section className="overflow-hidden rounded-lg border border-border bg-card">
            {numeros.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate">
                Nadie autorizado todavía. El agente le contesta a todos que este número es sólo para el equipo.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {numeros.map((n, idx) => (
                  <li key={idx} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <UserCheck className="h-4 w-4 shrink-0 text-slate-dim" aria-hidden="true" />
                    <Input
                      value={n.nombre}
                      onChange={(e) => {
                        const next = [...numeros];
                        next[idx] = { ...n, nombre: e.target.value };
                        setNumeros(next);
                      }}
                      placeholder="Nombre"
                      className="h-9 w-full sm:w-40"
                      disabled={!puedeNumeros}
                      aria-label="Nombre de la persona"
                    />
                    <Input
                      value={n.numero}
                      onChange={(e) => {
                        const next = [...numeros];
                        next[idx] = { ...n, numero: e.target.value };
                        setNumeros(next);
                      }}
                      placeholder="5512345678"
                      inputMode="tel"
                      className="h-9 w-full font-mono sm:w-44"
                      disabled={!puedeNumeros}
                      aria-label="Número de WhatsApp"
                    />
                    <Select
                      value={n.rol || "staff"}
                      onValueChange={(v) => {
                        const next = [...numeros];
                        next[idx] = { ...n, rol: v };
                        setNumeros(next);
                      }}
                      disabled={!puedeNumeros}
                    >
                      <SelectTrigger className="h-9 w-full sm:w-44" aria-label="Con qué permisos actúa">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Como personal</SelectItem>
                        <SelectItem value="business_admin">Como dueño</SelectItem>
                      </SelectContent>
                    </Select>
                    {puedeNumeros && (
                      <button
                        type="button"
                        onClick={() => setNumeros(numeros.filter((_, i) => i !== idx))}
                        aria-label={`Quitar a ${n.nombre || n.numero}`}
                        className="ml-auto rounded-sm p-1.5 text-slate-dim transition-colors hover:bg-rojo/15 hover:text-rojo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {puedeNumeros && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setNumeros([...numeros, { numero: "", nombre: "", rol: "staff" }])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar a alguien
              </Button>
              <Button onClick={guardarNumeros} disabled={guardando}>
                {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar lista
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── Bandeja ──────────────────────────────────────────────────── */}
        <TabsContent value="bandeja">
          {conversaciones.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="Nadie le ha escrito todavía"
              body="En cuanto alguien mande un mensaje al número del negocio, la conversación aparece aquí — con lo que el agente entendió y lo que registró."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <ul className="space-y-1.5">
                {conversaciones.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => abrirConversacion(c)}
                      className={cn(
                        "w-full rounded-md border p-3 text-left transition-colors",
                        activa?.id === c.id
                          ? "border-copper bg-steel-high"
                          : "border-border bg-card hover:border-navy-high",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-chalk">
                          {c.nombre_contacto || c.telefono || "Sin nombre"}
                        </span>
                        {!c.autorizado && (
                          <span className="shrink-0 rounded-sm bg-rojo/20 px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase text-rojo">
                            no autorizado
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate">{c.ultimo_mensaje_texto}</p>
                      <p className="mt-1 font-mono text-[0.625rem] text-slate-dim">
                        {haceRato(c.ultimo_mensaje_at)} · {c.mensajes_count || 0} mensajes
                      </p>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="rounded-lg border border-border bg-card p-4">
                {!activa ? (
                  <p className="py-12 text-center text-sm text-slate">Elige una conversación.</p>
                ) : mensajes.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate">Sin mensajes guardados.</p>
                ) : (
                  <ul className="space-y-3">
                    {mensajes.map((m) => (
                      <li
                        key={m.id}
                        className={cn("flex", m.direccion === "entrante" ? "justify-start" : "justify-end")}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-lg px-3 py-2",
                            m.direccion === "entrante"
                              ? "bg-steel-high text-chalk"
                              : "bg-navy text-chalk",
                          )}
                        >
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.texto || "(adjunto)"}</p>

                          {/* What the bot actually DID for this message. This is
                              the line that lets someone trace a number in the
                              dashboard back to the sentence that caused it. */}
                          {Array.isArray(m.acciones) && m.acciones.length > 0 && (
                            <ul className="mt-2 space-y-0.5 border-t border-white/10 pt-2">
                              {m.acciones.map((a, i) => (
                                <li
                                  key={i}
                                  className={cn("font-mono text-[0.625rem]", a.ok ? "text-verde" : "text-rojo")}
                                >
                                  {a.ok ? "✓" : "✕"} {a.tool}
                                </li>
                              ))}
                            </ul>
                          )}

                          <p className="mt-1 text-right font-mono text-[0.5625rem] text-white/40">
                            {fechaHora(m.enviado_at || m.created_date)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
