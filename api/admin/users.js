import bcrypt from 'bcryptjs';
import { requireAdmin } from '../_lib/auth.js';
import { listRecords, createRecords, updateRecords } from '../_lib/airtable.js';

export default async function handler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const baseId = process.env.AIRTABLE_BASE_OPS;

  if (req.method === 'GET') {
    const records = await listRecords(baseId, 'Users');
    return res.status(200).json(records.map(r => ({
      name: r.fields.Nombre,
      active: !!r.fields.Activo,
      permissions: r.fields.Permisos || []
    })));
  }

  if (req.method === 'POST') {
    const { action, name, userPin, permissions, active } = req.body || {};
    const nameEscaped = String(name || '').replace(/'/g, "\\'");

    if (action === 'add') {
      const existing = await listRecords(baseId, 'Users', { filterByFormula: `LOWER({Nombre}) = LOWER('${nameEscaped}')` });
      if (existing.length) return res.status(409).json({ error: 'That name already exists' });
      const pinHash = await bcrypt.hash(String(userPin), 10);
      await createRecords(baseId, 'Users', [{
        Nombre: name, PinHash: pinHash, Activo: true, Permisos: permissions || ['clerk']
      }]);
      return res.status(200).json({ success: true });
    }

    if (action === 'setPermissions') {
      const records = await listRecords(baseId, 'Users', { filterByFormula: `{Nombre} = '${nameEscaped}'` });
      if (!records[0]) return res.status(404).json({ error: 'Not found' });
      await updateRecords(baseId, 'Users', [{ id: records[0].id, fields: { Permisos: permissions || [] } }]);
      return res.status(200).json({ success: true });
    }

    if (action === 'toggleActive') {
      const records = await listRecords(baseId, 'Users', { filterByFormula: `{Nombre} = '${nameEscaped}'` });
      if (!records[0]) return res.status(404).json({ error: 'Not found' });
      await updateRecords(baseId, 'Users', [{ id: records[0].id, fields: { Activo: !!active } }]);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
