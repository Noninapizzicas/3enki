# Mapa del mundo chat de Enki (auditoría 2026-07-31)

Resultado de la auditoría "reloj suizo" del subsistema conversación. Estado tras
las pasadas 1-2 (PR #70, #73): POCs fuera del runtime, config sincronizado.

## Runtime activo — modules/conversacion/ (8 módulos)
```
ai-gateway                  v2.36  — ejecutor LLM (chat/generic/embedding)
ai-agent-framework          v2.2   — agentes + invoke_agent (Paco los usa: mantener)
chat-io                     v2.2   — entrada/salida + persistencia SQLite
prompt-builder              v2.0   — arma el system prompt (base.prompt.json)
agent-observer              v2.0   — tarjetas de agente en el chat
memory-conversation-summary v2.1   — resumen narrativo por tramos
memory-user-profile         v2.2   — hechos del usuario
memory-rag                  v2.1   — memoria semántica (embeddings)
```
Nervios en enabled: estados (rail vivo), propiocepcion, cupula-eventos, conserje,
lentes-diseno, prompt-manager.

## Desactivados (modules.disabled)
```
ai-gateway-poc — POC v2.0 deepseek-only; suscribía llm.complete.request en paralelo
                 con el real (riesgo de doble respuesta)
cocina-poc     — duplicado de pizzepos/cocina v3.4
notas-poc      — POC huérfano (name real 'notas')
bienvenida-tienda — decisión del dueño: no se usa (pasada 4a)
dashboard, metricas, security-p2p, staff-manager — legacy/opt-in
```

## Fantasmas eliminados de config.json (pasada 1)
prompt-engine · agent-manager · chat-ai-bridge · chat-session · conversacion ·
pizzepos · carta-impresion · conversacion/context-manager · conversation-manager
— nombres de arquitectura/conversacion-ref/ (diseño v1) colados en runtime.

## conversacion-ref v1 → runtime v2 (correspondencia)
```
chat-session       → chat-io          (persistencia + FIFO)
prompt-engine      → prompt-builder   (system prompt)
ai-gateway         → ai-gateway v2.36
agent-manager      → ai-agent-framework
chat-ai-bridge     → absorbido por ai-gateway + nervios
chat-mqtt          → absorbido por ui_handlers MQTT del core
context-manager    → absorbido por prompt-builder + memorias
conversation-router→ absorbido por chat-io + ai-gateway foco
agent-bridge       → absorbido por agent-observer
```
Eventos v1 obsoletos (no existen en vivo): chat.send.request, session.create.request,
chat.message.enriched.

## Síntoma del LLM que motivó la auditoría
En nonina y Regalos: tareas complejas (POS/carta) → respuestas monstruosas
(60K-150K tokens, 13-15 iteraciones, 85s-17min), tools fallando en cadena
(fs.edit JSON-only → code.orquestar → shell.exec), regeneraba archivos enteros.
Causas: (1) fs.edit solo JSON — arreglado con ops de texto (PR #65);
(2) sin mandatos de ejecución en el prompt real — arreglado en base.prompt.json (PR #68);
(3) ai-gateway-poc duplicado en runtime — apagado (PR #70).

## fs.edit universal (PR #65)
Detecta formato: JSON → JSON Patch RFC 6902 (intacto); texto → ops:
replace (1ª), replace_all, insert_before, insert_after, remove. search/value strings
exactos (no regex). Snapshot + atomic write en ambos modos. Tool description en
modules/filesystem/module.json documenta ambos modos.

## Mandatos de ejecución (base.prompt.json, PR #68)
Sección `mandatos_de_ejecucion` con formato haz+forma+ejemplo:
plan_antes_de_ejecutar · tool_falla_preguntar · no_regenerar_archivos_enteros ·
un_paso_por_respuesta. Regla principal ajustada: "ACTÚA, NO PREGUNTES — salvo tareas
de 3+ operaciones (planifica primero)". Referencian la cúpula de estados (rail):
crear_lista + fijar_objetivo + completar_paso ya existen e inyectan cada turno.
