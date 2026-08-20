import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// One AppSession row per login, kept warm by a heartbeat, so ACACIA Mission
// Control can list who is currently in the app and force a logout when it has
// to (acaciaControl → sessions.list / sessions.revoke).
//
// SESSION TRACKING MUST NEVER BREAK THE APP. Every call here is wrapped and
// silently swallowed: this is telemetry plus a remote-logout channel, and
// neither is worth a white screen. That is also why it writes AppSession
// directly rather than through a Safe function — the entity's RLS already
// scopes a user to their own rows via the built-in, unspoofable created_by_id,
// so a wrapper would add a network hop and a new failure mode to a path whose
// only job is to be invisible, and would close no gap.

const LATIDO_MS = 60_000;

function etiquetaDispositivo() {
  const ua = navigator.userAgent;
  const navegador = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Navegador";
  const so = /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "";
  return so ? `${navegador} · ${so}` : navegador;
}

export default function SessionHeartbeat() {
  const { user, logout } = useAuth();
  const sessionIdRef = useRef(null);
  const cerrandoRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return undefined;

    let cancelado = false;

    const abrir = async () => {
      try {
        const row = await base44.entities.AppSession.create({
          user_email: user.email || "",
          user_name: user.full_name || user.email || "",
          business_id: user.business_id || "",
          device: etiquetaDispositivo(),
          started_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
        });
        if (!cancelado) sessionIdRef.current = row?.id || null;
      } catch {
        /* best-effort by design */
      }
    };

    const latir = async () => {
      const id = sessionIdRef.current;
      if (!id || cerrandoRef.current) return;
      try {
        const row = await base44.entities.AppSession.get(id);
        // Mission Control set revoked_at → this session is over. Checked on the
        // read rather than pushed, so it works without any realtime channel.
        if (row?.revoked_at) {
          cerrandoRef.current = true;
          logout();
          return;
        }
        await base44.entities.AppSession.update(id, { last_active_at: new Date().toISOString() });
      } catch {
        /* best-effort by design */
      }
    };

    abrir();
    const timer = setInterval(latir, LATIDO_MS);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, [user?.id, user?.email, user?.full_name, user?.business_id, logout]);

  return null;
}
