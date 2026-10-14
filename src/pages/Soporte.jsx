import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionContext";
import { fechaHora, haceRato, mensajeDeError } from "@/lib/format";
import { conRegistro } from "@/lib/registros";
import { APP_VERSION } from "@/lib/appConfig";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, LifeBuoy, Loader2, Send } from "lucide-react";

const CATEGORIAS = [
  { id: "soporte", label: "Algo no funciona" },
  { id: "mejora", label: "Se me ocurre una mejora" },
  { id: "facturacion", label: "Facturación o pago" },
  { id: "cuenta", label: "Mi cuenta o mi licencia" },
];

const ESTADO = {
  submitted: { label: "Enviado", icono: Clock, clase: "text-amber" },
  in_progress: { label: "Lo estamos viendo", icono: Clock, clase: "text-copper" },
  waiting_customer: { label: "Esperamos tu respuesta", icono: Clock, clase: "text-copper" },
  resolved: { label: "Resuelto", icono: CheckCircle2, clase: "text-verde" },
};

const VACIO = { subject: "", category: "soporte", message: "" };

// Module 8. The ticket is written to KitchOps first, then Mission Control pulls
// it into the portfolio-wide queue where an operator actually triages it. That
// is why this page has no status controls beyond reading them: a per-app triage
// UI would be a second, diverging queue, which is exactly what the standard's
// Module 0 warns against.
export default function Soporte() {
  const { user, business } = useAuth();
  const { can, writeBlockedReason } = usePermissions();
  const { toast } = useToast();

  const [tickets, setTickets] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [activo, setActivo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [respuesta, setRespuesta] = useState("");
  const [error, setError] = useState("");

  // Opening a ticket skips the billing gate on purpose: createTicketSafe runs
  // with ignoreBillingBlock, because a suspended tenant is the one most likely
  // to need support (and the suspension banner sends them here). Replying still
  // goes through the full gate server-side, so the reply box keeps it too.
  const puedeEnviar = can("Soporte:create", { ignoreBilling: true });
  const puedeResponder = can("Soporte:create");

  const cargar = useCallback(async () => {
    if (!user?.business_id) return;
    setCargando(true);
    try {
      const rows = await base44.entities.SupportTicket.filter(
        { business_id: user.business_id }, "-created_date", 100,
      );
      setTickets(rows || []);
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  }, [user?.business_id]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrir = async (t) => {
    setActivo(t);
    setRespuesta("");
    try {
      const rows = await base44.entities.SupportTicketMessage.filter(
        { business_id: user.business_id, ticket_id: t.id }, "created_date", 100,
      );
      setMensajes(rows || []);
    } catch {
      setMensajes([]);
      return;
    }
    // Best-effort and separate from the read above: clearing the badge can be
    // refused (e.g. a view_only tenant hits the write gate), and that must never
    // wipe the thread the person just opened to read.
    if (t.unread_for_tenant) {
      base44.functions
        .invoke("soporte", { action: "markThreadReadSafe", ticket_id: t.id, business_id: user.business_id })
        .then(() => setTickets((list) => list.map((x) => (x.id === t.id ? { ...x, unread_for_tenant: false } : x))))
        .catch(() => {});
    }
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const r = await base44.functions.invoke("soporte", {
        action: "createTicketSafe",
        business_id: user.business_id,
        ...form,
        app_version: APP_VERSION,
      });
      // Aviso en tiempo real a ACACIA Mission Control (no bloquea la UI). Sin
      // esto el ticket sólo se veía en el siguiente sync diario de las 08:00
      // UTC, así que quien escribía a las 09:00 esperaba 23 horas a que
      // soporte se enterara. Mission Control recibe sólo {app, ticketId} y lee
      // el ticket real por el puente acaciaControl antes de confiar en el
      // aviso: un cuerpo falsificado no inyecta nada y aquí no viaja ningún
      // secreto. Mismo camino que cateqhub, ctrlhq, flowfin y stockflow.
      const ticketId = r?.data?.ticket?.id;
      if (ticketId) {
        fetch("https://control.acaciaco.com.mx/api/ingest/ticket-pull", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ app: "kitchops", ticketId }),
        }).catch(() => {});
      }
      toast({ title: "Enviado", description: "Te respondemos por aquí y por correo." });
      setForm(VACIO);
      // Use the row the function returned: a filter right after the write can
      // still miss it, and the list would claim "Todavía no nos has escrito".
      if (r?.data?.ticket) setTickets((list) => conRegistro(list, r.data.ticket));
    } catch (err) {
      setError(mensajeDeError(err, "No pudimos enviar tu mensaje."));
    } finally {
      setEnviando(false);
    }
  };

  const responder = async () => {
    if (!respuesta.trim() || !activo) return;
    setEnviando(true);
    try {
      const r = await base44.functions.invoke("soporte", {
        action: "replyTicketSafe",
        ticket_id: activo.id,
        business_id: user.business_id,
        message: respuesta,
      });
      const enviado = respuesta;
      setRespuesta("");
      // Same read-after-write gap as above: show the reply we just sent rather
      // than re-reading a thread that may not have it yet.
      setMensajes((list) => [
        ...list,
        {
          id: `local-${Date.now()}`,
          author_role: "tenant",
          author_name: user.full_name || user.email || "",
          body: enviado,
          sent_at: new Date().toISOString(),
        },
      ]);
      if (r?.data?.ticket) {
        setTickets((list) => conRegistro(list, r.data.ticket));
        setActivo(r.data.ticket);
      }
    } catch (err) {
      toast({ title: mensajeDeError(err, "No pudimos enviar tu respuesta"), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Soporte"
        description="Cuéntanos qué pasó o qué te gustaría que hiciera KitchOps. Contestamos en horas hábiles."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {puedeEnviar && (
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold text-chalk">Escríbenos</h2>

            <form onSubmit={enviar} className="mt-4 space-y-4">
              {error && <p role="alert" className="rounded-md border border-rojo/30 bg-rojo/10 p-3 text-sm text-rojo">{error}</p>}

              <div className="space-y-2">
                <Label>¿De qué se trata?</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="asunto">En pocas palabras</Label>
                <Input
                  id="asunto"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="No me deja guardar un gasto"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mensaje">Cuéntanos con detalle</Label>
                <Textarea
                  id="mensaje"
                  rows={6}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Qué estabas haciendo, qué esperabas que pasara y qué pasó en su lugar."
                  required
                />
                <p className="text-[0.6875rem] text-slate-dim">
                  Mientras más concreto, más rápido lo resolvemos.
                </p>
              </div>

              <Button type="submit" disabled={enviando} className="w-full">
                {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar
              </Button>
            </form>
          </section>
        )}

        <section>
          <h2 className="eyebrow mb-3">Tus mensajes</h2>

          {cargando ? (
            <div className="space-y-2">
              {[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-card" />)}
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
              <LifeBuoy className="mx-auto mb-3 h-7 w-7 text-slate-dim" aria-hidden="true" />
              <p className="text-sm text-slate">Todavía no nos has escrito.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {tickets.map((t) => {
                const est = ESTADO[t.status] || ESTADO.submitted;
                const EstIcono = est.icono;
                const abierto = activo?.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => (abierto ? setActivo(null) : abrir(t))}
                      className={cn(
                        "w-full rounded-lg border bg-card p-4 text-left transition-colors",
                        abierto ? "border-copper" : "border-border hover:border-navy-high",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-chalk">{t.subject}</span>
                          <span className="mt-0.5 block font-mono text-[0.6875rem] text-slate-dim">
                            {haceRato(t.created_date)}
                            {t.unread_for_tenant && <span className="ml-2 text-copper">· respuesta nueva</span>}
                          </span>
                        </span>
                        <span className={cn("flex shrink-0 items-center gap-1 text-xs", est.clase)}>
                          <EstIcono className="h-3.5 w-3.5" aria-hidden="true" />
                          {est.label}
                        </span>
                      </div>
                    </button>

                    {abierto && (
                      <div className="mt-2 rounded-lg border border-border bg-card p-4">
                        <ul className="space-y-3">
                          {mensajes.map((m) => (
                            <li
                              key={m.id}
                              className={cn("flex", m.author_role === "owner" ? "justify-start" : "justify-end")}
                            >
                              <div
                                className={cn(
                                  "max-w-[85%] rounded-lg px-3 py-2",
                                  m.author_role === "owner" ? "bg-navy text-on-brand" : "bg-secondary text-foreground",
                                )}
                              >
                                <p className="eyebrow mb-1">
                                  {m.author_role === "owner" ? "Soporte ACACIA" : m.author_name || "Tú"}
                                </p>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                                <p className="mt-1 text-right font-mono text-[0.5625rem] opacity-60">
                                  {fechaHora(m.sent_at || m.created_date)}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>

                        {!puedeResponder && puedeEnviar && t.status !== "resolved" && writeBlockedReason && (
                          <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-slate">
                            Mientras tu negocio esté en solo lectura o suspendido no puedes responder
                            aquí. Escríbenos un mensaje nuevo desde «Escríbenos» y lo vemos.
                          </p>
                        )}

                        {puedeResponder && t.status !== "resolved" && (
                          <div className="mt-4 space-y-2 border-t border-border pt-4">
                            <Textarea
                              rows={3}
                              value={respuesta}
                              onChange={(e) => setRespuesta(e.target.value)}
                              placeholder="Responder…"
                              aria-label="Tu respuesta"
                            />
                            <Button size="sm" onClick={responder} disabled={enviando || !respuesta.trim()}>
                              {enviando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                              Responder
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-8 text-center text-xs text-slate-dim">
        {business?.name} · KitchOps v{APP_VERSION}
      </p>
    </div>
  );
}
