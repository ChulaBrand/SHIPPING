import { createRecords } from '../_lib/airtable.js';

function extractSpNumbersCsv(cell) {
  const matches = String(cell || '').match(/\d{6,}/g);
  return matches ? matches.join(',') : '';
}

// IMPORTANTE: los nombres de campo de "body" de abajo (sp, name, lastname, ...)
// son un supuesto razonable a partir de tu JotForm actual — ajústalos a los
// nombres reales de los campos una vez que conectes el webhook de verdad
// (JotForm manda "rawRequest" con los IDs de campo tal cual los configuraste).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.query.secret !== process.env.JOTFORM_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  const body = req.body || {};
  const spRaw = body.sp || body.SP || '';

  await createRecords(process.env.AIRTABLE_BASE_CHECKINS, 'CheckIns', [{
    Fecha: new Date().toISOString().slice(0, 10),
    Hora: body.time || '',
    Nombre: body.name || body.firstName || '',
    Apellido: body.lastname || body.lastName || '',
    Tipo: body.loadUnload || body.tipo || 'Loading',
    SPs: String(spRaw),
    SPsNormalizados: extractSpNumbersCsv(spRaw),
    Rampa: body.rampa || '',
    Transporte: body.transporte || '',
    Placas: body.placas || ''
  }]);

  res.status(200).json({ success: true });
}
