# Project layout

- `frontend/` is the Next.js application. Run npm commands from this directory and read `frontend/AGENTS.md` before changing frontend code.
- The installed Next.js guides are in `frontend/node_modules/next/dist/docs/`.
- `backend/` is the FastAPI application. Run Python commands from this directory with `app.main:app` as the application module.
- `scripts/package-hosting.ps1` creates the combined source package from the repository root.
- Keep both application roots. The repo-root `vercel.json` deploys them together with Vercel Services and Root Directory `./`. Standalone frontend projects use Root Directory `frontend`; standalone backend deployments use `backend`.
