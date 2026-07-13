import bcrypt from 'bcryptjs';
import { listRecords } from './_lib/airtable.js';
import { createSessionCookie } from './_lib/auth.js';
import { checkRateLimit, resetRateLimit } from './_lib/rateLimit.js';
import { getOrdersData } from './_lib/orders.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { name, userPin } = req.body || {};
  if (!name || !userPin) return res.status(400).json({ error: 'Faltan datos' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const userKey = `login_user_${name}`;
  const ipKey = `login_ip_${ip}`;

  if (await checkRateLimit(userKey, 5, 15 * 60)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.' });
  }
  if (await checkRateLimit(ipKey, 20, 60 * 60)) {
    return res.status(429).json({ error: 'Demasiados intentos desde esta red. Intenta más tarde.' });
  }

  const baseId = process.env.AIRTABLE_BASE_OPS;
  const nameEscaped = String(name).replace(/'/g, "\\'");
  const users = await listRecords(baseId, 'Users', { filterByFormula: `{Nombre} = '${nameEscaped}'` });
  const user = users[0];
  if (!user || !user.fields.Activo) return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });

  const ok = await bcrypt.compare(String(userPin), user.fields.PinHash || '');
  if (!ok) return res.status(401).json({ error: 'PIN incorrecto' });

  await resetRateLimit(userKey);
  const permisos = user.fields.Permisos || [];
  res.setHeader('Set-Cookie', createSessionCookie({ name: user.fields.Nombre, permisos, isAdmin: false }));

  const orders = await getOrdersData();
  res.status(200).json({ success: true, orders, permissions: permisos });
}
