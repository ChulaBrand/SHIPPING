import { listRecords } from './airtable.js';

export const STATUS_LABELS = {
  1: '1 Order Received',
  2: '2 Processing',
  3: '3 Ready',
  4: '4 Waiting for dock',
  5: '5 Loading',
  6: '6 Departed'
};

function extractSpNumbers(cell) {
  const matches = String(cell || '').match(/\d{6,}/g);
  return matches ? matches.map(m => parseInt(m, 10)) : [];
}

function todayISO_Chicago() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

// spInt -> { driver, rampa, time } — solo check-ins de "Loading" de HOY.
// Reemplaza a getDriverArrivalsMap() de Code.gs: en vez de parsear el Sheet crudo,
// consulta la tabla CheckIns (base "Chula CheckIns"), que ya llega limpia porque
// el webhook de JotForm normaliza SPsNormalizados al momento de la captura.
export async function getDriverArrivalsMap() {
  const baseId = process.env.AIRTABLE_BASE_CHECKINS;
  const today = todayISO_Chicago();
  const records = await listRecords(baseId, 'CheckIns', {
    filterByFormula: `AND({Tipo} = 'Loading', IS_SAME({Fecha}, '${today}', 'day'))`
  });

  const map = {};
  records.forEach(r => {
    const f = r.fields;
    const spNumbers = extractSpNumbers(f.SPsNormalizados || f.SPs);
    if (!spNumbers.length) return;
    const driver = [f.Nombre, f.Apellido].filter(Boolean).join(' ').trim();
    const info = { driver, rampa: f.Rampa || '', time: f.Hora || '' };
    spNumbers.forEach(sp => { map[sp] = info; });
  });
  return map;
}

function statusNumFromLabel(label) {
  const entry = Object.entries(STATUS_LABELS).find(([, v]) => v === label);
  return entry ? parseInt(entry[0], 10) : 1;
}

// Equivalente a applyDriverLogicToRow(): aplica las transiciones automáticas
// 3 (Ready) -> 4 (Waiting for dock) cuando el chofer llegó, y 4 -> 5 (Loading)
// cuando además ya tiene rampa asignada. Regresa los campos a actualizar en
// Airtable (si hubo cambio) para que el llamador los escriba en lote junto
// con el Log — aquí no se escribe nada directo, solo se calcula.
export async function applyDriverLogic(orderRecord, arrivals) {
  const f = orderRecord.fields;
  const liveArrival = (f.SP !== undefined && arrivals[f.SP]) ? arrivals[f.SP] : null;

  let estatusLabel = f.Estatus;
  const updates = {};

  if (liveArrival) {
    let est = statusNumFromLabel(estatusLabel);
    if (est === 3) est = 4;
    if (est === 4 && liveArrival.rampa) est = 5;
    if (STATUS_LABELS[est] !== estatusLabel) {
      estatusLabel = STATUS_LABELS[est];
      updates.Estatus = estatusLabel;
      updates.Actualizado = new Date().toISOString();
      updates.ActualizadoPor = 'System';
    }
  }

  let driverInfo = f.DriverNombre ? { driver: f.DriverNombre, rampa: f.DriverRampa || '', time: f.DriverHora || '' } : null;
  if (!driverInfo && liveArrival) {
    driverInfo = liveArrival;
    if (liveArrival.rampa) {
      updates.DriverNombre = liveArrival.driver;
      updates.DriverRampa = liveArrival.rampa;
      updates.DriverHora = liveArrival.time;
    }
  }

  return { estatus: estatusLabel, driverInfo, updates, changed: Object.keys(updates).length > 0 };
}
