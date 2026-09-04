# Backend de producción — Centro de Transferencia del Conocimiento (HUAP)

Persistencia real sobre **Vercel Postgres** (base de datos) + **Vercel Blob** (archivos),
con **API segura** (`/api/*`), **sesión JWT en cookie httpOnly** y **permisos verificados en el servidor**.

> Nada de esto usa `localStorage`. Los archivos se guardan en Blob (no como base64 en la base de datos).

---

## 1. Arquitectura

```
Navegador (index.html portada / admin.html panel)
        │  fetch  /api/*
        ▼
Funciones serverless de Vercel  (carpeta /api)
        ├── Vercel Postgres  → recursos, usuarios, textos, evidencia, estadísticas, auditoría
        └── Vercel Blob      → imágenes y documentos (PDF, Word, PowerPoint, audio, video)
```

- `lib/db.js` — conexión Postgres, creación del esquema (idempotente) y datos base.
- `lib/auth.js` — firma/verificación de JWT, cookie httpOnly y **matriz de permisos** (aplicada en cada endpoint).
- `lib/resources.js`, `lib/http.js` — utilidades.

## 2. Endpoints

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | público | Inicia sesión (correo + contraseña) → cookie |
| POST | `/api/auth/logout` | — | Cierra sesión |
| GET | `/api/auth/me` | — | Usuario actual |
| GET | `/api/resources?scope=public` | público | Solo recursos **publicados** (portada) |
| GET | `/api/resources?scope=all` | sesión | Todos los recursos (panel) |
| POST | `/api/resources` | resources | Crear |
| PUT/DELETE | `/api/resources/:id` | resources | Editar / cambiar estado / eliminar |
| GET/PUT | `/api/weekly` | content (PUT) | Evidencia de la semana |
| GET/PUT | `/api/experience` | content (PUT) | Textos de la portada |
| GET/POST | `/api/users` · `/api/users/:id` | users | Administradores y roles |
| GET | `/api/stats` | sesión | Estadísticas |
| POST | `/api/stats/track` | público | Registrar visita/apertura/descarga/búsqueda/EVI |
| POST | `/api/stats/reset` | stats | Reiniciar a cero (solo principal) |
| GET | `/api/audit` | sesión | Registro de acciones |
| POST | `/api/files` · DELETE `/api/files/:id` | resources | Subir/eliminar archivos (Blob) |
| GET | `/api/health` | público | Estado de la base de datos |

**Roles / permisos** (verificados en el servidor, no solo ocultando botones):

| Rol | resources | content | users | stats |
|---|---|---|---|---|
| Administrador principal | ✅ | ✅ | ✅ | ✅ |
| Administrador de biblioteca | ✅ | ✅ | ❌ | ❌ |
| Editor de contenidos | ✅ | ❌ | ❌ | ❌ |

## 3. Puesta en marcha en Vercel (una sola vez)

1. **Conecta el repositorio** `gonzalez2049-max/Biblioteca_digital_UBPC` a un proyecto de Vercel.
2. En el panel de Vercel → **Storage**:
   - Crea una base de datos **Postgres** y conéctala al proyecto (inyecta `POSTGRES_URL`, etc.).
   - Crea un store **Blob** y conéctalo (inyecta `BLOB_READ_WRITE_TOKEN`).
3. En **Settings → Environment Variables** agrega:

   | Variable | Ejemplo | Para qué |
   |---|---|---|
   | `AUTH_SECRET` | *(cadena larga y aleatoria)* | Firmar los tokens de sesión |
   | `ADMIN_EMAIL` | `admin@huap.cl` | Correo del primer Administrador principal |
   | `ADMIN_PASSWORD` | *(contraseña fuerte)* | Su contraseña inicial |
   | `ADMIN_NAME` | `Administrador principal` | Su nombre |

   `POSTGRES_URL` y `BLOB_READ_WRITE_TOKEN` los agrega Vercel automáticamente al conectar los stores.
4. **Deploy**. En el primer acceso, la base de datos crea sus tablas y el usuario principal.
5. Verifica: abre `/api/health` → debe responder `{"ok":true,"db":true}`.

> Genera `AUTH_SECRET` con: `openssl rand -base64 32`

## 4. Pruebas (tras el deploy)

```bash
# 1. Salud de la base de datos
curl https://TU-DOMINIO/api/health

# 2. Login (guarda la cookie)
curl -c cookies.txt -X POST https://TU-DOMINIO/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@huap.cl","password":"TU_CLAVE"}'

# 3. Crear y publicar un recurso
curl -b cookies.txt -X POST https://TU-DOMINIO/api/resources \
  -H 'Content-Type: application/json' \
  -d '{"titulo":"Prueba","descripcion":"...","ruta":"aprender","tema":"iaas","estado":"publicado"}'

# 4. La portada solo ve publicados
curl https://TU-DOMINIO/api/resources?scope=public
```

## 5. Paso final pendiente: conectar la interfaz a la API

`index.html` (portada) y `admin.html` (panel) todavía usan su capa de datos anterior.
El cliente listo para usar está en **`/api-client.js`** (`window.NexAPI`).
La conmutación se hará **contra la base de datos ya provisionada** para poder probarla de verdad
(en lugar de a ciegas): reemplazar las lecturas/escrituras locales por `NexAPI.*`
(por ejemplo, la portada usa `NexAPI.resources.listPublic()` y el panel `NexAPI.auth.login()`,
`NexAPI.resources.*`, `NexAPI.files.upload()`, etc.).

## 6. Desarrollo local (opcional)

```bash
npm install
npm i -g vercel
vercel link
vercel env pull .env.local   # baja las variables del proyecto
vercel dev                    # http://localhost:3000
```
