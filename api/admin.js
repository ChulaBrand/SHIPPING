import bcrypt from 'bcryptjs';
import { requireSession, requireAdmin, createSessionCookie } from './_lib/auth.js';
import { checkRateLimit, resetRateLimit } from './_lib/rateLimit.js';
import { listRecords, createRecords, updateRecords } from './_lib/airtable.js';

const CONFIG_DEFAULTS = [
  { key: 'core', order: 1, defaultRange: 'day' },
  { key: 'boxes', order: 2, defaultRange: 'day' },
  { key: 'status', order: 3, defaultRange: 'day' },
  { key: 'product', order: 4, defaultRange: 'day' },
  { key: 'day', order: 5, defaultRange: 'week' },
  { key: 'complete', order: 6, defaultRange: 'day' },
  { key: 'shipped', order: 7, defaultRange: 'day' },
  { key: 'person', order: 8, defaultRange: 'day' }
];

// Todo el panel de Admin en un solo archivo (una función serverless), por el
// límite de 12 funciones del plan Hobby de Vercel. Se distingue por
// "action" en query (GET) o body (POST), igual que Code.gs distinguía por
// action en doPost.
export default async function handler(req, res) {
  const action = req.method === 'GET' ? req.query.action : req.body?.action;

  if (action === 'login') return adminLogin(req, res);
  if (action === 'config') return req.method === 'GET' ? getConfig(req, res) : setConfig(req, res);
  if (action === 'users') return listUsers(req, res);
  if (action === 'addUser') return addUser(req, res);
  if (action === 'setPermissions') return setPermissions(req, res);
  if (action === 'toggleActive') return toggleActive(req, res);

  res.status(400).json({ error: 'Invalid action' });
}

// Segundo factor sobre la sesión de clerk ya logueada (igual que ADMIN_PIN en Code.gs).
async function adminLogin(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res);
  if (!session) return;

  const { adminPin } = req.body || {};
  const key = `admin_login_${session.name}`;
  if (await checkRateLimit(key, 5, 15 * 60)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.' });
  }

  const ok = await bcrypt.compare(String(adminPin || ''), process.env.ADMIN_PIN_HASH || '');
  if (!ok) return res.status(401).json({ error: 'PIN de admin incorrecto' });

  await resetRateLimit(key);
  res.setHeader('Set-Cookie', createSessionCookie({ name: session.name, permisos: session.permisos, isAdmin: true }));
  res.status(200).json({ success: true });
}

async function getConfig(req, res) {
  const session = requireSession(req, res);
  if (!session) return;
  const baseId = process.env.AIRTABLE_BASE_OPS;
  const records = await listRecords(baseId, 'Config', { filterByFormula: "{Key} = 'analytics_layout'" });
  if (!records[0]) return res.status(200).json(CONFIG_DEFAULTS);
  try {
    const parsed = JSON.parse(records[0].fields.Value);
    return res.status(200).json(Array.isArray(parsed) && parsed.length ? parsed : CONFIG_DEFAULTS);
  } catch (e) {
    return res.status(200).json(CONFIG_DEFAULTS);
  }
}

async function setConfig(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const baseId = process.env.AIRTABLE_BASE_OPS;
  const config = Array.isArray(req.body?.config) ? req.body.config : [];
  const records = await listRecords(baseId, 'Config', { filterByFormula: "{Key} = 'analytics_layout'" });
  if (records[0]) {
    await updateRecords(baseId, 'Config', [{ id: records[0].id, fields: { Value: JSON.stringify(config) } }]);
  } else {
    await createRecords(baseId, 'Config', [{ Key: 'analytics_layout', Value: JSON.stringify(config) }]);
  }
  res.status(200).json({ success: true });
}

async function listUsers(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const records = await listRecords(process.env.AIRTABLE_BASE_OPS, 'Users');
  res.status(200).json(records.map(r => ({
    name: r.fields.Nombre,
    active: !!r.fields.Activo,
    permissions: r.fields.Permisos || []
  })));
}

async function addUser(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const baseId = process.env.AIRTABLE_BASE_OPS;
  const { name, userPin, permissions } = req.body || {};
  const nameEscaped = String(name || '').replace(/'/g, "\\'");

  const existing = await listRecords(baseId, 'Users', { filterByFormula: `LOWER({Nombre}) = LOWER('${nameEscaped}')` });
  if (existing.length) return res.status(409).json({ error: 'That name already exists' });

  const pinHash = await bcrypt.hash(String(userPin), 10);
  await createRecords(baseId, 'Users', [{ Nombre: name, PinHash: pinHash, Activo: true, Permisos: permissions || ['clerk'] }]);
  res.status(200).json({ success: true });
}

async function setPermissions(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const baseId = process.env.AIRTABLE_BASE_OPS;
  const { name, permissions } = req.body || {};
  const nameEscaped = String(name || '').replace(/'/g, "\\'");

  const records = await listRecords(baseId, 'Users', { filterByFormula: `{Nombre} = '${nameEscaped}'` });
  if (!records[0]) return res.status(404).json({ error: 'Not found' });
  await updateRecords(baseId, 'Users', [{ id: records[0].id, fields: { Permisos: permissions || [] } }]);
  res.status(200).json({ success: true });
}

async function toggleActive(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const baseId = process.env.AIRTABLE_BASE_OPS;
  const { name, active } = req.body || {};
  const nameEscaped = String(name || '').replace(/'/g, "\\'");

  const records = await listRecords(baseId, 'Users', { filterByFormula: `{Nombre} = '${nameEscaped}'` });
  if (!records[0]) return res.status(404).json({ error: 'Not found' });
  await updateRecords(baseId, 'Users', [{ id: records[0].id, fields: { Activo: !!active } }]);
  res.status(200).json({ success: true });
}
