import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

// Base44 answers in English and without a stable code, so map on the message —
// and never show the raw SDK text to the person.
function mensajeDeReset(err) {
  const raw = String(err?.data?.message || err?.message || "").toLowerCase();
  if (raw.includes("expired") || raw.includes("invalid") || raw.includes("token")) {
    return "El enlace ya venció o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».";
  }
  if (raw.includes("weak") || raw.includes("short") || raw.includes("least") || raw.includes("characters")) {
    return "Esa contraseña es muy corta o muy sencilla. Prueba con una más larga.";
  }
  if (raw.includes("network") || raw.includes("fetch") || raw.includes("timeout")) {
    return "No pudimos conectar. Revisa tu internet e inténtalo otra vez.";
  }
  return "No pudimos cambiar tu contraseña. Inténtalo otra vez o pide un enlace nuevo.";
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.resetPassword({ resetToken, newPassword });
      window.location.href = "/login";
    } catch (err) {
      setError(mensajeDeReset(err));
    } finally {
      setLoading(false);
    }
  };

  if (!resetToken) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Enlace no válido"
        subtitle="A este enlace le falta información o ya no sirve"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Pedir un enlace nuevo
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          Parece que el enlace llegó incompleto. Pide un correo nuevo para cambiar tu contraseña.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title="Nueva contraseña"
      subtitle="Escribe la contraseña que quieres usar"
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nueva contraseña</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Repítela</Label>
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
              Guardando…
            </>
          ) : (
            "Cambiar contraseña"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
