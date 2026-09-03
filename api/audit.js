const { json, handler } = require('../lib/http');
const { sql, ensureSchema } = require('../lib/db');
const { requireAuth } = require('../lib/auth');

module.exports = handler(async (req, res) => {
  await ensureSchema();
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const u = requireAuth(req, res);
  if (!u) return;
  const { rows } = await sql`SELECT to_char(t, 'DD Mon · HH24:MI') AS t, who, what FROM audit ORDER BY t DESC LIMIT 50`;
  return json(res, 200, { audit: rows });
});
