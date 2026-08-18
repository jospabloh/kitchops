import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, getWeekKey } from '@/lib/finance';
import { Plus, Check, X, AlertCircle, Truck } from 'lucide-react';

const PLATAFORMAS = ['Rappi', 'Uber Eats', 'Didi Food', 'Otros'];

export default function Ingresos() {
  const [ingresos, setIngresos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterPlataforma, setFilterPlataforma] = useState('');

  const emptyForm = {
    plataforma: 'Rappi',
    semana: getWeekKey(new Date().toISOString()),
    fecha_inicio: '',
    fecha_fin: '',
    monto_corte: '',
    monto_depositado: '',
    fecha_deposito: '',
    notas: '',
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await base44.entities.IngresoPlataforma.list('-created_date', 200);
      setIngresos(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const corte = parseFloat(form.monto_corte) || 0;
    const depositado = parseFloat(form.monto_depositado) || 0;
    const data = {
      ...form,
      monto_corte: corte,
      monto_depositado: depositado,
      diferencia: depositado - corte,
      conciliado: Math.abs(depositado - corte) < 1,
    };
    await base44.entities.IngresoPlataforma.create(data);
    setForm(emptyForm);
    setShowForm(false);
    loadData();
  };

  const deleteIngreso = async (id) => {
    await base44.entities.IngresoPlataforma.delete(id);
    loadData();
  };

  const filtered = ingresos.filter((i) => !filterPlataforma || i.plataforma === filterPlataforma);

  // Summary
  const totalCorte = filtered.reduce((s, i) => s + (i.monto_corte || 0), 0);
  const totalDepositado = filtered.reduce((s, i) => s + (i.monto_depositado || 0), 0);
  const totalDiferencia = totalDepositado - totalCorte;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-slate-900">Ingresos</h1>
          <p className="text-slate-500 text-sm mt-1">Conciliación Rappi / Uber / Didi</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo corte</span>
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-[10px] text-slate-400 uppercase font-medium mb-1">Corte reportado</p>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(totalCorte)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-[10px] text-slate-400 uppercase font-medium mb-1">Depositado</p>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(totalDepositado)}</p>
        </div>
        <div className={`bg-white rounded-xl p-4 border ${totalDiferencia < 0 ? 'border-red-300' : 'border-slate-200'}`}>
          <p className="text-[10px] text-slate-400 uppercase font-medium mb-1">Diferencia</p>
          <p className={`text-lg font-bold ${totalDiferencia < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatCurrency(totalDiferencia)}
          </p>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 mb-6">
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Plataforma</label>
              <select
                value={form.plataforma}
                onChange={(e) => setForm({ ...form, plataforma: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {PLATAFORMAS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Semana</label>
              <input
                type="text"
                value={form.semana}
                onChange={(e) => setForm({ ...form, semana: e.target.value })}
                placeholder="2026-34"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Fecha inicio corte</label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Fecha fin corte</label>
              <input
                type="date"
                value={form.fecha_fin}
                onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Monto del corte (lo que dice la app)</label>
              <input
                type="number"
                step="0.01"
                value={form.monto_corte}
                onChange={(e) => setForm({ ...form, monto_corte: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Monto depositado (real)</label>
              <input
                type="number"
                step="0.01"
                value={form.monto_depositado}
                onChange={(e) => setForm({ ...form, monto_depositado: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Fecha de depósito</label>
              <input
                type="date"
                value={form.fecha_deposito}
                onChange={(e) => setForm({ ...form, fecha_deposito: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Notas</label>
              <input
                type="text"
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(emptyForm); }}
                className="px-4 py-2 text-slate-600 text-sm font-medium hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
              >
                Guardar corte
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter */}
      <div className="mb-4">
        <select
          value={filterPlataforma}
          onChange={(e) => setFilterPlataforma(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">Todas las plataformas</option>
          {PLATAFORMAS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Truck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No hay cortes registrados</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((i) => {
              const diff = (i.monto_depositado || 0) - (i.monto_corte || 0);
              const hasDiff = Math.abs(diff) >= 1;
              return (
                <div key={i.id} className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    i.plataforma === 'Rappi' ? 'bg-orange-100' :
                    i.plataforma === 'Uber Eats' ? 'bg-green-100' :
                    i.plataforma === 'Didi Food' ? 'bg-yellow-100' : 'bg-slate-100'
                  }`}>
                    <Truck className={`w-4 h-4 ${
                      i.plataforma === 'Rappi' ? 'text-orange-600' :
                      i.plataforma === 'Uber Eats' ? 'text-green-600' :
                      i.plataforma === 'Didi Food' ? 'text-yellow-600' : 'text-slate-500'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900 text-sm">{i.plataforma}</p>
                      <span className="text-xs text-slate-400">Semana {i.semana}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs">
                      <span className="text-slate-500">Corte: <span className="font-medium text-slate-700">{formatCurrency(i.monto_corte)}</span></span>
                      <span className="text-slate-500">Dep: <span className="font-medium text-slate-700">{formatCurrency(i.monto_depositado)}</span></span>
                    </div>
                  </div>
                  <div className="text-right">
                    {hasDiff ? (
                      <div className="flex items-center gap-1 text-red-600">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span className="text-sm font-bold">{formatCurrency(diff)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-green-600">
                        <Check className="w-3.5 h-3.5" />
                        <span className="text-sm font-medium">Conciliado</span>
                      </div>
                    )}
                    <button
                      onClick={() => deleteIngreso(i.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors mt-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}