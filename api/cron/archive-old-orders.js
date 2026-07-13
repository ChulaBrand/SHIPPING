import { listRecords, updateRecords } from '../_lib/airtable.js';

// Reemplaza a maybeArchiveOldOrders()/archiveOldOrders(): Vercel llama esto
// solo (ver vercel.json) cada 6 horas, mandando el header Authorization con
// CRON_SECRET. En vez de mover filas a otra hoja, solo marca Archivado = true
// (ver Fase 2: Orders usa un checkbox + vista filtrada en vez de OrdersArchive).
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const baseId = process.env.AIRTABLE_BASE_OPS;
  const records = await listRecords(baseId, 'Orders', { filterByFormula: 'NOT({Archivado})' });

  const toArchive = [];
  records.forEach(r => {
    const lastChange = r.fields.Actualizado || r.fields.Fecha;
    if (!lastChange) return;
    const diffHours = (Date.now() - new Date(lastChange).getTime()) / 3600000;
    if (diffHours > 48) toArchive.push({ id: r.id, fields: { Archivado: true } });
  });

  if (toArchive.length) await updateRecords(baseId, 'Orders', toArchive);
  res.status(200).json({ archived: toArchive.length });
}
