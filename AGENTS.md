# Project layout

- `frontend/` is the Next.js application. Run npm commands from this directory and read `frontend/AGENTS.md` before changing frontend code.
- The installed Next.js guides are in `frontend/node_modules/next/dist/docs/`.
- `backend/` is the FastAPI application. Run Python commands from this directory with `app.main:app` as the application module.
- `scripts/package-hosting.ps1` creates the combined source package from the repository root.
- Keep the frontend and backend as independently deployable applications. Frontend Vercel projects use Root Directory `frontend`; backend deployments use `backend`.
