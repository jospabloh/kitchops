import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { PermissionProvider } from "@/lib/PermissionContext";
import SessionHeartbeat from "@/lib/SessionHeartbeat";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";
import ProtectedRoute from "@/components/ProtectedRoute";
import ScrollToTop from "./components/ScrollToTop";
import Layout from "@/components/Layout";

import Dashboard from "@/pages/Dashboard";
import Gastos from "@/pages/Gastos";
import Ingresos from "@/pages/Ingresos";
import Inventario from "@/pages/Inventario";
import Proveedores from "@/pages/Proveedores";
import Alertas from "@/pages/Alertas";
import WhatsAppPage from "@/pages/WhatsApp";
import Bitacora from "@/pages/Bitacora";
import Configuracion from "@/pages/Configuracion";
import Cuenta from "@/pages/Cuenta";
import Permisos from "@/pages/Permisos";
import Soporte from "@/pages/Soporte";
import Manual from "@/pages/Manual";
import Onboarding from "@/pages/Onboarding";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import OAuthConsent from "@/pages/OAuthConsent";

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-carbon">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-steel-high border-t-copper" />
  </div>
);

const AuthenticatedApp = () => {
  const { user, isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) return <Spinner />;

  // "Signed in but not provisioned for this app" is its own case, distinct from
  // "not signed in" — the latter is ProtectedRoute's job, and it sends people to
  // the in-app Spanish /login rather than to Base44's hosted screen.
  if (authError?.type === "user_not_registered") return <UserNotRegisteredError />;

  // Module 2: every user needs a tenant before touching any business_id-scoped
  // entity — RLS would reject every read and write otherwise. This applies to
  // EVERY role including the platform admin: role:admin exists to satisfy each
  // entity's service-role RLS branch, not to let a human skip setting up a
  // restaurant.
  if (user && !user.business_id) return <Onboarding />;

  return (
    <Routes>
      {/* Public auth screens (Module 10) */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/oauth-consent" element={<OAuthConsent />} />
        {/* Reachable on purpose by someone who already has a restaurant: the
            switcher's "crear o unirme a otro" lands here. Outside the Layout,
            since it is not a page within a tenant. */}
        <Route path="/onboarding" element={<Onboarding />} />

        <Route
          element={
            <PermissionProvider>
              <SessionHeartbeat />
              <Layout />
            </PermissionProvider>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/gastos" element={<Gastos />} />
          <Route path="/ingresos" element={<Ingresos />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/proveedores" element={<Proveedores />} />
          <Route path="/alertas" element={<Alertas />} />
          <Route path="/whatsapp" element={<WhatsAppPage />} />
          <Route path="/bitacora" element={<Bitacora />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="/cuenta" element={<Cuenta />} />
          <Route path="/permisos" element={<Permisos />} />
          <Route path="/soporte" element={<Soporte />} />
          <Route path="/manual" element={<Manual />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    // defaultTheme="dark" on purpose — see the header of src/index.css and the
    // pre-mount script in index.html, which has to agree with every value here.
    // "system" is offered from the switcher; it is not the starting point.
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
          {/* Outside the router and outside Layout: the corner has to be
              reachable from the login screen and the 404 too, not only from the
              authenticated shell. */}
          <ThemeSwitcher />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
