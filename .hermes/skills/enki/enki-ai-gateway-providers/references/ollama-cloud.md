# Ollama Cloud — contrato y fix (verificado 18-ago-2026)

## Contrato (docs oficiales ese día)

- La nube usa la **MISMA API nativa que local**: base `https://ollama.com/api`
  (NO `/v1` OpenAI-compat — ese es solo local: `http://localhost:11434/v1`).
  Endpoints `/api/chat`, `/api/tags`, `/api/generate` idénticos.
- Auth: `Authorization: Bearer <OLLAMA_API_KEY>` (key de ollama.com, formato
  `xxxx._xxxx`). Verificado: `GET /api/tags` autenticado devuelve el catálogo
  real de la cuenta.
- Modelos de razonamiento: el stream emite `message.thinking` primero y
  `message.content` después. Con `num_predict` pequeño (50) el content llega
  vacío y parece roto — probar con presupuesto real (≥500).

## Estado roto encontrado (por qué "existía pero no funcionaba")

- Código `ollama-provider.js` escrito para LOCAL (`apiKey='local'`, sin auth)
  pero `module.json` apuntaba a `https://ollama.com` (cloud).
- `models[]` = llama3.1/3.3/qwen2.5/mistral (no están en el catálogo cloud);
  `default_model` = `deepseek-v4-flash` (inexistente).
- Frontend (ConfigTab + ProviderPanel) con llama2/codellama/mistral/mixtral.
- `OLLAMA_API_KEY` ya estaba en el `.env` (57 chars) — la vía cloud era la prevista.

## Fix aplicado (rama hermes/ollama-cloud → PR a main)

- Provider: `refreshApiKey()` (resolver eventos → env → fallback 'local'),
  `_authHeaders()` Bearer, `_coerceModel()` (modelo viejo → default_model).
  Sin reescribir el protocolo: `/api/chat` es el mismo en local y cloud.
- Config: `default_model: deepseek-v4-flash:preview`, `models[]` = catálogo
  real curado (9 de 19): deepseek-v4-flash:preview, deepseek-v4-pro:preview,
  glm-5.2, kimi-k2.6, gpt-oss:20b, gemma4:31b, nemotron-3-super, minimax-m2.7,
  qwen3.5:397b.
- Frontend: `Ollama (Cloud)` 🦙 en ambos desplegables con los 9 modelos.
- El dueño selecciona por conversación (ConfigTab); `priority: 9` = solo
  fallback automático si no elige nada.

## Test determinista usado (patrón reutilizable)

1. Leer la key del `.env` de prod (`grep -oP '^OLLAMA_API_KEY=\K.*' /opt/enki/data/.env`).
2. Instanciar `OllamaProvider` con la config real (api_base, default_model, models).
3. `configure()` → esperar `available:true, mode:cloud`.
4. `chatCompletion([{role:'user',content:'Responde solo: OK'}], {max_tokens:50})`
   → content no vacío.
5. `chatCompletionStream` con `max_tokens:500` (por el thinking) → content llega.
6. `_coerceModel({model:'llama2'})` → cae al `default_model`.

Scripts de ejemplo en `/tmp/test-ollama-provider.js` y `/tmp/test-ollama-stream.js`
(descartables, se regeneran en 2 min).

## Despliegue y verificación final (mismo día)

- PR #290 merged (squash, `0b4f9d6a`). El deploy lo ejecutó el dueño:
  `sudo ./deployment/vps-setup.sh enki-ai.online` (el agente NO puede — sudo pide
  password; intento en background = "a terminal is required to read the password").
- Tras el deploy: module.json + provider en /opt/enki 23:13, build frontend 23:15,
  ambos servicios (enki + enki-frontend) reiniciados 23:16. `grep -rl "Ollama (Cloud)"`
  en el build → chunks nuevos presentes.
- **Síntoma final**: el dueño reportó "no aparecen ollama cloud ni sus providers".
  Código verificado vivo en disco, build y servicios → era **caché del navegador**
  (recarga forzada). Lección: diagnosticar en orden disco → build → tiempos de
  arranque → puerto (3001) antes de tocar nada.
- Catálogo completo de la cuenta (19 modelos, `GET /api/tags` autenticado):
  nemotron-3-super, glm-5.2, nemotron-3-nano:30b, minimax-m2.7, nemotron-3-ultra,
  glm-5.1, kimi-k2.6, deepseek-v4-pro:preview, gpt-oss:20b, gemma4:31b, kimi-k3,
  deepseek-v4-flash:preview, deepseek-v4-flash:0731, gpt-oss:120b,
  mistral-large-3:675b, kimi-k2.7-code, deepseek-v4-pro:0813, minimax-m3, qwen3.5:397b.

