import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/finance';
import { Plus, X, Package, AlertTriangle } from 'lucide-react';

const CATEGORIAS = ['Carnes', 'Verduras', 'Lácteos', 'Bebidas', 'Abarrotes', 'Limpieza', 'Otros'];

export default function Inventario() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterCategoria, setFilterCategoria] = useState('');

  const emptyForm = {
    nombre: '',
    categoria: 'Abarrotes',
    stock_actual: '',
    stock_minimo: '',
    unidad: 'kg',
    ultimo_costo: '',
    proveedor: '',
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await base44.entities.InventarioItem.list('-created_date', 200);
      setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = {
      ...form,
      stock_actual: parseFloat(form.stock_actual) || 0,
      stock_minimo: parseFloat(form.stock_minimo) || 0,
      ultimo_costo: parseFloat(form.ultimo_costo) || 0,
    };
    await base44.entities.InventarioItem.create(data);
    setForm(emptyForm);
    setShowForm(false);
    loadData();
  };

  const updateStock = async (item, newStock) => {
    await base44.entities.InventarioItem.update(item.id, { stock_actual: parseFloat(newStock) || 0 });
    loadData();
  };

  const deleteItem = async (id) => {
    await base44.entities.InventarioItem.delete(id);
    loadData();
  };

  const filtered = items.filter((i) => !filterCategoria || i.categoria === filterCategoria);
  const lowStock = filtered.filter((i) => i.stock_actual <= i.stock_minimo);

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
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-slate-900">Inventario</h1>
          <p className="text-slate-500 text-sm mt-1">
            {items.length} insumos · {lowStock.length} con stock bajo
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo insumo</span>
        </button>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700">{lowStock.length} insumo(s) con stock bajo</p>
            <p className="text-xs text-red-500">{lowStock.map((i) => i.nombre).join(', ')}</p>
          </div>
        </div>
      )}

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
              <label className="text-sm font-medium text-slate-700 mb-1 block">Stock actual</label>
              <input
                type="number"
                step="0.01"
                value={form.stock_actual}
                onChange={(e) => setForm({ ...form, stock_actual: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Stock mínimo (alerta)</label>
              <input
                type="number"
                step="0.01"
                value={form.stock_minimo}
                onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Unidad</label>
              <input
                type="text"
                value={form.unidad}
                onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                placeholder="kg, lt, pieza..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Último costo</label>
              <input
                type="number"
                step="0.01"
                value={form.ultimo_costo}
                onChange={(e) => setForm({ ...form, ultimo_costo: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Proveedor</label>
              <input
                type="text"
                value={form.proveedor}
                onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
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
                Guardar insumo
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-4">
        <select
          value={filterCategoria}
          onChange={(e) => setFilterCategoria(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No hay insumos registrados</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((item) => {
              const isLow = item.stock_actual <= item.stock_minimo;
              return (
                <div key={item.id} className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isLow ? 'bg-red-100' : 'bg-slate-100'
                  }`}>
                    <Package className={`w-4 h-4 ${isLow ? 'text-red-500' : 'text-slate-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm truncate">{item.nombre}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {item.categoria} · {item.proveedor || 'Sin proveedor'}
                      {item.ultimo_costo ? ` · ${formatCurrency(item.ultimo_costo)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={item.stock_actual}
                      onChange={(e) => updateStock(item, e.target.value)}
                      className={`w-16 px-2 py-1 border rounded-lg text-sm text-right focus:outline-none focus:ring-2 ${
                        isLow ? 'border-red-300 focus:ring-red-400 text-red-600 font-bold' : 'border-slate-300 focus:ring-orange-400'
                      }`}
                    />
                    <span className="text-xs text-slate-400 w-8">{item.unidad}</span>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors"
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