import multiprocessing
from collections.abc import AsyncIterator
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager
from threading import BoundedSemaphore

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.pdf import router
from app.config import frontend_origins
from app.core import ProcessingSettings
from app.middleware import BodyLimitMiddleware


def create_app(settings: ProcessingSettings | None = None) -> FastAPI:
    options = settings or ProcessingSettings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        with ProcessPoolExecutor(
            max_workers=1,
            mp_context=multiprocessing.get_context("spawn"),
            max_tasks_per_child=1,
        ) as processor:
            application.state.processor = processor
            application.state.processing_gate = BoundedSemaphore(1)
            application.state.settings = options
            yield

    application = FastAPI(
        title="Secure PDF Watermark", version="1.0.0", lifespan=lifespan
    )
    application.state.progress_files = {}
    application.add_middleware(
        BodyLimitMiddleware, max_bytes=options.max_file_bytes + 1024 * 1024
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=frontend_origins(),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        expose_headers=["Content-Disposition"],
    )
    application.include_router(router)

    @application.get("/", tags=["Health"])
    def root() -> dict[str, str]:
        return {
            "service": "Secure PDF Watermark",
            "status": "ok",
            "health": "/health",
            "docs": "/docs",
        }

    @application.get("/health", tags=["Health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return application


app = create_app()
