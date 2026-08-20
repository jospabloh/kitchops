import React from "react";
import { LogoWordmark } from "@/components/Logo";

// Two columns on desktop: the form on the left, a brand panel on the right.
// Same skeleton every ACACIA app uses (stockflow, ctrlhq, rumbo), with
// KitchOps's own identity and copy.
//
// The right panel is where the photographic lockup earns its keep — it is the
// one surface big enough to show the mark at the size it was rendered for,
// against the dark ground it was rendered on.
export default function AuthLayout({ icon: Icon, title, subtitle = null, footer = null, children }) {
  return (
    <div className="min-h-screen bg-carbon text-chalk lg:grid lg:grid-cols-[1fr_1.1fr]">
      <div className="flex min-h-screen flex-col px-6 py-8 lg:min-h-0 lg:px-12">
        <LogoWordmark size={34} />

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="mb-7">
            {Icon && (
              <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-copper/15">
                <Icon className="h-5 w-5 text-copper" aria-hidden="true" />
              </span>
            )}
            <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-relaxed text-slate">{subtitle}</p>}
          </div>

          {children}

          {footer && <div className="mt-6 text-sm text-slate">{footer}</div>}
        </div>

        <p className="text-center text-[0.6875rem] text-slate-dim">
          KitchOps · una herramienta de ACACIA
        </p>
      </div>

      <div className="relative hidden overflow-hidden border-l border-border lg:block">
        {/* The gear mark, oversized and bled off the corner. The square mark
            rather than the horizontal lockup on purpose: the lockup's aspect
            ratio has nothing to do with this panel's, so object-cover crops it
            somewhere arbitrary and half a wordmark shows through, which reads as
            a mistake rather than as texture. A square crops predictably at any
            panel size, and the gear is a strong enough shape to survive it. */}
        <img
          src="/logo-512.jpg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-[18%] top-1/2 w-[85%] -translate-y-1/2 opacity-[0.12] blur-[1px]"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-carbon via-carbon/90 to-carbon/70" />
        <div className="absolute -left-24 top-1/4 h-96 w-96 rounded-full bg-copper/[0.07] blur-3xl" />

        <div className="absolute inset-0 flex flex-col justify-center px-12">
          <p className="eyebrow text-copper">Control de tu cocina</p>
          {/* Wrapped by max-width rather than by hard <br />: the display face
              is condensed, so hardcoded breaks that look right in it fall apart
              the moment the font hasn't loaded yet. */}
          <h2 className="mt-4 max-w-[13ch] font-display text-[3.25rem] font-bold uppercase leading-[0.92] tracking-tight">
            Sabes cuánto vendiste.{" "}
            <span className="text-copper">¿Sabes cuánto te quedó?</span>
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-slate">
            Gastos, cortes de Rappi y Uber Eats, inventario y alertas en un solo lugar — y un
            asistente en WhatsApp para capturarlos sin abrir la computadora.
          </p>
        </div>
      </div>
    </div>
  );
}
