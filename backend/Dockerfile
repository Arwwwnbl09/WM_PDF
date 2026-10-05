FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000 \
    TMPDIR=/app/tmp

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-liberation2 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 app \
    && mkdir /app/tmp \
    && chown app:app /app/tmp

# Install runtime packages only; the shared lock also contains development tools.
COPY requirements.txt requirements.lock.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt -c requirements.lock.txt

COPY app ./app

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + (os.getenv('PORT') or '8000') + '/health', timeout=3).close()"]

# Jobs and progress live in this process; deploy one worker and one instance.
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\" --workers 1"]
