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
  // Redimensiona y comprime una imagen en el navegador (canvas → JPEG).
  // Mantiene la proporción, limita el lado mayor a maxDim y devuelve un File JPEG.
  // Si el navegador no puede decodificar el formato (p. ej. HEIC de iPhone),
  // el que llama captura el error y sube el archivo original.
  function downscaleImage(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) { reject(new Error('sin dimensiones')); return; }
        const m = Math.max(w, h);
        if (m > maxDim) { const s = maxDim / m; w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); // fondo blanco para PNG/transparencias
        ctx.drawImage(img, 0, 0, w, h);
        c.toBlob((b) => {
          if (!b) { reject(new Error('sin blob')); return; }
          const name = (file.name || 'imagen').replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([b], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('no se pudo decodificar')); };
      img.src = url;
    });
  }

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
    branding: {
      get: () => req('GET', '/api/branding').then((d) => d.branding),
      set: (b) => req('PUT', '/api/branding', b).then((d) => d.branding),
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
      // Las imágenes rasterizadas se redimensionan y comprimen en el navegador antes
      // de subir, para que una foto de celular (que suele pesar varios MB) siempre
      // quepa en el límite de cuerpo del servidor. SVG y GIF se suben tal cual.
      upload: async (file) => {
        let toSend = file;
        if (file && /^image\//.test(file.type || '') && !/svg|gif/.test(file.type)) {
          try { toSend = await downscaleImage(file, 1600, 0.82); } catch (_) { toSend = file; }
        }
        const dataBase64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(toSend); });
        return req('POST', '/api/files', { filename: toSend.name || file.name, contentType: toSend.type || file.type, dataBase64 }).then((d) => d.file);
      },
      meta: (id) => req('GET', '/api/files/' + id).then((d) => d.file),
      remove: (id) => req('DELETE', '/api/files/' + id),
    },
  };

  global.NexAPI = NexAPI;
})(window);
