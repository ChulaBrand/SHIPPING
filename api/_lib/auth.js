import jwt from 'jsonwebtoken';
import { serialize, parse } from 'cookie';

const COOKIE_NAME = 'session';
const SESSION_HOURS = 10;

export function createSessionCookie(payload) {
  const token = jwt.sign(payload, process.env.SESSION_SECRET, { expiresIn: `${SESSION_HOURS}h` });
  return serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * SESSION_HOURS,
    path: '/'
  });
}

export function clearSessionCookie() {
  return serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 0,
    path: '/'
  });
}

export function getSession(req) {
  const cookies = parse(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.SESSION_SECRET);
  } catch (e) {
    return null;
  }
}

// Cada uno de estos regresa la sesión si es válida, o responde el error y regresa null.
// Los endpoints deben hacer `if (!session) return;` justo después de llamarlos.
export function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'No autenticado' });
    return null;
  }
  return session;
}

export function requirePermission(req, res, permission) {
  const session = requireSession(req, res);
  if (!session) return null;
  if (!(session.permisos || []).includes(permission)) {
    res.status(403).json({ error: 'Sin permiso' });
    return null;
  }
  return session;
}

export function requireAdmin(req, res) {
  const session = requireSession(req, res);
  if (!session) return null;
  if (!session.isAdmin) {
    res.status(403).json({ error: 'Sin permiso de administrador' });
    return null;
  }
  return session;
}
