const { json, handler } = require('../../lib/http');
const { clearAuthCookie } = require('../../lib/auth');

module.exports = handler(async (req, res) => {
  clearAuthCookie(res);
  return json(res, 200, { ok: true });
});
