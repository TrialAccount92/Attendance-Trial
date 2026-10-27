"""AttendPulse API server."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import init_schema, transaction
from .routes import academic, attendance, auth, management, state
from .seed import is_empty, seed_database


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_schema()
    with transaction() as conn:
        if is_empty(conn):
            seed_database(conn)
            print("[AttendPulse] New database created with demo data.")
    yield


app = FastAPI(title="AttendPulse API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    # One readable sentence for the UI instead of pydantic's error list.
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
    msg = str(first.get("msg", "Invalid input")).removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"detail": f"{field}: {msg}"})


@app.get("/api/health")
def health():
    return {"status": "ONLINE", "service": "AttendPulse API", "version": app.version}


for module in (auth, state, attendance, management, academic):
    app.include_router(module.router)


# Serve the built frontend (npm run build) from the same origin when it exists.
_dist = settings.frontend_dist
if (_dist / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        target = (_dist / path).resolve()
        if path and target.is_file() and _dist.resolve() in target.parents:
            return FileResponse(target)
        return FileResponse(_dist / "index.html")
