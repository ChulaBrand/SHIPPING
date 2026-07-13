import { requireSession, requireAdmin } from '../_lib/auth.js';
import { listRecords, createRecords, updateRecords } from '../_lib/airtable.js';

const DEFAULTS = [
  { key: 'core', order: 1, defaultRange: 'day' },
  { key: 'boxes', order: 2, defaultRange: 'day' },
  { key: 'status', order: 3, defaultRange: 'day' },
  { key: 'product', order: 4, defaultRange: 'day' },
  { key: 'day', order: 5, defaultRange: 'week' },
  { key: 'complete', order: 6, defaultRange: 'day' },
  { key: 'shipped', order: 7, defaultRange: 'day' },
  { key: 'person', order: 8, defaultRange: 'day' }
];

export default async function handler(req, res) {
  const baseId = process.env.AIRTABLE_BASE_OPS;

  if (req.method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return;
    const records = await listRecords(baseId, 'Config', { filterByFormula: "{Key} = 'analytics_layout'" });
    if (!records[0]) return res.status(200).json(DEFAULTS);
    try {
      const parsed = JSON.parse(records[0].fields.Value);
      return res.status(200).json(Array.isArray(parsed) && parsed.length ? parsed : DEFAULTS);
    } catch (e) {
      return res.status(200).json(DEFAULTS);
    }
  }

  if (req.method === 'POST') {
    const session = requireAdmin(req, res);
    if (!session) return;
    const config = Array.isArray(req.body?.config) ? req.body.config : [];
    const records = await listRecords(baseId, 'Config', { filterByFormula: "{Key} = 'analytics_layout'" });
    if (records[0]) {
      await updateRecords(baseId, 'Config', [{ id: records[0].id, fields: { Value: JSON.stringify(config) } }]);
    } else {
      await createRecords(baseId, 'Config', [{ Key: 'analytics_layout', Value: JSON.stringify(config) }]);
    }
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
