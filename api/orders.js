import { requireSession, requirePermission } from './_lib/auth.js';
import { getOrdersData, findOrderBySp } from './_lib/orders.js';
import { getDriverArrivalsMap, applyDriverLogic, STATUS_LABELS } from './_lib/checkins.js';
import { listRecords, createRecords, updateRecords, deleteRecords } from './_lib/airtable.js';

function safeParseJSON(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function todayISO_Chicago() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

// Todas las operaciones sobre "Orders" viven en un solo archivo (una función
// serverless) para no pasarnos del límite de 12 funciones del plan Hobby de
// Vercel. Se distingue por método + query/body, igual que doGet/doPost en
// Code.gs distinguía por "action".
export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.status(405).json({ error: 'Method not allowed' });
}

// GET /api/orders            -> lista completa (requiere sesión)
// GET /api/orders?sp=381686  -> una orden (público, vista de chofer/cliente)
async function handleGet(req, res) {
  const { sp } = req.query;

  if (sp) {
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
    return res.status(200).json({
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

  const session = requireSession(req, res);
  if (!session) return;
  const orders = await getOrdersData();
  res.status(200).json(orders);
}

// POST /api/orders  { action: 'updateStatus' | 'setExpectedReady' | 'syncDraft' | 'writeDraft', ... }
async function handlePost(req, res) {
  const { action } = req.body || {};
  if (action === 'updateStatus') return updateStatus(req, res);
  if (action === 'setExpectedReady') return setExpectedReady(req, res);
  if (action === 'syncDraft') return syncDraft(req, res);
  if (action === 'writeDraft') return writeDraft(req, res);
  res.status(400).json({ error: 'Invalid action' });
}

async function updateStatus(req, res) {
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

async function setExpectedReady(req, res) {
  const session = requirePermission(req, res, 'clerk');
  if (!session) return;

  const { orden, expectedReady } = req.body || {};
  const record = await findOrderBySp(orden);
  if (!record) return res.status(404).json({ error: 'Not found' });

  await updateRecords(process.env.AIRTABLE_BASE_OPS, 'Orders', [
    { id: record.id, fields: { ExpectedReady: expectedReady || null } }
  ]);
  res.status(200).json({ success: true });
}

async function writeDraft(req, res) {
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

async function syncDraft(req, res) {
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
