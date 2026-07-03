# Headroom — compresión de contexto delante del ai-gateway (propuesta)

> Estado: DISEÑO + enabling en código. `headroomlabs-ai/headroom` = middleware que comprime
> todo lo que el agente LEE (tool outputs, logs, RAG, ficheros, historial) antes del LLM,
> 60–95% menos tokens, reversible (cachea originales). NO es cantera (no hay SKILL.md): es
> infraestructura que ahorra dinero. Enki es caro en tokens por diseño (blueprints + contexto).

## Qué gana Enki
```
tráfico de Enki = JSON a mansalva (blueprints, contratos, payloads, RPCs) + código + prosa
Headroom        = SmartCrusher(JSON) + CodeCompressor(AST) + Kompress(prosa) → mapea 1:1
```
El valor sobre **deepseek** es PURO ahorro de tokens (menos facturados). El CacheAligner
(KV-cache del proveedor) NO ayuda en deepseek: su endpoint `/anthropic` **ignora cache_control**
(ver deepseek-anthropic-provider.js). Sobre Claude real sí daría las dos cosas.

## El punto de enchufe (proxy, zero-code)
```
ai-gateway (JS) ──HTTP──► headroom proxy :8787 ──► proveedor real (deepseek/anthropic)
```
- Enki habla **wire format Anthropic** (deepseek-anthropic = `POST /v1/messages` bajo
  `api.deepseek.com/anthropic`, extiende AnthropicProvider) → Headroom soporta Anthropic de
  primera clase. Un solo camino para Claude y deepseek-anthropic.
- El proxy **conserva el path** y solo cambia el host → reenvía comprimiendo. Un proxy por
  upstream (o routing por path si uno fronta ambos).

## Enabling YA en código (hecho)
El base-URL del provider era config (`module.json` api_base). Añadido un **override por env**
(base-provider `_apiBase()`): `AIGATEWAY_API_BASE__<NOMBRE>` gana a la config.
```
AIGATEWAY_API_BASE__DEEPSEEK_ANTHROPIC=http://localhost:8787   # → por el proxy
(sin la env)                                                   # → proveedor directo (reversible)
```
Por proveedor, default preservado, sin editar config versionada. Test: ai-gateway__apibase-override 4/4.

## La red de fidelidad que YA existe (lo elegante)
El miedo real: comprimir con pérdida algo del **contrato** (el blueprint es la ley, "no inventar").
Pero Enki ya tiene el guardián: los **frenos** (`<mod>.validar` de blueprint-agentico — carta.validar,
recetas.validar, escandallo.validar…). Si Headroom se come algo que rompe la salida, el freno la
**rechaza (422)** y lo sabemos en el acto. El freno del contrato = test de fidelidad AUTOMÁTICO.

## Fases graduadas (riesgo creciente, como el ejecutor)
```
FASE 0  PROVISIONING (VPS)   pip install "headroom-ai[all]" + modelo Kompress; proxy como
                             servicio systemd; verificar que proxya el wire Anthropic (deepseek+claude).
                             Coste real: el modelo corre local (CPU/mem) → quizá en su contenedor (docker).
FASE 1  SLICE ESTRECHO       AIGATEWAY_API_BASE__DEEPSEEK_ANTHROPIC → proxy, SOLO para una página
                             de bajo riesgo (un chat, no una op con freno). Medir (headroom dashboard).
FASE 2  BLUEPRINT CON FRENO  una op que DA FORMA con freno (carta.generar/escandallo.calcular) por el
                             proxy. El freno valida → si la compresión rompe algo, 422 = lo vemos.
                             Verificar-en-vivo: mismo resultado, fracción de tokens.
FASE 3  GENERAL + retrieve   ampliar; cablear headroom_retrieve como tool del bus para el LLM de página
                             (hoy empuña bus.*) → puede pedir el original si lo necesita.
```

## El guard (SIGUIENTE paso de código, no hecho aún)
Interruptor `headroom` (grupo sistema, OFF por defecto): `ai-gateway.onInterruptorCambiado`
conmuta el override en caliente (setear/limpiar el efectivo) sin reinicio. Best-effort: si el
proxy no responde en timeout → fallback al proveedor real (como todo nervio). Nace OFF: la
compresión es una decisión consciente, y el interruptor la revierte de un toque.

## Criterio de éxito (medible)
En un turno de blueprint real de Pacoo: **tokens antes/después** (headroom dashboard) +
**el freno sigue pasando** (fidelidad) + **el resultado es el mismo** (verificar-en-vivo).
Las tres → ahorro real sin romper nada.

## Honesto
- Provisioning del modelo (HuggingFace) = coste de CPU/mem en el VPS, a decidir (¿contenedor?).
- `headroom_retrieve` en modo proxy puro necesita el tool cableado al LLM; hasta entonces la
  compresión debe ser lo bastante lossless → por eso Fase 2 (freno) va antes de ampliar.
- No es cantera: se despliega y se mide, no se aloja.
