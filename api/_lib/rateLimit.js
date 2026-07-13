// Rate limiting equivalente al CacheService de Apps Script. Si defines
// UPSTASH_REDIS_REST_URL/TOKEN (integración gratuita de Vercel con Upstash),
// los contadores se guardan ahí y funcionan igual en todas las instancias del
// backend. Sin esas variables, cae a un Map en memoria: funciona para probar,
// pero cada instancia serverless tiene su propio contador (no es un límite
// global real). Para producción, conecta Upstash.
const memoryStore = new Map();

async function upstashCommand(...args) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(`${url}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.result;
}

// true si "key" ya superó "limit" intentos dentro de "windowSeconds"
export async function checkRateLimit(key, limit, windowSeconds) {
  if (process.env.UPSTASH_REDIS_REST_URL) {
    const count = await upstashCommand('INCR', key);
    if (count === 1) await upstashCommand('EXPIRE', key, String(windowSeconds));
    return count > limit;
  }

  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || now > entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

export async function resetRateLimit(key) {
  memoryStore.delete(key);
  if (process.env.UPSTASH_REDIS_REST_URL) await upstashCommand('DEL', key);
}
