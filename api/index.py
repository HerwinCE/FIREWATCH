"""Point d'entrée Vercel : l'API FastAPI de backend/app, servie sous /api/*."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import app  # noqa: E402,F401
