import { requireSession } from './_lib/auth.js';
import { listRecords } from './_lib/airtable.js';
import { categorizeProduct, parseProductosString } from './_lib/products.js';

const STATUS_ORDER = ['1 Order Received', '2 Processing', '3 Ready', '4 Waiting for dock', '5 Loading', '6 Departed'];

// Nota: a diferencia de Code.gs (que combinaba Orders + OrdersArchive), aquí
// basta una sola consulta porque "Archivado" es un checkbox en la misma tabla
// Orders (ver Fase 2 de la guía) — no hay tabla separada que combinar.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res);
  if (!session) return;

  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'Missing date range' });

  const baseId = process.env.AIRTABLE_BASE_OPS;
  const records = await listRecords(baseId, 'Orders', {
    filterByFormula: `AND(IS_AFTER({Fecha}, '${start}'), IS_BEFORE({Fecha}, DATEADD('${end}', 1, 'days')))`
  });

  const total = records.length;
  const statusCounts = [0, 0, 0, 0, 0, 0];
  let departed = 0, incomplete = 0, boxesOrdered = 0, boxesShipped = 0;
  const byDay = {};
  const boxesByCategory = {};
  const boxesByCategoryShipped = {};
  const orderSummaries = [];

  records.forEach(record => {
    const f = record.fields;
    const estIdx = STATUS_ORDER.indexOf(f.Estatus);
    const est = estIdx >= 0 ? estIdx + 1 : 1;
    statusCounts[est - 1]++;

    let productEstatus = null;
    try { productEstatus = JSON.parse(f.ProductEstatus); } catch (e) { /* sin estado por producto */ }

    const cats = new Set();
    parseProductosString(f.Productos).forEach(({ qty, desc }) => {
      const cat = categorizeProduct(desc);
      cats.add(cat);
      boxesByCategory[cat] = (boxesByCategory[cat] || 0) + qty;
      boxesOrdered += qty;
      if (est === 6) {
        boxesByCategoryShipped[cat] = (boxesByCategoryShipped[cat] || 0) + qty;
        boxesShipped += qty;
      }
    });

    let orderIncomplete = false;
    if (est === 6) {
      departed++;
      const day = String(f.Fecha || '').slice(0, 10);
      if (day) byDay[day] = (byDay[day] || 0) + 1;
      if (Array.isArray(productEstatus) && productEstatus.some(s => s < 3)) {
        incomplete++;
        orderIncomplete = true;
      }
    }
    orderSummaries.push({ estatus: est, categories: [...cats], incomplete: orderIncomplete });
  });
  const pending = total - departed;

  const changesByUser = {};
  const logRecords = await listRecords(baseId, 'Log', {
    filterByFormula: `AND(IS_AFTER({Timestamp}, '${start}'), IS_BEFORE({Timestamp}, DATEADD('${end}', 1, 'days')))`
  });
  logRecords.forEach(r => {
    const usuario = String(r.fields.Usuario || '').trim();
    if (!usuario) return;
    changesByUser[usuario] = (changesByUser[usuario] || 0) + 1;
  });

  res.status(200).json({
    total, departed, pending, incomplete, statusCounts, byDay, changesByUser,
    boxesOrdered, boxesShipped, boxesByCategory, boxesByCategoryShipped, orderSummaries
  });
}
