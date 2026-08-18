import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, getMonthName } from '@/lib/finance';
import { TrendingUp, TrendingDown, AlertTriangle, Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function Dashboard() {
  const [gastos, setGastos] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [g, i, a] = await Promise.all([
        base44.entities.Gasto.list('-created_date', 200),
        base44.entities.IngresoPlataforma.list('-created_date', 100),
        base44.entities.Alerta.filter({ leida: false }, '-created_date', 10),
      ]);
      setGastos(g);
      setIngresos(i);
      setAlertas(a);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const gastosMes = gastos.filter((g) => {
    const d = new Date(g.fecha);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const gastosMesAnterior = gastos.filter((g) => {
    const d = new Date(g.fecha);
    return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
  });

  const totalGastosMes = gastosMes.reduce((s, g) => s + (g.monto || 0), 0);
  const totalGastosMesAnterior = gastosMesAnterior.reduce((s, g) => s + (g.monto || 0), 0);
  const variacionGastos = totalGastosMesAnterior > 0
    ? ((totalGastosMes - totalGastosMesAnterior) / totalGastosMesAnterior) * 100
    : 0;

  const totalIngresosMes = ingresos
    .filter((i) => {
      const d = new Date(i.fecha_deposito || i.fecha_fin);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((s, i) => s + (i.monto_depositado || 0), 0);

  const utilidad = totalIngresosMes - totalGastosMes;

  // Gastos por proveedor este mes
  const porProveedor = {};
  gastosMes.forEach((g) => {
    porProveedor[g.proveedor] = (porProveedor[g.proveedor] || 0) + (g.monto || 0);
  });
  const topProveedores = Object.entries(porProveedor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Gastos por mes (últimos 6 meses)
  const monthlyData = [];
  for (let m = 5; m >= 0; m--) {
    const monthIdx = (currentMonth - m + 12) % 12;
    const year = currentMonth - m < 0 ? currentYear - 1 : currentYear;
    const total = gastos
      .filter((g) => {
        const d = new Date(g.fecha);
        return d.getMonth() === monthIdx && d.getFullYear() === year;
      })
      .reduce((s, g) => s + (g.monto || 0), 0);
    monthlyData.push({ month: getMonthName(monthIdx), total });
  }
  const maxMonthly = Math.max(...monthlyData.map((d) => d.total), 1);

  // Alertas rojas
  const alertasRojas = alertas.filter((a) => a.severidad === 'rojo');
  const alertasAmarillas = alertas.filter((a) => a.severidad === 'amarillo');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-heading font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          {now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 md:p-5 border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-blue-500" />
            </div>
            <span className="text-[10px] text-slate-400 font-medium uppercase">Ingresos</span>
          </div>
          <p className="text-lg md:text-2xl font-bold text-slate-900">{formatCurrency(totalIngresosMes)}</p>
          <p className="text-xs text-slate-400 mt-1">Este mes</p>
        </div>

        <div className="bg-white rounded-xl p-4 md:p-5 border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-red-500" />
            </div>
            <span className="text-[10px] text-slate-400 font-medium uppercase">Gastos</span>
          </div>
          <p className="text-lg md:text-2xl font-bold text-slate-900">{formatCurrency(totalGastosMes)}</p>
          <div className="flex items-center gap-1 mt-1">
            {variacionGastos > 0 ? (
              <ArrowUpRight className="w-3 h-3 text-red-500" />
            ) : (
              <ArrowDownRight className="w-3 h-3 text-green-500" />
            )}
            <span className={`text-xs font-medium ${variacionGastos > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {Math.abs(variacionGastos).toFixed(0)}% vs mes anterior
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 md:p-5 border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${utilidad >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <TrendingUp className={`w-4 h-4 ${utilidad >= 0 ? 'text-green-500' : 'text-red-500'}`} />
            </div>
            <span className="text-[10px] text-slate-400 font-medium uppercase">Utilidad</span>
          </div>
          <p className={`text-lg md:text-2xl font-bold ${utilidad >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(utilidad)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Ingresos - Gastos</p>
        </div>

        <div className="bg-white rounded-xl p-4 md:p-5 border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <span className="text-[10px] text-slate-400 font-medium uppercase">Alertas</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              <span className="text-sm font-bold text-slate-900">{alertasRojas.length}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span className="text-sm font-bold text-slate-900">{alertasAmarillas.length}</span>
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Activas</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        {/* Monthly bar chart */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h3 className="font-heading font-semibold text-slate-900 mb-4 text-sm">Gastos por mes (6 meses)</h3>
          <div className="flex items-end justify-between gap-2 h-40">
            {monthlyData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col justify-end h-32">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-orange-400 to-orange-300 transition-all hover:from-orange-500 hover:to-orange-400"
                    style={{ height: `${(d.total / maxMonthly) * 100}%` }}
                    title={formatCurrency(d.total)}
                  ></div>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">{d.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top proveedores */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h3 className="font-heading font-semibold text-slate-900 mb-4 text-sm">Top proveedores del mes</h3>
          {topProveedores.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Sin gastos registrados este mes</p>
          ) : (
            <div className="space-y-3">
              {topProveedores.map(([nombre, monto], i) => {
                const pct = (monto / totalGastosMes) * 100;
                return (
                  <div key={i}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-slate-700 truncate">{nombre}</span>
                      <span className="text-sm font-bold text-slate-900 ml-2">{formatCurrency(monto)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-400"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Alertas recientes */}
      {alertas.length > 0 && (
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h3 className="font-heading font-semibold text-slate-900 mb-4 text-sm">Alertas recientes</h3>
          <div className="space-y-2">
            {alertas.slice(0, 5).map((a) => (
              <div
                key={a.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  a.severidad === 'rojo'
                    ? 'bg-red-50 border-red-200'
                    : a.severidad === 'amarillo'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-green-50 border-green-200'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    a.severidad === 'rojo' ? 'bg-red-500' : a.severidad === 'amarillo' ? 'bg-amber-400' : 'bg-green-500'
                  }`}
                ></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{a.titulo}</p>
                  <p className="text-xs text-slate-500 truncate">{a.mensaje}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}