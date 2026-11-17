# Build and deployment

## Local
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (hot reload)
npm test           # engine tests
npm run build      # type-check + production build into frontend/dist
node serve.mjs     # serve dist/ on http://localhost:5173
```
Windows: double-click `START_ROBOVERSE.bat` in the project root.

## GitHub
Repository: https://github.com/aya430/roboverse-robotics-laboratory
`.github/workflows/ci.yml` type-checks, tests and builds on every push and uploads `dist` as an artifact.

## GitHub Pages (live site: https://aya430.github.io/roboverse-robotics-laboratory/)
`.github/workflows/deploy.yml` builds `frontend/` with `VITE_BASE=/<repository-name>/` (so all JS, CSS,
the simulation Web Worker and the OpenCascade WASM resolve under the project sub-path), uploads
`frontend/dist` and publishes it with `actions/deploy-pages`. In *Settings → Pages* the source is
**GitHub Actions**. If the repository is renamed, the base path follows automatically.

## Cloudflare Pages (static front end)
* Framework preset: *None* · Root directory: `frontend` · Build command: `npm run build` ·
  Output directory: `dist` · Environment: `NODE_VERSION=22`.
* Without `VITE_BASE` the build uses relative asset paths (`base: './'`), so it works from any folder or sub-path.

## Simulation / ROS 2 backend (Phase 9, planned)
Heavy physics (MuJoCo/Gazebo), ROS 2, CAD conversion and GPU workloads must not run in Cloudflare Pages or
browser JavaScript. Run them as Docker services on a compute host (university server or cloud VM) behind
a FastAPI gateway, and connect the browser over HTTPS/WSS. The database schema is in `backend/schema.sql`.
