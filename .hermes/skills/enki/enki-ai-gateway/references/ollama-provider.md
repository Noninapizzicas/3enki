# Caso Ollama en Enki (estado verificado 18-ago-2026)

## Estado encontrado

- `modules/conversacion/ai-gateway/providers/ollama-provider.js` **ya existe** y está
  escrito para Ollama **LOCAL**: `configure()` hace `GET /api/tags`, `chatCompletion()`
  hace `POST /api/chat` con `{model, messages, stream:false, options:{temperature,
  top_p, num_predict}}`, y se pone `this.apiKey = 'local'` (no resuelve credencial).
- La config de PROD (`/opt/enki/.../module.json`, idéntica al repo) apunta a **cloud**:
  ```json
  "ollama": { "enabled": true, "priority": 9, "api_base": "https://ollama.com",
    "headroom": true, "default_model": "deepseek-v4-flash",
    "models": ["llama3.1","llama3.3","qwen2.5","mistral"],
    "_nota": "Ollama Cloud — fallback (más caro que deepseek-flash). API key en .env: OLLAMA_API_KEY" }
  ```
- `OLLAMA_API_KEY` presente en `/opt/enki/data/.env` línea 25 (solo sirve para cloud;
  el provider local la IGNORA).
- `default_model: "deepseek-v4-flash"` — modelo que NO existe en Ollama (ni local ni
  cloud). Si se selecciona Ollama sin modelo, falla.
- **Ollama NO está instalado en el VPS** (sin binario, sin unit systemd, puerto 11434
  cerrado; `curl localhost:11434/api/tags` no responde).

## Incongruencias (las 3 que hay que arreglar)

1. Código = local (`/api/chat`, `/api/tags`, sin key) vs config = cloud
   (`https://ollama.com`). El código pegaría a `https://ollama.com/api/chat` — ruta
   que no existe (la cloud es OpenAI-compat bajo `/v1/`).
2. `default_model` inexistente.
3. Ollama no corre → `isAvailable()` false → elegirlo da "Provider 'ollama' sin
   credencial" / "no disponible".

## Recursos del VPS (para elegir modelos)

- RAM: 3.8 GiB total, ~950 MiB libres con Enki encima (usa ~2.8 GiB). 4 cores.
- Disco: 37 GiB libres.
- Modelos 8B (llama3.1, llama3.3, qwen2.5, mistral de la config) **NO caben**
  (~6 GB RAM cada uno). Viables:

| Modelo | Descarga | RAM aprox |
|---|---|---|
| llama3.2:3b | 2.0 GB | ~2.5 GB (mejor calidad que cabe) |
| qwen2.5:3b | 1.9 GB | ~2.5 GB |
| gemma2:2b | 1.6 GB | ~2 GB |
| llama3.2:1b | 1.3 GB | ~1.3 GB (el más seguro) |

## Dónde tocar para que la selección manual funcione

- `module.json`: `api_base` → `http://localhost:11434` (o env
  `AIGATEWAY_API_BASE__OLLAMA`), `default_model` → modelo real bajado, `models[]` →
  los bajados.
- Frontend (espejos hardcodeados con modelos viejos `llama2/codellama/mistral/mixtral`):
  - `frontend/src/lib/modules/conversations/ConfigTab.svelte` línea ~212 (entrada
    `{ value: 'ollama', label: 'Ollama (local) 🦙', models: [...] }`)
  - `frontend/src/lib/modules/provider/ProviderPanel.svelte` línea ~27
- Ideal: sacar los modelos EN VIVO de `GET /api/tags` para que el desplegable siempre
  coincida con lo descargado (hoy son arrays estáticos en 2 archivos + config = 3
  sitios que derivan).

## Instalación (NO ejecutar sin OK del dueño)

`curl -fsSL https://ollama.com/install.sh | sudo sh` (crea unit systemd `ollama`),
luego `ollama pull <modelo>`. Bloqueado por Paco al intentarlo — proponer y esperar.
