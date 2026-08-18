import { base44 } from '@/api/base44Client';

export async function extractTicketData(fileUrl) {
  const prompt = `Eres un asistente que extrae datos de tickets de compra de restaurantes. Analiza la imagen del ticket y devuelve un JSON con los siguientes campos:
- proveedor: nombre del proveedor o establecimiento (string)
- monto: monto total del ticket (number, sin comas ni símbolos)
- fecha: fecha del ticket en formato YYYY-MM-DD (string)
- descripcion: breve descripción de lo que se compró (string)

Devuelve SOLO el JSON, sin texto adicional.`;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt,
    file_urls: [fileUrl],
    response_json_schema: {
      type: 'object',
      properties: {
        proveedor: { type: 'string' },
        monto: { type: 'number' },
        fecha: { type: 'string' },
        descripcion: { type: 'string' },
      },
    },
  });

  return result;
}

export function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const diff = (d - start) / (1000 * 60 * 60 * 24);
  const week = Math.ceil((diff + start.getDay() + 1) / 7);
  return `${year}-${String(week).padStart(2, '0')}`;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
  }).format(value || 0);
}

export function getMonthName(monthIndex) {
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return months[monthIndex] || '';
}