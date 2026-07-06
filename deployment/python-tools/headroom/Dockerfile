# enki-headroom — proxy de compresión de contexto Headroom (Python) en Docker.
#
# Headroom comprime todo lo que el agente LEE (tool outputs, JSON, código, historial)
# antes del LLM: 60–95% menos tokens facturados, reversible (CCR). Es infraestructura,
# no cantera. El código de enganche en Enki YA está (interruptor 'headroom' + override
# AIGATEWAY_API_BASE / HEADROOM_PROXY_URL en base-provider); esto es la FASE 0: el proxy
# corriendo. Python → va en Docker (la reja de "lo Python en contenedor").
#
# Construir:  docker build -t enki-headroom deployment/python-tools/headroom/
# Correr:     docker compose -f deployment/python-tools/docker-compose.headroom.yml up -d
# Verificar:  curl http://127.0.0.1:8787/livez   → {"status":"healthy"}
#
# El modelo de compresión (Kompress) se descarga en el primer arranque (HuggingFace);
# se cachea en el volumen headroom-cache (ver el compose). Verificado contra headroom 0.30.0.

FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# [all] = proxy + compresión ML (Kompress). Para solo-proxy sin ML: "headroom-ai[proxy]".
RUN pip install --no-cache-dir "headroom-ai[all]"

# Cache del modelo/estado (HuggingFace + memorias de Headroom) — montado como volumen.
ENV HF_HOME=/cache/hf
ENV HEADROOM_HOME=/cache/headroom

# Escucha en todas las interfaces del contenedor; el compose lo publica solo en localhost.
ENV HEADROOM_HOST=0.0.0.0
ENV HEADROOM_PORT=8787

RUN useradd --create-home --uid 10002 headroom && mkdir -p /cache && chown -R headroom /cache
USER headroom

EXPOSE 8787

# El upstream real (ANTHROPIC_TARGET_API_URL) y el modo se pasan por env desde el compose.
HEALTHCHECK --interval=15s --timeout=3s --start-period=60s --retries=5 \
  CMD curl -sf http://127.0.0.1:8787/livez || exit 1

CMD ["headroom", "proxy"]
