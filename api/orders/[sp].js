import { findOrderBySp } from '../_lib/orders.js';
import { getDriverArrivalsMap, applyDriverLogic } from '../_lib/checkins.js';
import { updateRecords, createRecords } from '../_lib/airtable.js';

function safeParseJSON(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

// Público a propósito (igual que getOrder() en Code.gs): lo usa la vista de
// chofer/cliente, que no tiene sesión de clerk. No expone nada que un cliente
// no deba ver (estatus, productos, hora esperada).
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { sp } = req.query;

  const record = await findOrderBySp(sp);
  if (!record) return res.status(404).json({ error: 'Not found' });

  const arrivals = await getDriverArrivalsMap();
  const resolved = await applyDriverLogic(record, arrivals);
  if (resolved.changed) {
    const baseId = process.env.AIRTABLE_BASE_OPS;
    await updateRecords(baseId, 'Orders', [{ id: record.id, fields: resolved.updates }]);
    if (resolved.updates.Estatus) {
      await createRecords(baseId, 'Log', [{ Orden: [record.id], Estatus: resolved.updates.Estatus, Usuario: 'System', Timestamp: new Date().toISOString() }]);
    }
  }

  const f = record.fields;
  res.status(200).json({
    orden: String(f.SP),
    cliente: f.Cliente || '',
    productos: f.Productos || '',
    estatus: resolved.estatus,
    productEstatus: safeParseJSON(f.ProductEstatus),
    fecha: f.Fecha || '',
    actualizado: f.Actualizado || f.Fecha || '',
    actualizadoPor: f.ActualizadoPor || '',
    expectedReady: f.ExpectedReady || '',
    driverArrived: resolved.driverInfo
  });
}
