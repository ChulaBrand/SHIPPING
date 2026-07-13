import { requirePermission } from '../_lib/auth.js';
import { findOrderBySp } from '../_lib/orders.js';
import { updateRecords } from '../_lib/airtable.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
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
