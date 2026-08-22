import React from "react";
import { AlertTriangle } from "lucide-react";
import { LogoWordmark } from "@/components/Logo";

// "Signed in, but this app has no account for you" — distinct from "not signed
// in", which ProtectedRoute handles by sending people to /login.
//
// This was Base44 scaffold until 2026-08-22: English copy on `bg-white` and
// `text-slate-600`, neither of which exists in this app. tailwind.config.js
// replaces Tailwind's numeric `slate` scale with a two-value token, so every one
// of those classes compiled to nothing and the screen rendered as unstyled text
// on whatever ground it landed on.
const UserNotRegisteredError = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6">
      <LogoWordmark size={30} />

      <div className="w-full max-w-md rounded-md border border-border bg-card p-8">
        <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber/15 text-amber">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>

        <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-foreground">
          Tu cuenta no tiene acceso
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate">
          Iniciaste sesión correctamente, pero este restaurante todavía no te ha
          dado de alta. Pídele al dueño o al gerente que te agregue desde
          <span className="text-foreground"> Cuenta → Equipo</span>.
        </p>

        <div className="mt-6 rounded-md border border-border bg-muted p-4 text-sm text-slate">
          <p className="text-foreground">Si crees que es un error:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Revisa que sea el correo con el que te invitaron.</li>
            <li>Cierra sesión y vuelve a entrar.</li>
            <li>Escríbenos si sigue igual.</li>
          </ul>
        </div>

        <a
          href="mailto:soporte@acaciaco.com.mx"
          className="mt-6 inline-flex text-sm font-medium text-copper underline-offset-4 hover:text-ember hover:underline"
        >
          soporte@acaciaco.com.mx
        </a>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;
