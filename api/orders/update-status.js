import { requirePermission } from '../_lib/auth.js';
import { findOrderBySp } from '../_lib/orders.js';
import { updateRecords, createRecords } from '../_lib/airtable.js';
import { STATUS_LABELS } from '../_lib/checkins.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requirePermission(req, res, 'clerk');
  if (!session) return;

  const { orden, estatus, productEstatus } = req.body || {};
  const record = await findOrderBySp(orden);
  if (!record) return res.status(404).json({ error: 'Not found' });

  const f = record.fields;
  const lastChange = f.Actualizado || f.Fecha;
  if (lastChange) {
    const diffHours = (Date.now() - new Date(lastChange).getTime()) / 3600000;
    if (diffHours > 48) return res.status(423).json({ error: 'Locked' });
  }

  const estatusLabel = typeof estatus === 'number' ? STATUS_LABELS[estatus] : estatus;
  const updates = {
    Estatus: estatusLabel,
    Actualizado: new Date().toISOString(),
    ActualizadoPor: session.name
  };
  if (Array.isArray(productEstatus)) updates.ProductEstatus = JSON.stringify(productEstatus);

  const baseId = process.env.AIRTABLE_BASE_OPS;
  await updateRecords(baseId, 'Orders', [{ id: record.id, fields: updates }]);
  await createRecords(baseId, 'Log', [{ Orden: [record.id], Estatus: estatusLabel, Usuario: session.name, Timestamp: new Date().toISOString() }]);

  res.status(200).json({ success: true });
}
