import { requirePermission } from '../_lib/auth.js';
import { listRecords, createRecords, updateRecords, deleteRecords } from '../_lib/airtable.js';

function todayISO_Chicago() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requirePermission(req, res, 'clerk');
  if (!session) return;

  const baseId = process.env.AIRTABLE_BASE_OPS;
  const draftRows = await listRecords(baseId, 'Draft');
  const orderRecords = await listRecords(baseId, 'Orders');
  const today = todayISO_Chicago();

  const existingBySp = {};
  orderRecords.forEach(r => { if (r.fields.SP) existingBySp[String(r.fields.SP)] = r; });

  const toUpdate = [];
  const toCreate = [];

  for (const draft of draftRows) {
    const spDigits = String(draft.fields.SP || '').replace(/\D/g, '');
    if (!spDigits) continue;
    const spInt = parseInt(spDigits, 10);
    const key = String(spInt);
    const cliente = draft.fields.Cliente || '';
    const productos = draft.fields.Productos || '';

    if (existingBySp[key]) {
      const existing = existingBySp[key];
      // Fecha se re-sincroniza siempre que el pedido reaparece en un PDF nuevo.
      // Actualizado (último cambio de ESTATUS) NO se toca aquí a propósito.
      const fields = { Cliente: cliente, Productos: productos, Fecha: today };
      if (!existing.fields.Actualizado) fields.Actualizado = today;
      toUpdate.push({ id: existing.id, fields });
    } else {
      toCreate.push({
        SP: spInt,
        Cliente: cliente,
        Productos: productos,
        Estatus: '1 Order Received',
        Fecha: today,
        Actualizado: today
      });
    }
  }

  if (toUpdate.length) await updateRecords(baseId, 'Orders', toUpdate);
  if (toCreate.length) await createRecords(baseId, 'Orders', toCreate);
  if (draftRows.length) await deleteRecords(baseId, 'Draft', draftRows.map(r => r.id));

  res.status(200).json({ success: true });
}
