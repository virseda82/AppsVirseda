# Deploy en Render (GitHub)

## 1) Subir a GitHub
Desde la raíz del repo monorepo (`AppsVirseda`):

```bash
git add apps/custom-calendar
git commit -m "feat(custom-calendar): local dev orchestrator, migration pipeline and render-ready setup"
git push origin codex-setup
```

Si quieres deploy desde `main`, haz PR/merge y despliega esa rama.

## 2) Crear servicio Backend (Render Web Service)
- New + -> Web Service
- Repo: este repositorio GitHub
- Branch: la rama desplegable (por ejemplo `codex-setup` o `main`)
- Root Directory: `apps/custom-calendar/api`
- Runtime: Node
- Build Command: `npm ci`
- Start Command: `npm start`

### Variables backend
- `NODE_ENV=production`
- `PORT=10000` (Render lo inyecta, pero no molesta definirlo)
- `DATABASE_URL=<tu_postgres_url>`
- `JWT_SECRET=<secreto_largo>`
- `WEB_ORIGIN=<url_frontend_render>`

## 3) Aplicar migraciones en backend
Tras primer deploy del backend, abrir Shell en Render y ejecutar:

```bash
npm run migrate:up
```

Esto crea tablas e índice con `node-pg-migrate`.

## 4) Crear servicio Frontend (Render Static Site)
- New + -> Static Site
- Repo: este repositorio
- Branch: misma rama
- Root Directory: `apps/custom-calendar/web`
- Build Command: `npm ci && npm run build`
- Publish Directory: `dist`

### Variable frontend
- `VITE_API_BASE=<url_backend_render>`

## 5) CORS final
En backend, `WEB_ORIGIN` debe ser exactamente la URL del frontend de Render.

## 6) Health checks
- Backend: `GET <url_backend>/health`
- Frontend: abre la URL del static site
- Flujo: register -> login -> crear familia -> crear evento

## Notas
- `/admin/bootstrap` queda bloqueado en `NODE_ENV=production`.
- En producción usa migraciones (`npm run migrate:up`), no bootstrap.
