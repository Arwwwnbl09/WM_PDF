"""Deployment settings; rendering defaults remain centralized in app.core."""

import os
from urllib.parse import urlsplit

DEFAULT_FRONTEND_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"


def frontend_origins() -> list[str]:
    origins = []
    for value in os.getenv("FRONTEND_ORIGINS", DEFAULT_FRONTEND_ORIGINS).split(","):
        origin = value.strip().rstrip("/")
        if not origin:
            continue
        try:
            parsed = urlsplit(origin)
            valid = (
                parsed.scheme in ("http", "https")
                and bool(parsed.hostname)
                and parsed.port != 0
                and not parsed.username
                and not parsed.password
                and not parsed.path
                and not parsed.query
                and not parsed.fragment
                and "*" not in origin
                and "\\" not in origin
                and not any(
                    character.isspace() or ord(character) < 32 for character in origin
                )
            )
        except ValueError:
            valid = False
        if not valid:
            raise ValueError(
                "FRONTEND_ORIGINS harus berisi origin HTTP(S) eksplisit tanpa path, credentials, atau wildcard."
            )
        if origin not in origins:
            origins.append(origin)
    if not origins:
        raise ValueError("FRONTEND_ORIGINS tidak boleh kosong.")
    return origins
