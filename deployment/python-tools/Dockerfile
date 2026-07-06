# enki-python-tools — contenedor para correr herramientas Python aisladas.
#
# Lo pringoso (dependencias Python) va aquí, no en el VPS. El ejecutor de Enki lo
# usa como imagen de aislamiento alternativa a node:20-slim: pon en la config del
# módulo ejecutor `contenedor_imagen: "enki-python-tools"` y `ejecutar` con
# `aislamiento: "contenedor"` correrá tus tools Python con la reja (OFF por
# defecto, audit, efímero --rm, sin privilegios).
#
# Construir:  docker build -t enki-python-tools deployment/python-tools/
# Probar:     docker run --rm enki-python-tools python -c "import requests, bs4; print('ok')"
#
# Mínimo a propósito (más fácil crecer que podar). Añade libs abajo según necesites
# (pandas, OCR, el SDK de fastCRW `crw`, etc.).

FROM python:3.12-slim

# Dependencias de sistema mínimas (curl para healthchecks/descargas puntuales).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Herramientas Python base para scraping/precio de ingredientes.
#   requests + beautifulsoup4 → leer/parsear fichas de producto (soysuper, etc.)
#   crw                       → SDK oficial de fastCRW (hablar con crw-server)
RUN pip install --no-cache-dir \
    requests \
    beautifulsoup4 \
    lxml \
    crw

# Usuario sin privilegios (defensa en profundidad; el ejecutor ya añade --cap-drop ALL).
RUN useradd --create-home --uid 10001 tools
USER tools
WORKDIR /work

# Sin ENTRYPOINT fijo: el ejecutor pasa `bash -lc "<cmd>"`. Deja un default útil.
CMD ["python3"]
