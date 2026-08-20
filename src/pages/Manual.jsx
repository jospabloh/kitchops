import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { buscarEnManual, MANUAL } from "@/lib/helpData";
import { SOPORTE_EMAIL } from "@/lib/appConfig";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { BookOpen, LifeBuoy, Search } from "lucide-react";

export default function Manual() {
  const [busqueda, setBusqueda] = useState("");
  const [seccionActiva, setSeccionActiva] = useState(MANUAL[0].id);

  const resultados = useMemo(() => buscarEnManual(busqueda), [busqueda]);
  const buscando = busqueda.trim().length > 0;

  const visibles = buscando ? resultados : resultados.filter((s) => s.id === seccionActiva);
  const totalResultados = resultados.reduce((n, s) => n + s.entradas.length, 0);

  return (
    <div>
      <PageHeader
        title="Manual"
        description="Cómo funciona cada parte, en corto."
      />

      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-dim" aria-hidden="true" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar — por ejemplo: depósito, mínimo, WhatsApp"
          className="pl-9"
          aria-label="Buscar en el manual"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        {/* Section list doubles as the search-scope indicator: while searching
            it steps back and the results take over, rather than sitting there
            implying a filter that is no longer applied. */}
        <nav className={cn("space-y-0.5", buscando && "pointer-events-none opacity-40")} aria-label="Secciones del manual">
          {MANUAL.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSeccionActiva(s.id)}
              aria-current={!buscando && seccionActiva === s.id ? "true" : undefined}
              className={cn(
                "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                !buscando && seccionActiva === s.id
                  ? "border-l-2 border-copper bg-steel-high pl-[0.625rem] font-medium text-chalk"
                  : "text-slate hover:bg-steel-high hover:text-chalk",
              )}
            >
              {s.titulo}
            </button>
          ))}
        </nav>

        <div>
          {buscando && (
            <p className="mb-4 text-sm text-slate">
              {totalResultados === 0
                ? "Nada coincide con esa búsqueda."
                : `${totalResultados} ${totalResultados === 1 ? "resultado" : "resultados"} para “${busqueda}”.`}
            </p>
          )}

          {visibles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
              <BookOpen className="mx-auto mb-3 h-7 w-7 text-slate-dim" aria-hidden="true" />
              <h3 className="font-display text-lg font-semibold text-chalk">No encontramos eso</h3>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate">
                Prueba con otra palabra, o pregúntanos directo —{" "}
                <Link to="/soporte" className="text-copper hover:underline">te contestamos</Link>.
              </p>
            </div>
          ) : (
            visibles.map((seccion) => (
              <section key={seccion.id} className="mb-8 last:mb-0">
                {buscando && <h2 className="eyebrow mb-2">{seccion.titulo}</h2>}
                <Accordion type="multiple" className="space-y-2">
                  {seccion.entradas.map((e, i) => (
                    <AccordionItem
                      key={i}
                      value={`${seccion.id}-${i}`}
                      className="overflow-hidden rounded-lg border border-border bg-card px-4"
                    >
                      <AccordionTrigger className="py-3.5 text-left text-sm font-medium text-chalk hover:no-underline">
                        {e.q}
                      </AccordionTrigger>
                      <AccordionContent className="pb-4 text-sm leading-relaxed text-slate">
                        {e.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            ))
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-5">
            <LifeBuoy className="h-5 w-5 shrink-0 text-copper" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-semibold text-chalk">¿No encontraste lo que buscabas?</p>
              <p className="mt-0.5 text-sm text-slate">
                Escríbenos desde <Link to="/soporte" className="text-copper hover:underline">Soporte</Link>{" "}
                o a <a href={`mailto:${SOPORTE_EMAIL}`} className="text-copper hover:underline">{SOPORTE_EMAIL}</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
