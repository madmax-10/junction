# Prepares the Django API: installs dependencies, then on startup
# migrates SQLite, seeds demo data once, and serves on port 8000.
#
#   docker build -t car-owner-hub-backend ./backend
#   docker run --rm -p 8000:8000 --env-file backend/.env car-owner-hub-backend

FROM python:3.10-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x docker-entrypoint.sh \
    && mkdir -p media \
    && useradd --create-home --uid 1000 app \
    && chown -R app:app /app

USER app

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
