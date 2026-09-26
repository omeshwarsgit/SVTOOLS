import sys
from pathlib import Path

# Add root and backend directory to sys.path for module resolution
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from app.main import app

# Export app for Vercel Serverless Function runtime
export_app = app
