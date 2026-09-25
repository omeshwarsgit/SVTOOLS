import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.models.schemas import PropertyMaster
from app.services.seeder import seed_master_registry
from app.api.routes import router as api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure tables exist
    Base.metadata.create_all(bind=engine)
    
    # Auto-seed if empty
    db = SessionLocal()
    try:
        count = db.query(PropertyMaster).count()
        if count == 0 and os.path.exists(settings.MASTER_REGISTRY_PATH):
            print(f"Master registry is empty. Auto-seeding from {settings.MASTER_REGISTRY_PATH}...")
            seed_master_registry(db=db)
            print("Auto-seeding complete.")
    except Exception as e:
        print(f"Warning: Auto-seed on startup encountered: {e}")
    finally:
        db.close()

    yield
    # Shutdown logic if any


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="StayVista PMS & OTA Automated Reconciliation Engine, Operations Portal, and LLM Handoff Pipeline",
    lifespan=lifespan,
)

# CORS middleware for React Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Archive-Path"],
)

# Mount API routes
app.include_router(api_router, prefix=settings.API_V1_STR)

# Serve built frontend in production if dist exists
dist_dir = settings.BASE_DIR / "frontend" / "dist"
if dist_dir.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")
else:
    @app.get("/")
    def root():
        return {
            "service": settings.PROJECT_NAME,
            "version": "1.0.0",
            "docs": "/docs",
            "api_v1": settings.API_V1_STR,
        }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
