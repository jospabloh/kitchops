import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, Check, AlertTriangle, X } from 'lucide-react';

const SEVERITY_CONFIG = {
  rojo: { bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500', text: 'text-red-700' },
  amarillo: { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-400', text: 'text-amber-700' },
  verde: { bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-500', text: 'text-green-700' },
};

const TIPO_LABELS = {
  gasto_alto: 'Gasto alto',
  deposito_faltante: 'Depósito faltante',
  stock_bajo: 'Stock bajo',
  ticket_pendiente: 'Ticket pendiente',
  pago_pendiente: 'Pago pendiente',
};

export default function Alertas() {
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todas');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await base44.entities.Alerta.list('-created_date', 200);
      setAlertas(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id) => {
    await base44.entities.Alerta.update(id, { leida: true });
    loadData();
  };

  const deleteAlerta = async (id) => {
    await base44.entities.Alerta.delete(id);
    loadData();
  };

  const filtered = alertas.filter((a) => {
    if (filter === 'todas') return true;
    if (filter === 'no_leidas') return !a.leida;
    return a.severidad === filter;
  });

  const counts = {
    rojo: alertas.filter((a) => a.severidad === 'rojo' && !a.leida).length,
    amarillo: alertas.filter((a) => a.severidad === 'amarillo' && !a.leida).length,
    verde: alertas.filter((a) => a.severidad === 'verde' && !a.leida).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-heading font-bold text-slate-900">Alertas</h1>
        <p className="text-slate-500 text-sm mt-1">Monitoreo de gastos y anomalías</p>
      </div>

      {/* Semaphore summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div
          onClick={() => setFilter('rojo')}
          className={`bg-white rounded-xl p-4 border cursor-pointer transition-all ${filter === 'rojo' ? 'border-red-400 ring-2 ring-red-100' : 'border-slate-200'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span className="text-xs font-medium text-slate-500">Rojas</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{counts.rojo}</p>
        </div>
        <div
          onClick={() => setFilter('amarillo')}
          className={`bg-white rounded-xl p-4 border cursor-pointer transition-all ${filter === 'amarillo' ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full bg-amber-400"></span>
            <span className="text-xs font-medium text-slate-500">Amarillas</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">{counts.amarillo}</p>
        </div>
        <div
          onClick={() => setFilter('verde')}
          className={`bg-white rounded-xl p-4 border cursor-pointer transition-all ${filter === 'verde' ? 'border-green-400 ring-2 ring-green-100' : 'border-slate-200'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            <span className="text-xs font-medium text-slate-500">Verdes</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{counts.verde}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {['todas', 'no_leidas', 'rojo', 'amarillo', 'verde'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            {f === 'todas' ? 'Todas' : f === 'no_leidas' ? 'No leídas' : f === 'rojo' ? 'Rojas' : f === 'amarillo' ? 'Amarillas' : 'Verdes'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No hay alertas</p>
          </div>
        ) : (
          filtered.map((a) => {
            const cfg = SEVERITY_CONFIG[a.severidad] || SEVERITY_CONFIG.amarillo;
            return (
              <div
                key={a.id}
                className={`flex items-start gap-3 p-4 rounded-xl border ${cfg.bg} ${cfg.border} ${a.leida ? 'opacity-50' : ''}`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} mt-1.5 flex-shrink-0`}></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{a.titulo}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg.bg} ${cfg.text}`}>
                      {TIPO_LABELS[a.tipo] || a.tipo}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{a.mensaje}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {new Date(a.fecha || a.created_date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!a.leida && (
                    <button
                      onClick={() => markRead(a.id)}
                      className="text-slate-400 hover:text-green-500 transition-colors p-1"
                      title="Marcar como leída"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteAlerta(a.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}