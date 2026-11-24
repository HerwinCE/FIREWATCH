import os
from collections.abc import AsyncGenerator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.settings import settings

# Fonctions serverless (Vercel) : une connexion par requête, pas de pool partagé entre instances.
SERVERLESS = bool(os.environ.get("VERCEL"))


def async_url(url: str) -> tuple[str, dict]:
    """URL SQLAlchemy/asyncpg + options de connexion, quelle que soit la forme fournie
    (postgres://, postgresql://, postgresql+asyncpg://, paramètres sslmode / channel_binding de Neon)."""
    parts = urlsplit(url)
    scheme = "postgresql+asyncpg"
    query = dict(parse_qsl(parts.query))
    ssl = query.pop("sslmode", None) or query.pop("ssl", None)
    query.pop("channel_binding", None)
    connect_args: dict = {"statement_cache_size": 0} if SERVERLESS else {}
    if ssl and ssl != "disable":
        connect_args["ssl"] = "require"
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), "")), connect_args


_url, _connect_args = async_url(settings.database_url)
engine = create_async_engine(
    _url,
    connect_args=_connect_args,
    echo=False,
    **({"poolclass": NullPool} if SERVERLESS else {"pool_pre_ping": True, "pool_size": 5, "max_overflow": 5}),
)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def check_database() -> bool:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
    return True
