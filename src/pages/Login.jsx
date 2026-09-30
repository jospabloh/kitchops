import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, Lock, LogIn, Mail } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";
import { KITCHOPS_SITE_URL, SOPORTE_EMAIL } from "@/lib/appConfig";
import VerifyEmailStep from "@/components/VerifyEmailStep";
import { needsEmailVerification } from "@/lib/emailVerification";

// Module 10 — the "pro" bar. Three things it has to get right beyond looking
// like the rest of the app:
//
// · REAL STATES. Wrong credentials, a locked-out account and a network failure
//   are three different problems with three different fixes, and a single
//   "Invalid email or password" for all of them sends people to support for
//   something they could have solved. Base44's auth errors are mapped below.
// · NO DEAD ENDS. Someone whose restaurant was suspended can't get past this
//   screen by trying harder — support has to be reachable from it. So does the
//   marketing page, for a person who arrived without an account.
// · SPANISH, in the same voice as the rest of the app.

// Base44 returns English strings for auth failures. Mapping on the message is
// unavoidable (there is no stable error code) but the FALLBACK is the important
// part: an unrecognised failure says something honest and actionable rather
// than blaming the password, which is the failure mode of `catch → "credenciales
// incorrectas"`.
function mensajeDeAuth(err) {
  const raw = String(err?.message || err?.data?.message || "").toLowerCase();
  if (!raw) return "No pudimos iniciar sesión. Revisa tu conexión e inténtalo otra vez.";
  // (Un correo sin verificar ya no llega aquí: handleSubmit abre el paso del código.)
  if (raw.includes("invalid") || raw.includes("incorrect") || raw.includes("credential") || raw.includes("password")) {
    return "Correo o contraseña incorrectos.";
  }
  if (raw.includes("not found") || raw.includes("no user")) {
    return "No encontramos una cuenta con ese correo.";
  }
  if (raw.includes("locked") || raw.includes("too many") || raw.includes("rate")) {
    return "Demasiados intentos. Espera un minuto antes de volver a intentar.";
  }
  if (raw.includes("verify") || raw.includes("confirm")) {
    return "Tu correo todavía no está verificado. Revisa tu bandeja de entrada.";
  }
  if (raw.includes("network") || raw.includes("fetch") || raw.includes("timeout")) {
    return "No pudimos conectar. Revisa tu internet e inténtalo otra vez.";
  }
  if (raw.includes("suspend") || raw.includes("disabled") || raw.includes("inactive")) {
    return "Tu cuenta está desactivada. Escríbenos y la revisamos.";
  }
  return "No pudimos iniciar sesión. Si sigue pasando, escríbenos y lo revisamos.";
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Correo sin verificar: se abre el paso donde escribir el código (con reenvío).
  const [verifying, setVerifying] = useState(false);
  // Post-login destination — the MCP OAuth consent page sends users here with
  // returnTo so the grant flow can resume. Same-origin paths only.
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      window.location.href = returnTo;
    } catch (err) {
      if (needsEmailVerification(err)) {
        // Base44 ya mandó el código al registrarse, pero puede haberse perdido
        // o vencido: pedimos uno nuevo al abrir el paso (best-effort).
        base44.auth.resendOtp(email).catch(() => {});
        setError("");
        setVerifying(true);
      } else {
        setError(mensajeDeAuth(err));
      }
      setLoading(false);
    }
    // No `finally`: on success the page is navigating away, and clearing the
    // spinner first makes the button flash "Entrar" during the redirect.
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", returnTo);
  };

  if (verifying) {
    return (
      <AuthLayout
        icon={Mail}
        title="Verifica tu correo"
        subtitle={`Tu correo todavía no está verificado. Escribe el código de 6 dígitos que enviamos a ${email}`}
      >
        <VerifyEmailStep
          email={email}
          password={password}
          onDone={({ needsLogin }) => {
            if (needsLogin) {
              setVerifying(false);
              setError("");
            } else {
              window.location.href = returnTo;
            }
          }}
          onCancel={() => setVerifying(false)}
          cancelLabel="Volver"
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={LogIn}
      title="Entrar"
      subtitle="Tu cocina, en orden."
      footer={
        <>
          ¿Todavía no tienes cuenta?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? `?returnTo=${encodeURIComponent(returnTo)}` : "")}
            className="font-medium text-copper hover:underline"
          >
            Crear una
          </Link>
        </>
      }
    >
      <Button variant="outline" className="mb-6 h-12 w-full text-sm font-medium" onClick={handleGoogle}>
        <GoogleIcon className="mr-2 h-5 w-5" />
        Continuar con Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-carbon px-3 font-mono text-[0.6875rem] uppercase tracking-widest text-slate-dim">
            o con tu correo
          </span>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-rojo/30 bg-rojo/10 p-3 text-sm text-rojo"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-dim" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              inputMode="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 pl-10"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <Link to="/forgot-password" className="text-xs text-copper hover:underline">
              ¿La olvidaste?
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-dim" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 pl-10"
              required
            />
          </div>
        </div>

        <Button type="submit" className="h-12 w-full font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Entrando…
            </>
          ) : (
            "Entrar"
          )}
        </Button>
      </form>

      {/* No dead ends (Module 10): somewhere to go for a prospective customer,
          and somewhere to go for a tenant who is locked out and cannot fix it
          from this screen no matter how carefully they type. */}
      <p className="mt-8 text-center text-xs leading-relaxed text-slate-dim">
        <a href={KITCHOPS_SITE_URL} className="text-copper hover:underline">
          Conoce KitchOps
        </a>
        {" · "}
        <a href={`mailto:${SOPORTE_EMAIL}?subject=No%20puedo%20entrar%20a%20KitchOps`} className="text-copper hover:underline">
          ¿No puedes entrar?
        </a>
      </p>
    </AuthLayout>
  );
}
