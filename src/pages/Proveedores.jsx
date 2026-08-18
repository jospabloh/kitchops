import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, X, Store } from 'lucide-react';

const CATEGORIAS = ['Insumos', 'Servicios', 'Renta', 'Equipos', 'Mantenimiento', 'Otros'];

export default function Proveedores() {
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: '', categoria: 'Insumos', contacto: '', notas: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await base44.entities.Proveedor.list('-created_date', 200);
      setProveedores(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await base44.entities.Proveedor.create(form);
    setForm({ nombre: '', categoria: 'Insumos', contacto: '', notas: '' });
    setShowForm(false);
    loadData();
  };

  const deleteProveedor = async (id) => {
    await base44.entities.Proveedor.delete(id);
    loadData();
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-slate-900">Proveedores</h1>
          <p className="text-slate-500 text-sm mt-1">{proveedores.length} proveedores registrados</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo</span>
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 mb-6">
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Nombre</label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Categoría</label>
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Contacto</label>
              <input
                type="text"
                value={form.contacto}
                onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                placeholder="Teléfono o email"
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
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-slate-600 text-sm font-medium hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {proveedores.length === 0 ? (
          <div className="text-center py-12">
            <Store className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No hay proveedores registrados</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {proveedores.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <Store className="w-4 h-4 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 text-sm truncate">{p.nombre}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {p.categoria}
                    {p.contacto ? ` · ${p.contacto}` : ''}
                    {p.notas ? ` · ${p.notas}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => deleteProveedor(p.id)}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}