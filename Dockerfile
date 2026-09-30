# syntax=docker/dockerfile:1

# --- 1. Frontend -------------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. API + estáticos ------------------------------------------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DIS_STATIC_DIR=/app/static \
    DIS_CONFIG=/app/dis.yaml
WORKDIR /app

COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install . && rm -rf /root/.cache

COPY --from=frontend /build/dist ./static
COPY dis.yaml ./dis.yaml

EXPOSE 8088
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8088/api/health', timeout=3)"

# Un único proceso: sin workers extra (restricción de < 150 MB de RAM).
# Sin access log: el polling del frontend lo llenaría de ruido.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8088", "--no-access-log"]
