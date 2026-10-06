// Layout scan: overlapping interactive elements, horizontal overflow, clipped
// text and controls covered by the theme switcher / fixed bars, per width and
// theme, in Chromium. Starts Vite itself and fulfils EVERY /api/ request with
// local fixtures: nothing reaches Base44.
//
// Usage:  node scripts/layout-scan.mjs [--width 320,390] [--theme dark,light] [--shots dir]
// Needs a Playwright Chromium (CHROMIUM_PATH overrides the default location).
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const WIDTHS = (argOf('--width') || '320,390,768,834,1024,1366,1440').split(',').map(Number);
const THEMES = (argOf('--theme') || 'dark,light').split(',');
const SHOTS = argOf('--shots');
const HEIGHT = { 320: 640, 390: 844, 768: 1024, 834: 1112, 1024: 768, 1366: 768, 1440: 900 };

const PORT = 5300 + Math.floor(Math.random() * 600);
const B = 'biz1';
const iso = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const DB = {
  Business: [{ id: B, name: 'Restaurante de prueba con un nombre bastante largo', billing_status: 'trial', trial_end_at: iso(-10), invite_code: 'ABC123', license_plan: 'basic' }],
  Gasto: ['Insumos', 'Servicios', 'Renta', 'Equipos'].flatMap((c, i) => [0, 1, 2].map((j) => ({ id: `g${i}${j}`, business_id: B, monto: 1234.5 * (i + 1), fecha: iso(i * 3 + j), proveedor: 'Proveedor con nombre largo S.A. de C.V.', categoria: c, metodo_pago: 'Transferencia', descripcion: 'Compra semanal de insumos para cocina', facturado: j === 0, pagado: j !== 1, origen: j === 2 ? 'whatsapp' : 'app', created_date: iso(i) }))),
  IngresoPlataforma: ['Rappi', 'Uber Eats', 'Didi Food'].map((p, i) => ({ id: `i${i}`, business_id: B, plataforma: p, semana: `2026-W3${i}`, fecha_inicio: iso(14 + i), fecha_fin: iso(8 + i), monto_corte: 8000 + i * 500, monto_depositado: 7800, fecha_deposito: iso(5), conciliado: i === 0, diferencia: 200, notas: 'Nota del corte', origen: 'app', created_date: iso(i) })),
  InventarioItem: ['Carnes', 'Verduras', 'Lácteos', 'Bebidas', 'Abarrotes'].map((c, i) => ({ id: `n${i}`, business_id: B, nombre: `Insumo número ${i + 1} con nombre largo`, categoria: c, stock_actual: i % 2 ? 2 : 20, stock_minimo: 5, unidad: 'kg', ultimo_costo: 85.5, proveedor: 'Proveedor Uno', ultima_actualizacion: iso(i) })),
  Proveedor: ['Insumos', 'Servicios', 'Renta'].map((c, i) => ({ id: `p${i}`, business_id: B, nombre: `Proveedor ${i + 1} de abarrotes y carnes`, categoria: c, contacto: 'Juan Pérez', whatsapp: '4491234567', notas: 'Entrega martes y viernes', activo: i !== 2 })),
  Alerta: [['rojo', 'gasto_alto'], ['amarillo', 'stock_bajo'], ['verde', 'ticket_pendiente']].map(([s, t], i) => ({ id: `a${i}`, business_id: B, tipo: t, titulo: `Alerta ${i + 1} con título largo para probar`, mensaje: 'Mensaje de la alerta con detalle suficiente para envolver en varias líneas en pantallas angostas.', severidad: s, fecha: iso(i), leida: false, notificada_whatsapp: i === 0 })),
  WhatsAppConfig: [{ id: 'w1', business_id: B, activo: true, proveedor: 'zernio', provider_account_id: 'acc1', numero_visible: '+52 449 123 4567', agente_nombre: 'Kitch', agente_tono: 'amigable', instrucciones_extra: '', modelo: 'claude', numeros_autorizados: [{ telefono: '+524491234567', nombre: 'Dueño', rol: 'business_admin' }, { telefono: '+524497654321', nombre: 'Cocina', rol: 'staff' }], empujar_alertas: true }],
  SupportTicket: [{ id: 't1', business_id: B, asunto: 'Ticket de prueba con asunto largo', estado: 'abierto', status: 'abierto', created_date: iso(1), updated_date: iso(1), mensaje: 'Hola' }],
  SupportTicketMessage: [], PermissionProfile: [], AppSettings: [], AuditLog: [
    { id: 'l1', business_id: B, accion: 'gasto.create', actor_email: 'dueno@example.invalid', created_date: iso(1), detalle: 'Creó un gasto' }],
  WhatsAppConversacion: [], WhatsAppMensaje: [], AppSession: [{ id: 'as1', user_email: 'dueno@example.invalid', device: 'Chrome', last_active_at: iso(0), created_by_id: 'u1' }],
};
const USER = { id: 'u1', email: 'dueno-con-correo-largo@example.invalid', full_name: 'Dueño de Prueba', role: 'business_admin', business_id: B };

async function mock(ctx) {
  // Fonts/CDNs are unreachable from a sandbox and would stall `load`.
  await ctx.route((u) => !/^(localhost|127\.0\.0\.1)$/.test(u.hostname), (r) => r.abort());
  await ctx.route((u) => u.pathname.startsWith('/api/') || /socket\.io/.test(u.href), async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    const json = (x, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(x) });
    if (/socket\.io/.test(url.href)) return route.abort();
    if (p.includes('public-settings')) return json({ id: 'mockapp', public_settings: {} });
    if (p.endsWith('/entities/User/me')) return json(USER);
    const m = p.match(/\/entities\/(\w+)(?:\/(\w+))?$/);
    if (m) {
      const rows = DB[m[1]] || [];
      if (req.method() !== 'GET') return json({ id: `mock_${Date.now()}` });
      if (m[2]) return json(rows.find((r) => r.id === m[2]) || {});
      return json(rows);
    }
    if (/\/functions\//.test(p)) {
      const fn = p.match(/\/functions\/([\w-]+)/)[1];
      if (fn === 'complete-onboarding') return json({ ok: true, state: 'none' });
      if (fn === 'manage-member') return json({ ok: true, members: [{ id: 'u1', email: USER.email, full_name: USER.full_name, role: 'business_admin' }, { id: 'u2', email: 'personal@example.invalid', full_name: 'Personal Cocina', role: 'staff' }], users: [], requests: [] });
      return json({ ok: true });
    }
    return json({});
  });
}

// Runs in the page. Returns findings for the current scroll/viewport state.
function inspect({ scope }) {
  const atEnd = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2;
  const INTERACTIVE = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=combobox],[role=switch],[role=checkbox],[role=menuitem],[role=option],summary,[data-theme-switcher]';
  const vw = window.innerWidth, vh = window.innerHeight;
  const label = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || el.placeholder || el.name || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    const cls = typeof el.className === 'string' ? el.className.split(' ').slice(0, 2).join('.') : '';
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}"${t}"`;
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || cs.pointerEvents === 'none') return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return null;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const c = getComputedStyle(a);
      if (c.display === 'none' || c.visibility === 'hidden') return null;
      if (c.overflowX !== 'visible' || c.overflowY !== 'visible') {
        const ar = a.getBoundingClientRect();
        // clipped away by a scroll container
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (ar.width && (cx <= ar.left || cx >= ar.right || cy <= ar.top || cy >= ar.bottom)) return null;
      }
    }
    return r;
  };
  const inScope = (el) => !scope || el.closest(scope) || el.closest('[data-theme-switcher]');
  const els = [...document.querySelectorAll(INTERACTIVE)].filter(inScope).map((el) => ({ el, r: visible(el) })).filter((x) => x.r);
  const out = [];
  // 1. overlapping pairs
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const fx = (e) => { for (let n = e; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return n; return null; };
    const fa = fx(a.el), fb = fx(b.el);
    if (fa !== fb && (fa || fb)) { // one is fixed chrome, the other scrolls beneath it
      const fixedEl = fa || fb;
      const isSwitcher = fixedEl.matches('[data-theme-switcher]') || fixedEl.querySelector('[data-theme-switcher]') || fixedEl.closest('[data-theme-switcher]');
      if (!isSwitcher || !atEnd) continue;
    }
    // label wrapping its own input
    if (a.el.closest('label') && a.el.closest('label') === b.el.closest('label')) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 2 && h > 2) out.push({ kind: 'overlap', msg: `${label(a.el)} x ${label(b.el)} (${Math.round(w)}x${Math.round(h)})` });
  }
  // 2. covered by something else at its centre
  for (const { el, r } of els) {
    const x = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1);
    const top = document.elementFromPoint(x, y);
    const underBar = (() => { for (let a = top; a; a = a.parentElement) { const c = getComputedStyle(a); if (c.position === 'fixed' && a.getBoundingClientRect().top <= 0 && a.getBoundingClientRect().height < vh / 2) return r.top < a.getBoundingClientRect().bottom; } return false; })();
    const sw0 = top && (top.closest('[data-theme-switcher]') || top.querySelector?.('[data-theme-switcher]'));
    if (sw0 && !atEnd) continue;
    if (!underBar && top && top !== el && !el.contains(top) && !top.contains(el) && !(el.closest('label') && el.closest('label').contains(top))) out.push({ kind: 'covered', msg: `${label(el)} tapado por ${label(top)}` });
  }
  // 3. horizontal overflow
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) {
    const culprits = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('[data-radix-popper-content-wrapper]'); }).slice(0, 4).map(label);
    out.push({ kind: 'overflow-x', msg: `scrollWidth ${sw} > ${vw}: ${culprits.join(' | ')}` });
  }
  // interactive element sticking out of the viewport
  for (const { el, r } of els) if ((r.right > vw + 1 || r.left < -1) && !el.closest('[class*=overflow]') && getComputedStyle(el).position !== 'fixed') out.push({ kind: 'offscreen', msg: `${label(el)} fuera de pantalla (${Math.round(r.left)}..${Math.round(r.right)})` });
  // 4. clipped text without ellipsis
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && visible(el)) out.push({ kind: 'clipped', msg: `${label(el)} texto cortado (${el.scrollWidth}>${el.clientWidth})` });
    if (cs.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 2 && visible(el) && !cs.webkitLineClamp) out.push({ kind: 'clipped-y', msg: `${label(el)} texto cortado en alto (${el.scrollHeight}>${el.clientHeight})` });
  }
  return out;
}

const PAGES = ['/login', '/register', '/forgot-password', '/reset-password', '/no-existe', '/', '/gastos', '/ingresos', '/inventario', '/proveedores', '/alertas', '/whatsapp', '/bitacora', '/configuracion', '/permisos', '/cuenta', '/soporte', '/manual'];
const AUTH = new Set(['/login', '/register', '/forgot-password', '/reset-password', '/no-existe']);

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const base = `http://localhost:${PORT}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const seen = new Map();
let total = 0;
for (const theme of THEMES) for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: HEIGHT[w] || 800 }, hasTouch: w < 1100, isMobile: w < 1100 });
  await mock(ctx);
  await ctx.addInitScript(([t]) => { try { localStorage.setItem('theme', t); localStorage.setItem('base44_access_token', 'mock'); localStorage.setItem('base44_app_id', 'mockapp'); } catch {} }, [theme]);
  const page = await ctx.newPage();
  page.on('pageerror', () => {});
  const record = async (name, extra = '', scope = null) => {
    for (const phase of ['top', 'bottom']) {
      if (phase === 'bottom') { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300); }
      const res = await page.evaluate(inspect, { scope });
      for (const f of res) { const k = `${f.kind}|${name}${extra}|${f.msg}`; const key = `${theme}/${w}|${k}`; if (!seen.has(key)) { seen.set(key, 1); total++; console.log(`[${theme} ${w}] ${name}${extra} (${phase}) ${f.kind}: ${f.msg}`); } }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${theme}-${w}-${name.replace(/\W+/g, '_')}${extra.replace(/\W+/g, '_')}.png`, fullPage: false });
  };
  for (const path of PAGES) {
    if (AUTH.has(path)) await ctx.clearCookies();
    await page.goto(base + path + '?app_id=mockapp', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1500);
    await record(path);
    if (!AUTH.has(path)) {
      if (w < 1024) { // mobile menu open
        const btn = page.getByRole('button', { name: 'Abrir menú' });
        if (await btn.count()) { await btn.dispatchEvent('click'); await page.waitForTimeout(300); await record(path, ' [menú]', 'aside'); await page.getByRole('button', { name: 'Cerrar menú' }).dispatchEvent('click').catch(() => {}); }
      }
      // open the first "create" dialog if any
      const nuevo = page.getByRole('button', { name: /^(Registrar|Agregar|Nuevo|Nueva|Crear)/ }).first();
      if (await nuevo.count() && await nuevo.isVisible().catch(() => false)) {
        await nuevo.dispatchEvent('click').catch(() => {}); await page.waitForTimeout(400);
        if (await page.locator('[role=dialog]').count()) await record(path, ' [diálogo]', '[role=dialog]');
        await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      }
    }
  }
  await ctx.close();
}
await browser.close(); await server.close();
console.log(total ? `\n${total} hallazgos` : '\n0 hallazgos');
process.exit(total ? 1 : 0);
