import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { mensajeDeError } from "@/lib/format";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, ChefHat, Clock, KeyRound, Loader2, Store } from "lucide-react";
import { cn } from "@/lib/utils";

// Where every account starts, and where the tenant switcher's "crear o unirme a
// otro" lands. Two paths, deliberately given equal weight on screen: the owner
// setting up their restaurant, and the cook joining one that already exists.
//
// Joining with a code does NOT grant access: it files a request that the
// restaurant's owner approves inside the app (Cuenta > Equipo), choosing the
// role. The request lives on the server (User.pending_business_id), so the
// "Solicitud enviada" screen below survives a reload.
//
// Both go through the complete-onboarding function — it is the only place
// User.role and User.business_id are ever written, because the schema
// field-locks both to admin-only writes precisely so a browser cannot assign
// itself a tenant.
export default function Onboarding() {
  const { user, checkUserAuth, logout } = useAuth();
  const [modo, setModo] = useState(null); // null | "create" | "join"
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  // Solicitud pendiente: null = todavía no sabemos; false = no hay.
  const [pendiente, setPendiente] = useState(user?.pending_business_id ? { businessName: "" } : null);

  const consultar = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("complete-onboarding", { mode: "status" });
      const data = res?.data ?? res;
      setPendiente(data?.pending ? { businessName: data.businessName || "" } : false);
    } catch {
      setPendiente((p) => p ?? false);
    }
  }, []);

  // Al montar (y por tanto tras recargar): ¿hay una solicitud abierta?
  useEffect(() => { consultar(); }, [consultar]);

  const cancelarSolicitud = async () => {
    setError("");
    setCargando(true);
    try {
      await base44.functions.invoke("complete-onboarding", { mode: "cancel" });
      setPendiente(false);
      setModo(null);
      await checkUserAuth();
    } catch (err) {
      setError(mensajeDeError(err, "No pudimos cancelar la solicitud."));
    } finally {
      setCargando(false);
    }
  };

  const revisarAprobacion = async () => {
    setError("");
    setCargando(true);
    try {
      const u = await checkUserAuth();
      if (u?.business_id) {
        window.location.href = "/";
        return;
      }
      await consultar();
    } finally {
      setCargando(false);
    }
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const res = await base44.functions.invoke("complete-onboarding", {
        mode: modo,
        businessName: nombre,
        inviteCode: codigo,
      });
      if (modo === "join") {
        // Unirse sólo envía una solicitud: no hay acceso hasta que el dueño la
        // apruebe, así que no se recarga la app.
        const data = res?.data ?? res;
        setPendiente({ businessName: data?.businessName || "" });
        setCargando(false);
        return;
      }
      await checkUserAuth();
      // Full reload: the whole app is scoped to the tenant that was active when
      // it mounted, and this is the moment that changes.
      window.location.href = "/";
    } catch (err) {
      setError(mensajeDeError(err, "No pudimos completar el registro."));
      setCargando(false);
    }
  };

  if (pendiente) {
    return (
      <AuthLayout
        icon={Clock}
        title="Solicitud enviada"
        subtitle={
          pendiente.businessName
            ? `Esperando a que el dueño de ${pendiente.businessName} te apruebe.`
            : "Esperando a que el dueño del negocio te apruebe."
        }
        footer={
          <button type="button" onClick={() => logout()} className="text-slate-dim hover:text-slate">
            Cerrar sesión
          </button>
        }
      >
        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-rojo/30 bg-rojo/10 p-3 text-sm text-rojo">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <p className="text-sm leading-relaxed text-slate">
          Le avisamos a quien administra el negocio. Cuando te apruebe y te asigne un rol, entras
          con este mismo correo. Puedes cerrar esta pantalla: tu solicitud queda guardada.
        </p>
        <Button className="mt-6 h-12 w-full font-medium" onClick={revisarAprobacion} disabled={cargando}>
          {cargando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Ya me aprobaron, revisar
        </Button>
        <Button variant="outline" className="mt-3 h-12 w-full" onClick={cancelarSolicitud} disabled={cargando}>
          Cancelar solicitud
        </Button>
      </AuthLayout>
    );
  }

  if (!modo) {
    return (
      <AuthLayout
        icon={ChefHat}
        title="Empecemos"
        subtitle="¿Vas a dar de alta tu restaurante, o te vas a unir a uno que ya está en KitchOps?"
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setModo("create")}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border border-border bg-card p-4 text-left",
              "transition-colors hover:border-copper hover:bg-steel-high",
            )}
          >
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-copper/15">
              <Store className="h-4 w-4 text-copper" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-display text-base font-semibold text-chalk">
                Dar de alta mi restaurante
              </span>
              <span className="mt-0.5 block text-sm leading-relaxed text-slate">
                Creas el negocio y quedas como dueño. Después invitas a tu equipo.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setModo("join")}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border border-border bg-card p-4 text-left",
              "transition-colors hover:border-copper hover:bg-steel-high",
            )}
          >
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-navy/40">
              <KeyRound className="h-4 w-4 text-slate" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-display text-base font-semibold text-chalk">
                Unirme con un código
              </span>
              <span className="mt-0.5 block text-sm leading-relaxed text-slate">
                Tu jefe te pasó un código de invitación de 8 caracteres. El dueño aprueba tu acceso.
              </span>
            </span>
          </button>
        </div>
      </AuthLayout>
    );
  }

  const creando = modo === "create";

  return (
    <AuthLayout
      icon={creando ? Store : KeyRound}
      title={creando ? "Tu restaurante" : "Unirte"}
      subtitle={
        creando
          ? "Sólo necesitamos el nombre. Todo lo demás lo configuras después."
          : "Escribe el código que te dieron. Enviaremos una solicitud al dueño del negocio."
      }
      footer={
        <button type="button" onClick={() => { setModo(null); setError(""); }} className="text-copper hover:underline">
          ← Volver
        </button>
      }
    >
      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-rojo/30 bg-rojo/10 p-3 text-sm text-rojo">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={enviar} className="space-y-4">
        {creando ? (
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre del restaurante</Label>
            <Input
              id="nombre"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Taquería La Esquina"
              className="h-12"
              required
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="codigo">Código de invitación</Label>
            <Input
              id="codigo"
              autoFocus
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="AB3KM9XZ"
              maxLength={8}
              className="h-12 font-mono text-lg uppercase tracking-[0.3em]"
              required
            />
          </div>
        )}

        <Button type="submit" className="h-12 w-full font-medium" disabled={cargando}>
          {cargando ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {creando ? "Creando…" : "Enviando…"}
            </>
          ) : creando ? (
            "Crear mi restaurante"
          ) : (
            "Enviar solicitud"
          )}
        </Button>
      </form>

      {creando && (
        <p className="mt-5 text-xs leading-relaxed text-slate-dim">
          Empiezas con 30 días de prueba, sin tarjeta.
        </p>
      )}
    </AuthLayout>
  );
}
