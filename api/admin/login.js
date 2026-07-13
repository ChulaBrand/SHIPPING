import bcrypt from 'bcryptjs';
import { requireSession, createSessionCookie } from '../_lib/auth.js';
import { checkRateLimit, resetRateLimit } from '../_lib/rateLimit.js';

// Segundo factor sobre la sesión ya logueada como clerk: además de tu PIN
// personal, el panel de Admin pide el ADMIN_PIN compartido (igual que en
// Code.gs). Si es correcto, se reemite la cookie de sesión con isAdmin: true.
export default async function handler(req, res) {
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
