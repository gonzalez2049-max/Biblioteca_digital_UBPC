/*
 * Cliente de navegador para la API del Centro de Transferencia (HUAP).
 * Uso desde index.html (portada) y admin.html (panel), reemplazando localStorage.
 * Todas las llamadas usan rutas internas /api/* y cookies httpOnly para la sesión.
 *
 * Integración (paso final, tras habilitar Vercel Postgres + Blob):
 *   <script src="/api-client.js"></script>  antes del script de la página.
 *   const recursos = await NexAPI.resources.listPublic();   // portada
 *   await NexAPI.auth.login(correo, clave);                  // panel
 */
(function (global) {
  async function req(method, path, body) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.message || data.error || ('HTTP ' + res.status)); err.status = res.status; err.code = data.error; throw err; }
    return data;
  }

  const NexAPI = {
    health: () => req('GET', '/api/health'),
    auth: {
      login: (correo, password) => req('POST', '/api/auth/login', { email: correo, password }),
      logout: () => req('POST', '/api/auth/logout'),
      me: () => req('GET', '/api/auth/me'),
    },
    resources: {
      listPublic: () => req('GET', '/api/resources?scope=public').then((d) => d.resources),
      listAll: () => req('GET', '/api/resources?scope=all').then((d) => d.resources),
      create: (r) => req('POST', '/api/resources', r).then((d) => d.resource),
      update: (id, r) => req('PUT', '/api/resources/' + id, r).then((d) => d.resource),
      setEstado: (id, estado) => req('PUT', '/api/resources/' + id, { estado }).then((d) => d.resource),
      remove: (id) => req('DELETE', '/api/resources/' + id),
    },
    weekly: {
      get: () => req('GET', '/api/weekly').then((d) => d.weekly),
      set: (w) => req('PUT', '/api/weekly', w).then((d) => d.weekly),
    },
    experience: {
      get: () => req('GET', '/api/experience').then((d) => d.experience),
      set: (e) => req('PUT', '/api/experience', e).then((d) => d.experience),
    },
    users: {
      list: () => req('GET', '/api/users').then((d) => d.users),
      create: (u) => req('POST', '/api/users', u).then((d) => d.user),
      update: (id, u) => req('PUT', '/api/users/' + id, u).then((d) => d.user),
      remove: (id) => req('DELETE', '/api/users/' + id),
    },
    stats: {
      get: () => req('GET', '/api/stats').then((d) => d.stats),
      reset: () => req('POST', '/api/stats/reset').then((d) => d.stats),
      track: (evt) => req('POST', '/api/stats/track', evt).catch(() => {}),
    },
    audit: () => req('GET', '/api/audit').then((d) => d.audit),
    files: {
      // file: objeto File del navegador. Devuelve {id,name,type,size,url}.
      upload: async (file) => {
        const dataBase64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(file); });
        return req('POST', '/api/files', { filename: file.name, contentType: file.type, dataBase64 }).then((d) => d.file);
      },
      meta: (id) => req('GET', '/api/files/' + id).then((d) => d.file),
      remove: (id) => req('DELETE', '/api/files/' + id),
    },
  };

  global.NexAPI = NexAPI;
})(window);
