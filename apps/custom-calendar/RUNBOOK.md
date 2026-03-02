# Runbook Operativo - Custom Calendar

## Deploy

### GitHub
```bash
git checkout main
git pull origin main
```

### Backend (Render Web Service)
- Root directory: `apps/custom-calendar/api`
- Build command: `npm ci && npm run migrate:up`
- Start command: `npm start`

Variables mínimas:
- `NODE_ENV=production`
- `DATABASE_URL=<render-postgres-url>`
- `JWT_SECRET=<secret>`
- `WEB_ORIGIN=<frontend-render-url>`

### Frontend (Render Static Site)
- Root directory: `apps/custom-calendar/web`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`

Variables mínimas:
- `VITE_API_BASE=<backend-render-url>`

## Migraciones

### Local
```bash
cd api
npm run migrate:up
```

### Producción (Render free)
- Se ejecutan en cada build del backend con:
```bash
npm run migrate:up
```

### Revertir última migración
```bash
cd api
npm run migrate:down
```

## Smoke test

Requisitos: `curl` y `jq`.

### Local (API en localhost)
```bash
npm run smoke
```

### Producción
```bash
API_BASE=https://<backend>.onrender.com npm run smoke
```

Variables opcionales:
- `SMOKE_EMAIL`
- `SMOKE_PASSWORD`
- `SMOKE_NAME`
- `SMOKE_FAMILY_NAME`
- `SMOKE_EVENT_TITLE`

## Rollback

### Opción 1: rollback de código (recomendada en Render)
1. En Render, backend/frontend -> `Manual Deploy`.
2. Seleccionar un commit anterior estable.
3. Deploy en ambos servicios.

### Opción 2: rollback de esquema (si aplica)
```bash
cd api
npm run migrate:down
```

## Incidencias frecuentes

- `Failed to fetch` en frontend:
  - Revisar `VITE_API_BASE` y `WEB_ORIGIN`.
  - Validar `GET /health` del backend.

- Error SSL en migraciones Render:
  - Verificar `DATABASE_URL` de Render DB.
  - No sobrescribir flags SSL manualmente en env.

- CORS bloqueado:
  - `WEB_ORIGIN` debe coincidir exactamente con la URL del frontend, sin slash final.
