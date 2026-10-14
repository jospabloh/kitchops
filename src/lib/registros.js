// Local list updates from the row a Safe function returns.
//
// Base44's entity reads lag the write by ~0.5–1.3 s (measured live,
// 2026-10-14), so `invoke(...)` followed straight by `Entity.filter(...)` can
// come back WITHOUT the row just saved: the screen shows "Todavía no hay
// gastos" next to a "Gasto registrado" toast, and the person captures it again.
// Every Safe function already returns the stored record, so the screens put
// that in their state instead of re-reading.

/** Replace the row with the same id, or put it first when it's new. */
export function conRegistro(rows, row) {
  if (!row?.id) return rows;
  const list = rows || [];
  return list.some((r) => r.id === row.id)
    ? list.map((r) => (r.id === row.id ? row : r))
    : [row, ...list];
}

/** The list without the row with that id. */
export function sinRegistro(rows, id) {
  return (rows || []).filter((r) => r.id !== id);
}
