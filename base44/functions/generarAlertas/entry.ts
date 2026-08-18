import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // Fetch all gastos
    const gastos = await base44.asServiceRole.entities.Gasto.list('-created_date', 500);
    const ingresos = await base44.asServiceRole.entities.IngresoPlataforma.list('-created_date', 200);
    const inventario = await base44.asServiceRole.entities.InventarioItem.list('-created_date', 200);
    const alertasExistentes = await base44.asServiceRole.entities.Alerta.list('-created_date', 100);

    const nuevasAlertas = [];

    // 1. Gasto alto por proveedor (comparar mes actual vs mes anterior)
    const gastosMesActual = gastos.filter((g) => {
      const d = new Date(g.fecha);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const gastosMesAnterior = gastos.filter((g) => {
      const d = new Date(g.fecha);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    });

    const porProveedorActual = {};
    gastosMesActual.forEach((g) => {
      porProveedorActual[g.proveedor] = (porProveedorActual[g.proveedor] || 0) + (g.monto || 0);
    });
    const porProveedorAnterior = {};
    gastosMesAnterior.forEach((g) => {
      porProveedorAnterior[g.proveedor] = (porProveedorAnterior[g.proveedor] || 0) + (g.monto || 0);
    });

    Object.entries(porProveedorActual).forEach(([proveedor, montoActual]) => {
      const montoAnterior = porProveedorAnterior[proveedor] || 0;
      if (montoAnterior > 0) {
        const incremento = ((montoActual - montoAnterior) / montoAnterior) * 100;
        if (incremento > 20) {
          nuevasAlertas.push({
            tipo: 'gasto_alto',
            titulo: `Gasto alto: ${proveedor}`,
            mensaje: `Gastaste ${incremento.toFixed(0)}% más con ${proveedor} este mes vs el mes pasado (${montoActual.toFixed(0)} vs ${montoAnterior.toFixed(0)})`,
            severidad: incremento > 50 ? 'rojo' : 'amarillo',
            fecha: now.toISOString(),
            leida: false,
          });
        }
      }
    });

    // 2. Depósitos faltantes (cortes sin depósito o con diferencia)
    ingresos.forEach((i) => {
      if (!i.monto_depositado || i.monto_depositado === 0) {
        nuevasAlertas.push({
          tipo: 'deposito_faltante',
          titulo: `Depósito faltante de ${i.plataforma}`,
          mensaje: `El corte de la semana ${i.semana} por ${i.monto_corte} no tiene depósito registrado`,
          severidad: 'rojo',
          fecha: now.toISOString(),
          leida: false,
        });
      } else {
        const diff = i.monto_depositado - i.monto_corte;
        if (diff < -1) {
          nuevasAlertas.push({
            tipo: 'deposito_faltante',
            titulo: `Depósito menor en ${i.plataforma}`,
            mensaje: `Semana ${i.semana}: te depositaron ${diff.toFixed(0)} menos de lo reportado (corte ${i.monto_corte}, depósito ${i.monto_depositado})`,
            severidad: Math.abs(diff) > 500 ? 'rojo' : 'amarillo',
            fecha: now.toISOString(),
            leida: false,
          });
        }
      }
    });

    // 3. Stock bajo
    inventario.forEach((item) => {
      if (item.stock_actual <= item.stock_minimo) {
        nuevasAlertas.push({
          tipo: 'stock_bajo',
          titulo: `Stock bajo: ${item.nombre}`,
          mensaje: `Quedan ${item.stock_actual} ${item.unidad} de ${item.nombre} (mínimo: ${item.stock_minimo})`,
          severidad: item.stock_actual === 0 ? 'rojo' : 'amarillo',
          fecha: now.toISOString(),
          leida: false,
        });
      }
    });

    // 4. Tickets sin facturar de la tarjeta de crédito
    const ticketsPendientes = gastos.filter((g) => g.metodo_pago === 'Tarjeta de crédito' && !g.facturado);
    if (ticketsPendientes.length > 0) {
      nuevasAlertas.push({
        tipo: 'ticket_pendiente',
        titulo: `${ticketsPendientes.length} tickets sin facturar`,
        mensaje: `Hay ${ticketsPendientes.length} gastos en tarjeta de crédito que aún no están facturados`,
        severidad: ticketsPendientes.length > 5 ? 'amarillo' : 'verde',
        fecha: now.toISOString(),
        leida: false,
      });
    }

    // 5. Gastos en tarjeta no pagados
    const gastosNoPagados = gastos.filter((g) => g.metodo_pago === 'Tarjeta de crédito' && !g.pagado);
    if (gastosNoPagados.length > 0) {
      const totalNoPagado = gastosNoPagados.reduce((s, g) => s + (g.monto || 0), 0);
      nuevasAlertas.push({
        tipo: 'pago_pendiente',
        titulo: `Tarjeta con ${gastosNoPagados.length} gastos sin pagar`,
        mensaje: `Hay ${formatCurrency(totalNoPagado)} en gastos de tarjeta de crédito que aún no se han pagado`,
        severidad: 'amarillo',
        fecha: now.toISOString(),
        leida: false,
      });
    }

    // Deduplicar: no crear alertas con el mismo título que ya existan y no estén leídas
    const titulosExistentes = new Set(alertasExistentes.filter((a) => !a.leida).map((a) => a.titulo));
    const alertasFinales = nuevasAlertas.filter((a) => !titulosExistentes.has(a.titulo));

    let creadas = 0;
    if (alertasFinales.length > 0) {
      const result = await base44.asServiceRole.entities.Alerta.bulkCreate(alertasFinales);
      creadas = result.length;
    }

    return Response.json({
      success: true,
      alertas_creadas: creadas,
      alertas_evaluadas: nuevasAlertas.length,
      duplicadas_filtradas: nuevasAlertas.length - alertasFinales.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value || 0);
}