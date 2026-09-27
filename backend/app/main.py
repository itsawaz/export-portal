import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, engine
from .routers import admin, auth, invoices, orders, payments, public, quotations, rfqs, shipments

logging.basicConfig(level=logging.INFO)



@asynccontextmanager
async def lifespan(_app: FastAPI):
    # For production, manage schema changes with Alembic instead of create_all.
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title=f"{settings.company_name} — Export Portal API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth, public, rfqs, quotations, orders, shipments, invoices, payments, admin):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    return {"ok": True}


# Serve the built React app (frontend/dist) from the same server in production.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "Not found")
        f = (DIST / full_path).resolve()
        if full_path and f.is_file() and DIST.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
