---
name: enki-ai-gateway
description: >-
  Cómo funciona el subsistema de providers LLM de Enki (módulo
  modules/conversacion/ai-gateway) y cómo añadir o ajustar un provider con sus
  modelos (Ollama, DeepSeek, etc.). Cubre las 3 capas de organización (clase
  provider → config.providers en module.json → credencial en credential-manager),
  dónde se declaran los modelos (module.json + espejos hardcodeados en el frontend
  ConfigTab.svelte y ProviderPanel.svelte — PITFALL de deriva), la selección manual
  por conversación vs fallback por prioridad, y el override por env
  AIGATEWAY_API_BASE__<NOMBRE>. Úsala al dar de alta un provider/modelo nuevo, al
  depurar "provider sin credencial" / "no disponible", o al entender por qué el
  chat usa un provider u otro.
when-to-use: >-
  Añadir un provider LLM (p.ej. Ollama) con sus modelos. Un provider elegido en
  una conversación falla con "sin credencial" / "no disponible". Entender por qué
  el gateway usa un provider u otro (selección explícita vs prioridad). Cambiar el
  api_base de un provider sin tocar module.json.
source: hermes
tags: [enki, ai-gateway, providers, llm, modelos, ollama, configuracion]
---

# ai-gateway: providers y modelos LLM en Enki

## Mapa de las 3 capas (verificado 18-ago-2026)

1. **Clase del provider** → `modules/conversacion/ai-gateway/providers/<nombre>-provider.js`
   - Extiende `BaseProvider`; implementa `configure()` (disponibilidad) +
     `chatCompletion()` + `chatCompletionStream()`.
   - El provider resuelve su base con `this._apiBase()` y su key con
     `this._resolveCredential()` (evento `credential.resolve.request` → credential-manager).
   - Si el provider no necesita key (local), se pone `this.apiKey = 'local'` y se
     comprueba disponibilidad con un request real (p.ej. Ollama → `GET /api/tags`).

2. **Registro + modelos** → `modules/conversacion/ai-gateway/module.json` → `config.providers.<nombre>`
   - Campos: `enabled`, `priority` (orden de fallback, menor = primero), `api_base`,
     `default_model`, `models[]`.
   - La clase se engancha en `index.js` en el mapa de providers (~línea 310).

3. **Credencial** → credential-manager (store + `.env`) como `<PROVIDER>_API_KEY`
   - SOLO persiste si el nombre termina en `_API_KEY` (o contiene `_API_KEY_`) — si
     no, el reescrito `credential-manager.env.saved` la borra. Ver skill
     `enki-credenciales-oauth`.

## Selección: manual vs automática (PITFALL: no confundirlas)

`_selectProvider(requestedName, projectId)` (~línea 336 de index.js):
- **Nombre explícito** (viene de la conversación) → usa ESE provider, y LANZA error
  si no está disponible o sin credencial. **NO hay fallback** — si el usuario eligió,
  se respeta y se falla en seco.
- `'auto'` / sin nombre → fallback por `priority` (menor número primero) entre los
  disponibles.

**Flujo de la selección manual del dueño** (funciona, verificado):
`ConfigTab.svelte` (conversación crear/editar) y `ProviderPanel.svelte` (workspace)
→ guardan provider+model en la conversación / workspace store (`workspace.ts`
`selectProvider`) → `chat.ts` los manda en `settings.provider`/`settings.model` →
gateway línea ~2648: `providerName ?? settings?.provider` → selección explícita.

**PITFALL de deriva**: los desplegables del frontend están **hardcodeados** en
`ConfigTab.svelte` (`providerOptions`, ~línea 204) y `ProviderPanel.svelte` (array
`providers`, ~línea 20) y solo "espejan" module.json — se desincronizan. Al tocar
modelos de un provider hay que actualizar los 3 sitios: module.json + ConfigTab +
ProviderPanel. El `default_model` de la config también puede quedar apuntando a un
modelo inexistente (caso real: `deepseek-v4-flash` como default de ollama).

## Override por env (sin tocar module.json)

`AIGATEWAY_API_BASE__<NOMBRE>` — guiones/no-alfa → `_`, mayúsculas (p.ej.
`deepseek-anthropic` → `AIGATEWAY_API_BASE__DEEPSEEK_ANTHROPIC`). Cambia el
`api_base` en caliente (base-provider.js ~líneas 130-145). Útil para apuntar a un
servidor local sin esperar deploy, o al revés.

## Verificación

- Disponibilidad del servicio en el VPS: `curl -s localhost:<puerto>` (Ollama →
  `GET /api/tags`; DeepSeek local → puerto 8787).
- Elegir el provider en una conversación (ConfigTab) y enviar un mensaje es el
  circuito canónico de prueba — la selección explícita falla en seco si el provider
  no está sano, así que el error es diagnóstico.
- Antes de desplegar cambios de config: repo en rama `hermes/`, PR, y el deploy lo
  ejecuta PACO.

## Interacción con el dueño (lecciones pagadas 18-ago-2026)

- **Preguntar por DÓNDE corre el servicio / qué quiere, en lenguaje llano**, no por
  categorías de arquitectura: "¿local o cloud?" le confundió (respondió "??");
  "¿dónde tienes Ollama corriendo?" obtuvo respuesta al momento. Alternativas en
  claras: opciones con DÓNDE (VPS / otro equipo / no instalado), no términos de capas.
- **Instalar software en el VPS: PRO-PONER, no ejecutar.** `curl ... | sudo sh`
  para instalar Ollama fue BLOQUEADO por Paco — los cambios de sistema los hace él
  (igual que el deploy). Presentar el plan y esperar su OK.
- Ver `references/ollama-provider.md` para el caso Ollama completo (estado, modelos
  viables según RAM del VPS, incongruencias encontradas).
- Ver `references/coste-tokens-rail-doble-inyeccion.md` para el coste de tokens de
  inyectar el rail (nervio `_composeRailSection`) y el diseño de doble inyección
  (arranque gordo + turno diario en símbolos) que el dueño decidió el 19-ago-2026.
