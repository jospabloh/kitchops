import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, getWeekKey, extractTicketData } from '@/lib/finance';
import { Upload, ScanLine, Plus, Check, X, Camera, Loader2 } from 'lucide-react';

const CATEGORIAS = ['Insumos', 'Servicios', 'Renta', 'Equipos', 'Mantenimiento', 'Otros'];
const METODOS = ['Tarjeta de crédito', 'Transferencia', 'Efectivo', 'Otros'];

export default function Gastos() {
  const [gastos, setGastos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [filterProveedor, setFilterProveedor] = useState('');
  const [filterMes, setFilterMes] = useState('');

  const emptyForm = {
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    proveedor: '',
    categoria: 'Insumos',
    metodo_pago: 'Tarjeta de crédito',
    ticket_foto_url: '',
    descripcion: '',
    facturado: false,
    pagado: false,
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [g, p] = await Promise.all([
        base44.entities.Gasto.list('-fecha', 200),
        base44.entities.Proveedor.list('-created_date', 100),
      ]);
      setGastos(g);
      setProveedores(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setScanning(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm((f) => ({ ...f, ticket_foto_url: file_url }));

      const extracted = await extractTicketData(file_url);
      setForm((f) => ({
        ...f,
        proveedor: extracted.proveedor || f.proveedor,
        monto: extracted.monto ? String(extracted.monto) : f.monto,
        fecha: extracted.fecha || f.fecha,
        descripcion: extracted.descripcion || f.descripcion,
      }));
    } catch (e) {
      console.error('Error scanning ticket:', e);
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = {
      ...form,
      monto: parseFloat(form.monto) || 0,
      semana: getWeekKey(form.fecha),
    };
    await base44.entities.Gasto.create(data);
    setForm(emptyForm);
    setShowForm(false);
    loadData();
  };

  const toggleField = async (gasto, field) => {
    await base44.entities.Gasto.update(gasto.id, { [field]: !gasto[field] });
    loadData();
  };

  const deleteGasto = async (id) => {
    await base44.entities.Gasto.delete(id);
    loadData();
  };

  const filteredGastos = gastos.filter((g) => {
    if (filterProveedor && g.proveedor !== filterProveedor) return false;
    if (filterMes) {
      const d = new Date(g.fecha);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key !== filterMes) return false;
    }
    return true;
  });

  const totalFiltrado = filteredGastos.reduce((s, g) => s + (g.monto || 0), 0);

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
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-slate-900">Gastos</h1>
          <p className="text-slate-500 text-sm mt-1">Total: {formatCurrency(totalFiltrado)}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo gasto</span>
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 mb-6">
          {/* Upload ticket */}
          <div className="mb-4">
            <label className="text-sm font-medium text-slate-700 mb-2 block">Foto del ticket (IA extrae los datos)</label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-6 cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 transition-colors">
              {scanning ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                  <span className="text-sm text-orange-600 font-medium">Escaneando ticket con IA...</span>
                </div>
              ) : form.ticket_foto_url ? (
                <div className="flex flex-col items-center gap-2">
                  <Check className="w-6 h-6 text-green-500" />
                  <span className="text-sm text-green-600 font-medium">Ticket cargado</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Camera className="w-6 h-6 text-slate-400" />
                  <span className="text-sm text-slate-500">Toma foto o sube el ticket</span>
                </div>
              )}
              <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Proveedor</label>
              <input
                type="text"
                value={form.proveedor}
                onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                list="proveedores-list"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                required
              />
              <datalist id="proveedores-list">
                {proveedores.map((p) => (
                  <option key={p.id} value={p.nombre} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Monto</label>
              <input
                type="number"
                step="0.01"
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Fecha</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
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
              <label className="text-sm font-medium text-slate-700 mb-1 block">Método de pago</label>
              <select
                value={form.metodo_pago}
                onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Descripción</label>
              <input
                type="text"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.facturado}
                  onChange={(e) => setForm({ ...form, facturado: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                Facturado
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.pagado}
                  onChange={(e) => setForm({ ...form, pagado: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                Pagado
              </label>
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
                Guardar gasto
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={filterProveedor}
          onChange={(e) => setFilterProveedor(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <input
          type="month"
          value={filterMes}
          onChange={(e) => setFilterMes(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        />
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filteredGastos.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">No hay gastos registrados</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredGastos.map((g) => (
              <div key={g.id} className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900 text-sm truncate">{g.proveedor}</p>
                    {g.ticket_foto_url && (
                      <ScanLine className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(g.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}
                    {g.categoria}
                    {' · '}
                    {g.metodo_pago}
                    {g.descripcion ? ` · ${g.descripcion}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900 text-sm">{formatCurrency(g.monto)}</p>
                  <div className="flex items-center gap-1.5 mt-1 justify-end">
                    <button
                      onClick={() => toggleField(g, 'facturado')}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                        g.facturado ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      Fact
                    </button>
                    <button
                      onClick={() => toggleField(g, 'pagado')}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                        g.pagado ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}
                    >
                      Pag
                    </button>
                    <button
                      onClick={() => deleteGasto(g.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}