from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "FireWatch Africa API"
    environment: str = "development"
    database_url: str
    firms_map_key: str = ""
    # Jeton exigé (en-tête X-Admin-Token) pour déclencher collecte et harmonisation.
    # Vide = endpoints protégés désactivés (refus 401).
    admin_token: str = ""
    # Assistant IA : sans clé, l'assistant répond en mode local (mêmes données, réponses calculées).
    anthropic_api_key: str = ""
    assistant_model: str = "claude-opus-5-5"
    # Gemini (API gratuite, prioritaire si la clé est présente) : https://aistudio.google.com/apikey
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    # Assistant vocal : modèle rapide en premier (latence à l'oral).
    voice_model: str = "gemini-3.5-flash-lite"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

