import { requirePermission } from '../_lib/auth.js';
import { listRecords, createRecords, deleteRecords } from '../_lib/airtable.js';

// Escribe las filas parseadas del PDF en la tabla "Draft" (reemplazando lo que
// hubiera), sin tocar "Orders" todavía — el clerk sigue presionando
// "Sync from Draft" (ver sync-draft.js) para pasarlas al tracker en vivo.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requirePermission(req, res, 'clerk');
  if (!session) return;

  const rows = req.body?.rows;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'No rows provided' });

  const invalidas = [];
  rows.forEach((r, i) => {
    const orden = String(r.orden || '').trim();
    if (!/^SP00\d+$/i.test(orden)) invalidas.push(`Fila ${i + 1}: "${orden || '(vacío)'}"`);
  });
  if (invalidas.length) {
    return res.status(400).json({
      error: 'Formato de orden inválido — debe ser "SP00" seguido de números. Revisa: ' + invalidas.join(', ')
    });
  }

  const baseId = process.env.AIRTABLE_BASE_OPS;
  const existing = await listRecords(baseId, 'Draft');
  if (existing.length) await deleteRecords(baseId, 'Draft', existing.map(r => r.id));

  await createRecords(baseId, 'Draft', rows.map(r => ({
    SP: String(r.orden || ''),
    Cliente: String(r.cliente || ''),
    Productos: String(r.productos || '')
  })));

  res.status(200).json({ success: true, count: rows.length });
}
