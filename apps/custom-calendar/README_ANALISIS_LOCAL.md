# Análisis del repositorio `custom-calendar`

## 1) Arquitectura actual

### Frontend
- Ubicación: `web/`
- Stack: React 18 + Vite 5 (`web/package.json`)
- Entrada: `web/src/main.jsx` -> `web/src/App.jsx`
- Estado de auth en cliente:
  - Guarda JWT en `localStorage` (`web/src/api.js`)
  - Si no hay token: muestra Login/Register
  - Si hay token: renderiza calendario
- Funcionalidad principal:
  - Login/Register
  - Bootstrap de BD desde UI (botón dev)
  - Listado/creación de familias
  - Vista mensual y creación de eventos
- API base frontend:
  - `VITE_API_BASE` o fallback `http://localhost:10000`

### Backend
- Ubicación: `api/`
- Stack: Node.js (ESM) + Express 4 + `pg`
- Entrada: `api/server.js`
- CORS:
  - `origin` restringido por `WEB_ORIGIN`
- Endpoints detectados:
  - `GET /health`
  - `POST /admin/bootstrap` (crea tablas/índice)
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /families` (auth)
  - `POST /families` (auth)
  - `GET /families/:familyId/events` (auth)
  - `POST /families/:familyId/events` (auth con rol owner/editor)

### Base de datos
- Motor: PostgreSQL (`pg`)
- Conexión: `DATABASE_URL` en `api/.env` (`api/db.js`)
- SSL:
  - Auto activado cuando la URL parece de Render (`render.com` o `dpg-`)
- Esquema (creado por `/admin/bootstrap`):
  - `users`
  - `families`
  - `family_members` (roles: `owner|editor|reader`)
  - `events`
  - Índice `events_family_start_idx`
- Migraciones formales: no hay (ni Prisma/Knex/TypeORM ni carpeta `migrations/`)
- Seeds formales: no hay

### Auth
- JWT firmado con `JWT_SECRET`
- Middleware `auth` valida `Authorization: Bearer <token>`
- Registro:
  - hash de contraseña con `bcryptjs` (cost 12)
- Sesión:
  - frontend persiste token en `localStorage`

### Despliegue (estado actual observado)
- No hay `Dockerfile`, `docker-compose`, ni IaC en el repo.
- Hay indicios de despliegue tipo Render:
  - `DATABASE_URL` actual apunta a host `*.render.com`
  - Backend preparado para `PORT` dinámico y SSL condicional
- Conclusión: despliegue probable en plataforma managed (Render u otra similar), pero no codificado en este repo.

## 2) Cómo levantarlo en local (paso a paso)

## Requisitos
- Node.js 18+ (recomendado 20 LTS)
- npm
- PostgreSQL accesible (local o remoto)

## Paso 1: preparar variables de entorno del backend
Archivo: `api/.env`

Variables mínimas:
- `PORT=10000`
- `NODE_ENV=development`
- `DATABASE_URL=postgresql://USER:PASS@HOST:5432/DBNAME`
- `JWT_SECRET=un_secreto_largo_y_unico`
- `WEB_ORIGIN=http://localhost:5173`

## Paso 2: instalar dependencias
Desde la raíz del repo:

```bash
cd api && npm install
cd ../web && npm install
```

## Paso 3: arrancar backend
Terminal 1:

```bash
cd api
npm start
```

Esperado: API escuchando en `http://localhost:10000`.

## Paso 4: arrancar frontend
Terminal 2:

```bash
cd web
npm run dev
```

Esperado: Vite en `http://localhost:5173`.

## Paso 5: bootstrap de tablas
Opción A (desde UI):
- Abrir `http://localhost:5173`
- En pantalla login, pulsar `(Dev) Bootstrap DB tables`

Opción B (curl):

```bash
curl -X POST http://localhost:10000/admin/bootstrap
```

## Paso 6: flujo funcional mínimo
1. Registrar usuario
2. Login
3. Crear familia
4. Crear evento
5. Navegar mes para verificar que se pinta en calendario

## 3) Checklist de Health Check (pre-cambios)

- [ ] `api/.env` existe y contiene: `PORT`, `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`
- [ ] `WEB_ORIGIN` coincide exactamente con URL real de frontend (`http://localhost:5173` por defecto)
- [ ] `VITE_API_BASE` (si se usa) apunta al backend correcto; si no, cae a `http://localhost:10000`
- [ ] Dependencias instaladas en `api/node_modules` y `web/node_modules`
- [ ] Scripts disponibles:
  - [ ] backend: `npm start`
  - [ ] frontend: `npm run dev`, `npm run build`, `npm run preview`
- [ ] Puertos libres:
  - [ ] `10000` (API)
  - [ ] `5173` (Vite)
- [ ] Conectividad DB OK (API arranca sin errores de `DATABASE_URL`)
- [ ] Ejecutado `POST /admin/bootstrap` y respuesta `ok:true`
- [ ] Tablas creadas: `users`, `families`, `family_members`, `events`
- [ ] Índice creado: `events_family_start_idx`
- [ ] Registro/Login funcionan y devuelven JWT
- [ ] Token se envía en header `Authorization` en llamadas protegidas
- [ ] Permisos por rol validados:
  - [ ] `owner/editor` puede crear eventos
  - [ ] `reader` no puede crear eventos
- [ ] Migraciones: confirmada ausencia de pipeline de migración formal
- [ ] Seeds: confirmada ausencia de seed automatizado

## 4) Notas técnicas relevantes
- `/admin/bootstrap` está abierto (sin auth) y es útil en dev, pero en producción es un riesgo.
- No hay tests automáticos definidos en scripts actuales.
- No hay reverse proxy/config de deploy versionada aquí.
