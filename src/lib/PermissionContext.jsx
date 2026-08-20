import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ROLES } from "@/lib/rbac";
import { resolvePermission, isWriteKey } from "@/lib/permissionRegistry";

// UI gating only (Module 3). Every key resolved here is re-resolved server-side
// by the Safe function that performs the write, in the same order, from a
// generated copy of the same registry. Hiding a button is a courtesy; the
// function is the boundary. StockFlow shipped the courtesy without the boundary
// for two release cycles and an authenticated low-privilege user could call the
// backend directly from devtools — that is the incident this arrangement is
// built around.
const PermissionContext = createContext(null);

export function PermissionProvider({ children }) {
  const { user, business } = useAuth();
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);

  const loadOverrides = useCallback(async () => {
    if (!user?.business_id) {
      setOverrides({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Only 'staff' is ever overridable — business_admin is definitionally the
      // tenant owner with full access inside its own business_id, and the
      // server's hasPermission() never consults a profile for it.
      const rows = await base44.entities.PermissionProfile.filter({
        business_id: user.business_id,
        role: ROLES.STAFF,
      });
      setOverrides(rows?.[0]?.permissions || {});
    } catch (error) {
      // A profile that can't be read must not silently widen access: falling
      // back to {} means the registry defaults apply, which is the conservative
      // answer, and the same one the server reaches in the same situation.
      console.error("No se pudieron cargar los permisos:", error);
      setOverrides({});
    } finally {
      setLoading(false);
    }
  }, [user?.business_id]);

  useEffect(() => {
    loadOverrides();
  }, [loadOverrides]);

  const can = useMemo(() => {
    return (key) => {
      if (!user) return false;
      if (user.role === ROLES.ADMIN) return true;

      // Module 1's read-only degrade. Only writes are blocked: a view_only
      // tenant that can't read its own books isn't "view only", it's broken.
      const blocked = business?.billing_status === "view_only" || business?.billing_status === "suspended";
      if (blocked && isWriteKey(key)) return false;

      const roleOverrides = user.role === ROLES.STAFF ? overrides : null;
      return resolvePermission(key, user.role, roleOverrides);
    };
  }, [user, business, overrides]);

  // Distinguishes "you personally can't" from "nobody can right now", so a
  // screen can say which — a staff member told "tu negocio está suspendido"
  // goes and asks the owner; one told "no tienes permiso" asks for access they
  // already have.
  const writeBlockedReason = useMemo(() => {
    if (business?.billing_status === "suspended") {
      return "Tu negocio está suspendido. Reactívalo en Cuenta para poder guardar cambios.";
    }
    if (business?.billing_status === "view_only") {
      return "Tu negocio está en modo de solo lectura. Puedes consultar todo, pero no guardar cambios.";
    }
    return null;
  }, [business]);

  const value = useMemo(
    () => ({ can, loading, user, business, overrides, writeBlockedReason, refreshOverrides: loadOverrides }),
    [can, loading, user, business, overrides, writeBlockedReason, loadOverrides],
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error("usePermissions debe usarse dentro de un PermissionProvider");
  return ctx;
}
