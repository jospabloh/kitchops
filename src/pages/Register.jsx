import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import VerifyEmailStep from "@/components/VerifyEmailStep";
import { safeReturnTo } from "@/lib/authReturnTo";

// Base44 responde en inglés; el fallback es honesto y accionable.
function mensajeDeRegistro(err) {
  const raw = String(err?.message || err?.data?.message || "").toLowerCase();
  if (raw.includes("already") || raw.includes("exists") || raw.includes("registered")) {
    return "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.";
  }
  if (raw.includes("password")) return "La contraseña no es válida. Usa al menos 8 caracteres.";
  if (raw.includes("email")) return "Revisa que el correo esté bien escrito.";
  if (raw.includes("network") || raw.includes("fetch") || raw.includes("timeout")) {
    return "No pudimos conectar. Revisa tu internet e inténtalo otra vez.";
  }
  return "No pudimos crear tu cuenta. Inténtalo otra vez o escríbenos.";
}

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);

  const loginQuery = safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.register({ email, password });
      setShowOtp(true);
    } catch (err) {
      setError(mensajeDeRegistro(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", safeReturnTo());
  };

  if (showOtp) {
    return (
      <AuthLayout
        icon={Mail}
        title="Verifica tu correo"
        subtitle={`Enviamos un código de 6 dígitos a ${email}`}
      >
        <VerifyEmailStep
          email={email}
          password={password}
          onDone={({ needsLogin }) => {
            window.location.href = needsLogin ? "/login" + loginQuery : safeReturnTo();
          }}
          onCancel={() => {
            setShowOtp(false);
            setError("");
          }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Crea tu cuenta"
      subtitle="Regístrate para empezar"
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link
            to={"/login" + loginQuery}
            className="text-primary font-medium hover:underline"
          >
            Entrar
          </Link>
        </>
      }
    >
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continuar con Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">o con tu correo</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar contraseña</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creando cuenta…
            </>
          ) : (
            "Crear cuenta"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
