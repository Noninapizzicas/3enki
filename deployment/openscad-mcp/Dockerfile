# OpenSCAD MCP Server — imagen para pizzepos.es
# Basado en quellant/openscad-mcp con transporte HTTP habilitado.
#
# Build:  docker compose build
# Run:    docker compose up -d

# ── Stage 1: build ──────────────────────────────────────────
FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc g++ make curl git \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /build
RUN git clone --depth 1 https://github.com/quellant/openscad-mcp.git . \
    && uv venv \
    && uv pip install --no-cache-dir build \
    && python -m build --wheel --outdir /dist

# ── Stage 2: runtime ───────────────────────────────────────
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        openscad xvfb curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

RUN useradd -m -u 1000 mcp \
    && mkdir -p /tmp/openscad-renders /tmp/openscad-cache /tmp/openscad-output /app/models \
    && chown -R mcp:mcp /tmp/openscad-* /app

WORKDIR /app
COPY --from=builder /dist/*.whl /tmp/
RUN uv pip install --system --no-cache-dir /tmp/*.whl && rm /tmp/*.whl

USER mcp

ENV OPENSCAD_PATH=/usr/bin/openscad \
    OPENSCAD_TEMP_DIR=/tmp/openscad-renders \
    OPENSCAD_CACHE_DIR=/tmp/openscad-cache \
    OPENSCAD_OUTPUT_DIR=/tmp/openscad-output \
    SERVER_TRANSPORT=http \
    MCP_SERVER_HOST=0.0.0.0 \
    MCP_SERVER_PORT=3000 \
    OPENSCAD_TIMEOUT=30 \
    OPENSCAD_MAX_THREADS=4 \
    MAX_RENDER_RESOLUTION=2048 \
    PYTHONUNBUFFERED=1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:3000/health || exit 1

VOLUME ["/tmp/openscad-renders", "/tmp/openscad-cache", "/tmp/openscad-output", "/app/models"]

ENTRYPOINT ["xvfb-run", "-a"]
CMD ["python", "-m", "openscad_mcp"]
