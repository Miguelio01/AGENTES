FROM python:3.11-slim

# Instalar uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copiar archivos de dependencias
COPY apps/adk-sales-agent/pyproject.toml apps/adk-sales-agent/uv.lock ./

# Instalar dependencias
RUN uv sync --frozen --no-cache

# Copiar código fuente
COPY apps/adk-sales-agent/main.py ./

EXPOSE 8000

# Usar el entorno virtual creado por uv
ENV PATH="/app/.venv/bin:$PATH"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
