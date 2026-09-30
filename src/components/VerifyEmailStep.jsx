import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "@/components/ui/use-toast";
import { AlertCircle, Loader2 } from "lucide-react";
import { cleanOtp, mensajeDeOtp } from "@/lib/emailVerification";

// Paso "escribe el código que te llegó al correo", compartido por Register (tras
// crear la cuenta) y Login (cuando el correo aún no está verificado).
//
// El registro con correo/contraseña manda un código por correo; sin un lugar
// donde escribirlo la cuenta nunca queda verificada y el login responde "verifica
// tu correo" sin salida. Este componente es esa salida.
//
// Al verificar: si la respuesta trae token se usa; si no, se intenta iniciar
// sesión con la contraseña que la persona ya tecleó; y si eso también falla se
// manda a /login (`onDone({ needsLogin: true })`), nunca se deja en un callejón.
export default function VerifyEmailStep({ email, password, onDone, onCancel, cancelLabel = "Usar otro correo" }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");

  const verificar = async () => {
    const otpCode = cleanOtp(code);
    if (busy || otpCode.length < 6) return;
    setError("");
    setBusy(true);
    let result;
    try {
      result = await base44.auth.verifyOtp({ email, otpCode });
    } catch (err) {
      setError(mensajeDeOtp(err, "Código inválido o vencido."));
      setBusy(false);
      return;
    }
    try {
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
      } else if (password) {
        await base44.auth.loginViaEmailPassword(email, password);
      } else {
        throw new Error("sin sesión");
      }
      toast({ title: "Correo verificado" });
      onDone({ needsLogin: false });
    } catch {
      toast({ title: "Correo verificado", description: "Ahora inicia sesión." });
      onDone({ needsLogin: true });
    }
    // Sin `finally`: al terminar la página navega, y apagar el spinner antes
    // hace parpadear el botón durante la redirección.
  };

  const reenviar = async () => {
    setError("");
    setResending(true);
    try {
      await base44.auth.resendOtp(email);
      toast({ title: "Código enviado", description: "Revisa tu correo, y la carpeta de spam." });
    } catch (err) {
      setError(mensajeDeOtp(err, "No pudimos reenviar el código."));
    } finally {
      setResending(false);
    }
  };

  return (
    <div>
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-rojo/30 bg-rojo/10 p-3 text-sm text-rojo"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      <div className="mb-6 flex justify-center">
        <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus autoComplete="one-time-code">
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>
      <Button className="h-12 w-full font-medium" onClick={verificar} disabled={busy || cleanOtp(code).length < 6}>
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verificando…
          </>
        ) : (
          "Verificar"
        )}
      </Button>
      <p className="mt-4 text-center text-sm text-slate">
        ¿No te llegó el código?{" "}
        <button type="button" onClick={reenviar} disabled={resending} className="font-medium text-copper hover:underline">
          {resending ? "Enviando…" : "Reenviar código"}
        </button>
      </p>
      {onCancel && (
        <p className="mt-2 text-center text-xs">
          <button type="button" onClick={onCancel} className="text-slate-dim hover:text-slate">
            {cancelLabel}
          </button>
        </p>
      )}
    </div>
  );
}
