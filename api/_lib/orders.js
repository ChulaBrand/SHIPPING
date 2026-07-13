import { listRecords, updateRecords, createRecords } from './airtable.js';
import { getDriverArrivalsMap, applyDriverLogic } from './checkins.js';

function safeParseJSON(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function mapOrderRecord(record, resolved) {
  const f = record.fields;
  return {
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
  };
}

// Equivalente a getOrdersData(): trae todas las órdenes activas (no archivadas),
// aplica las transiciones automáticas de chofer, persiste los cambios en lote
// (batch de 10, ver airtable.js) y registra cada transición en Log.
export async function getOrdersData() {
  const baseId = process.env.AIRTABLE_BASE_OPS;
  const records = await listRecords(baseId, 'Orders', { filterByFormula: 'NOT({Archivado})' });
  const arrivals = await getDriverArrivalsMap();

  const updates = [];
  const logEntries = [];
  const orders = [];

  for (const record of records) {
    const resolved = await applyDriverLogic(record, arrivals);
    if (resolved.changed) {
      updates.push({ id: record.id, fields: resolved.updates });
      if (resolved.updates.Estatus) {
        logEntries.push({ Orden: [record.id], Estatus: resolved.updates.Estatus, Usuario: 'System', Timestamp: new Date().toISOString() });
      }
    }
    orders.push(mapOrderRecord(record, resolved));
  }

  if (updates.length) await updateRecords(baseId, 'Orders', updates);
  if (logEntries.length) await createRecords(baseId, 'Log', logEntries);

  return orders;
}

export async function findOrderBySp(sp) {
  const baseId = process.env.AIRTABLE_BASE_OPS;
  const spInt = parseInt(String(sp).replace(/\D/g, ''), 10);
  if (!spInt) return null;
  const records = await listRecords(baseId, 'Orders', { filterByFormula: `{SP} = ${spInt}` });
  return records[0] || null;
}
