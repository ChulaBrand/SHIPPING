import { requireSession } from '../_lib/auth.js';
import { getOrdersData } from '../_lib/orders.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res);
  if (!session) return;

  const orders = await getOrdersData();
  res.status(200).json(orders);
}
