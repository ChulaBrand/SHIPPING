const AIRTABLE_API = 'https://api.airtable.com/v0';

async function airtableFetch(baseId, path, options = {}, retriesLeft = 3) {
  const res = await fetch(`${AIRTABLE_API}/${baseId}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (res.status === 429 && retriesLeft > 0) {
    const retryAfter = parseInt(res.headers.get('Retry-After'), 10) || 30;
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return airtableFetch(baseId, path, options, retriesLeft - 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

export async function listRecords(baseId, table, { filterByFormula, sort, maxRecords, view } = {}) {
  const records = [];
  let offset;
  do {
    const params = new URLSearchParams();
    if (filterByFormula) params.set('filterByFormula', filterByFormula);
    if (maxRecords) params.set('maxRecords', String(maxRecords));
    if (view) params.set('view', view);
    if (sort) sort.forEach((s, i) => {
      params.set(`sort[${i}][field]`, s.field);
      params.set(`sort[${i}][direction]`, s.direction || 'asc');
    });
    if (offset) params.set('offset', offset);
    const data = await airtableFetch(baseId, `${encodeURIComponent(table)}?${params.toString()}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

export async function createRecords(baseId, table, fieldsList) {
  const created = [];
  for (let i = 0; i < fieldsList.length; i += 10) {
    const batch = fieldsList.slice(i, i + 10);
    const data = await airtableFetch(baseId, encodeURIComponent(table), {
      method: 'POST',
      body: JSON.stringify({ records: batch.map(fields => ({ fields })) })
    });
    created.push(...data.records);
  }
  return created;
}

export async function updateRecords(baseId, table, updates) {
  const updated = [];
  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    const data = await airtableFetch(baseId, encodeURIComponent(table), {
      method: 'PATCH',
      body: JSON.stringify({ records: batch })
    });
    updated.push(...data.records);
  }
  return updated;
}

export async function deleteRecords(baseId, table, recordIds) {
  for (let i = 0; i < recordIds.length; i += 10) {
    const batch = recordIds.slice(i, i + 10);
    const params = batch.map(id => `records[]=${encodeURIComponent(id)}`).join('&');
    await airtableFetch(baseId, `${encodeURIComponent(table)}?${params}`, { method: 'DELETE' });
  }
}
