import React, { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  Gauge,
  LifeBuoy,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  Truck,
  UserCircle,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/PermissionContext";
import { useAuth } from "@/lib/AuthContext";
import { ROLE_LABELS } from "@/lib/rbac";
import { LogoMark } from "@/components/Logo";

// Grouped, because a flat list of twelve links makes everything look equally
// important. The order is the working day: what's wrong → what it cost → what
// you have → who and how.
const GRUPOS = [
  {
    titulo: null,
    items: [
      { path: "/", label: "Resumen", icon: Gauge, permission: "Dashboard:view" },
      { path: "/alertas", label: "Alertas", icon: AlertTriangle, permission: "Alertas:view" },
    ],
  },
  {
    titulo: "Dinero",
    items: [
      { path: "/gastos", label: "Gastos", icon: Receipt, permission: "Gastos:view" },
      { path: "/ingresos", label: "Cortes", icon: Wallet, permission: "Ingresos:view" },
    ],
  },
  {
    titulo: "Cocina",
    items: [
      { path: "/inventario", label: "Inventario", icon: Package, permission: "Inventario:view" },
      { path: "/proveedores", label: "Proveedores", icon: Truck, permission: "Proveedores:view" },
    ],
  },
  {
    titulo: "Negocio",
    items: [
      { path: "/whatsapp", label: "WhatsApp", icon: MessageCircle, permission: "WhatsApp:view" },
      { path: "/bitacora", label: "Bitácora", icon: ScrollText, permission: "Bitacora:view" },
      { path: "/configuracion", label: "Configuración", icon: Settings, permission: "Configuracion:view" },
      { path: "/permisos", label: "Permisos", icon: Shield, permission: "Cuenta:manage_members" },
      { path: "/cuenta", label: "Cuenta", icon: UserCircle },
    ],
  },
  {
    titulo: "Ayuda",
    items: [
      { path: "/manual", label: "Manual", icon: BookOpen },
      { path: "/soporte", label: "Soporte", icon: LifeBuoy },
    ],
  },
];

// Module 1's read-only degrade, made visible. This banner never offers a way to
// change the status: billing_status is written by Mission Control's cron alone,
// and a "reactivar" button here would be a lie about who owns that decision.
const BANNER = {
  view_only: {
    icono: AlertTriangle,
    texto: "Tu negocio está en solo lectura. Puedes consultar todo, pero no guardar cambios.",
    clase: "bg-amber/15 text-amber border-amber/30",
  },
  suspended: {
    icono: AlertTriangle,
    texto: "Tu negocio está suspendido. Escríbenos desde Soporte para reactivarlo.",
    clase: "bg-rojo/15 text-rojo border-rojo/30",
  },
};

export default function Layout() {
  const location = useLocation();
  const [abierto, setAbierto] = useState(false);
  const { can, business } = usePermissions();
  const { user, logout } = useAuth();

  const grupos = GRUPOS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.permission || can(i.permission)),
  })).filter((g) => g.items.length > 0);

  const banner = BANNER[business?.billing_status];
  const enPrueba = business?.billing_status === "trial";

  return (
    <div className="min-h-screen bg-carbon">
      {/* Mobile bar */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 lg:hidden">
        <span className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="font-display text-base font-bold uppercase tracking-wide">
            <span className="text-copper">Kitch</span>
            <span className="text-chalk">Ops</span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={abierto}
          className="rounded-sm p-1.5 text-slate transition-colors hover:bg-steel-high hover:text-chalk"
        >
          {abierto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:translate-x-0",
          abierto ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* The restaurant you're in is the headline; the app is the subtitle.
            In a multi-tenant app the numbers look identical whichever tenant
            you're in, so never naming the current one leaves you guessing. */}
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
          <LogoMark size={34} />
          <div className="min-w-0">
            <p
              className="truncate font-display text-sm font-semibold uppercase tracking-wide text-chalk"
              title={business?.name || "KitchOps"}
            >
              {business?.name || "KitchOps"}
            </p>
            <p className="truncate text-[0.6875rem] text-slate-dim">KitchOps</p>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {grupos.map((grupo) => (
            <div key={grupo.titulo || "principal"}>
              {grupo.titulo && <p className="eyebrow mb-1.5 px-3">{grupo.titulo}</p>}
              <div className="space-y-0.5">
                {grupo.items.map((item) => {
                  const Icon = item.icon;
                  const activo = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setAbierto(false)}
                      aria-current={activo ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                        activo
                          ? // The active item is marked by a copper edge rather
                            // than a filled pill: at this density a row of
                            // filled blocks turns the sidebar into a chart.
                            "border-l-2 border-copper bg-steel-high pl-[0.625rem] font-medium text-chalk"
                          : "text-sidebar-foreground hover:bg-steel-high hover:text-chalk",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", activo && "text-copper")} aria-hidden="true" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {enPrueba && business?.trial_end_at && (
          <div className="shrink-0 border-t border-sidebar-border px-4 py-3">
            <p className="eyebrow text-copper">Periodo de prueba</p>
            <p className="mt-1 text-xs leading-relaxed text-slate">
              Termina el{" "}
              <span className="money text-chalk">
                {new Date(business.trial_end_at).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
              </span>
              .
            </p>
          </div>
        )}

        {/* Who you are, and what you are inside this restaurant.
            In a multi-tenant app where one person can be dueño of one business
            and personal in another, "which account am I signed in as" and "what
            can I do here" are two different questions, and both get answered
            wrong from memory. The role label is not decoration: it is why a
            given button is or isn't on screen. */}
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-copper/20 font-display text-sm font-bold uppercase text-copper"
              aria-hidden="true"
            >
              {(user?.full_name || user?.email || "?").trim().charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-chalk" title={user?.email}>
                {user?.full_name || user?.email || "Sin sesión"}
              </p>
              {/* Role only — the tenant is already the sidebar's headline right
                  above, and repeating it here just truncated both. */}
              <p className="truncate text-[0.6875rem] text-slate-dim">
                {ROLE_LABELS[user?.role] || user?.role || "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => logout()}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="shrink-0 rounded-sm p-1.5 text-slate-dim transition-colors hover:bg-steel-high hover:text-chalk"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {abierto && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setAbierto(false)}
          aria-hidden="true"
        />
      )}

      <main className="min-h-screen pt-14 lg:ml-64 lg:pt-0">
        {banner && (
          <div className={cn("flex items-center gap-2 border-b px-4 py-2.5 text-sm font-medium", banner.clase)}>
            <banner.icono className="h-4 w-4 shrink-0" aria-hidden="true" />
            {banner.texto}
          </div>
        )}
        {/* The bottom padding keeps the last row's controls (delete, edit) clear of
            the corner theme switcher, which is fixed bottom-right at every
            width: without it, the last row's button sits under the switcher
            at the end of the page and a tap lands on the theme track. */}
        <div className="mx-auto max-w-6xl p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-24">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
