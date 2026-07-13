import { listRecords } from './_lib/airtable.js';

// Lista pública de nombres activos, para pintar los botones de login (sin PINs).
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const records = await listRecords(process.env.AIRTABLE_BASE_OPS, 'Users', {
    filterByFormula: '{Activo} = TRUE()'
  });
  res.status(200).json(records.map(r => r.fields.Nombre));
}
