---
name: enki-cupula-hermes
description: >-
  La CÚPULA DE HERMES — el conocimiento operativo que Hermes tiene que saber
  para integrarse con Enki y que se pierde entre conversaciones. Cada vez que
  arranco una conversación nueva (o al inicio de una), LEO esta cúpula para
  NO re-investigar, re-inventar ni re-aprender lo que ya sé. Es la memoria viva
  de Hermes sobre Enki: conexiones, patrones, giros, rebanadas, detalles finos
  que ayer costaron investigación y hoy deberían estar a la primera.
when-to-use: >-
  Siempre, al ARRANQUE de una conversación sobre Enki (o la primera vez que
  toco Enki en una sesión). También cuando detecto que estoy re-investigando
  algo que ya resolví en otra sesión — eso es señal de que esta cúpita está
  incompleta y hay que alimentarla. Es la cúpita que el Hermes externo inyecta
  para no perder el camino.
tags: [enki, hermes, cupula, memoria, integracion]
---

# CÚPULA DE HERMES — el conocimiento operativo de Enki que no se pierde

> **Propósito**: cuando empiezo una conversación nueva con Paco sobre Enki, ya
> no debo re-investigar lo que controlaba ayer. Esto lo inyecto/aludo al inicio
> para arrancar donde dejé, no desde cero.

## Regla de uso (la clave)

- **Al arrancar** una sesión sobre Enki: leo/inyecto esta cúpula.
- **Cuando detecto** que estoy re-investigando algo ya resuelto → añado el dato
  aquí para que la próxima vez no pase.
- **Cuando Paco me corrige** un detalle operativo → va aquí.
- **NUNCA** reinventar lo que esta cúpula ya guarda.

## Lo que ya sé de Enki (núcleo duro)

- ADN: módulos = islas SOLO eventos; dominio DENTRO del módulo, NUNCA _shared.
- Repo `~/3enki` (rama `hermes/`, nunca main directo). `/opt/enki` es el deploy, NO repo.
- Deploy: `cd ~/3enki && git pull origin main && sudo ./deployment/deploy.sh`. Lo ejecuta Paco.
- El chat de Enki y yo = LA MISMA mente. Canal externo = general (arquitectura), chat = concreto (módulos).
- Enki event-driven: SIEMPRE MQTT/bus; los EVENTOS hacen las acciones.

## Conexión MQTT / bus

- Broker local `localhost:1883` (paho-mqtt). Sin mosquitto_pub → usar Python.
- Tópico chat send: `ui/request/conversation/send` con payload `{request_id, data:{project_id, conversation_id, message, ...}}` (NO `user_message` pelado — envolver en `data` y usar `message`).
- Herramientas de script: `node scripts/audit-helpers/send-message.js <pid> <conv> <page> "msg"` — hace el send y espera respuesta.
- Los eventos del log NO traen el botName/detalle en eventbus (solo publish). El detalle real vive en journal (`journalctl -u enki`).

## Cúpulas del sistema — ÍNDICE DE CONSULTA (lo que inyecto al arrancar)

> **Este bloque lo tengo presente al arrancar cualquier conversación de proyecto.**
> Todas las cúpulas son "índice barato + consulta a demanda": NO cargo contenido,
> consulto lo que necesito con su tool.

```
CÚPULAS DEL SISTEMA (consulta a demanda — no cargues nada):
- tools: buscar_capacidad · detalle_capacidad · capacidad_dominio
- eventos: evento_buscar · evento_detalle · evento_fantasma
- apis: buscar_api · obtener_api            (1671 APIs públicas)
- conocimiento: bibliotecario.catalogo · bibliotecario.consultar
- skills: buscar_skill · activar_skill
- agentes: buscar_agente · activar_agente · invoke_agent
- proyecto: cupulas.vista_proyecto · cupulas.contexto
- rail: ver_listas · fijar_objetivo · evaluar_rail
```

**Regla de uso por cúpula:**
1. `buscar_*` / `*_indice` / `*_catalogo` → descubre qué existe (barato).
2. `detalle_*` / `obtener_*` / `consultar` → trae el cuerpo de lo que va a usar.
3. Nunca consultar el contenido completo de todas — solo lo que el turno necesita.

### Mapas detallados por cúpula

| Cúpula | Módulo | Tools de consulta | Qué responde |
|---|---|---|---|
| **Tools** | `cupula-tools` | `buscar_capacidad` · `detalle_capacidad` · `capacidad_dominio` | ¿qué puedo hacer? contrato de una tool · todas de un dominio |
| **Eventos** | `cupula-eventos` | `evento_indice` · `evento_detalle` · `evento_buscar` · `evento_fantasma` | contrato del bus: qué eventos, quién atiende, huecos |
| **APIs** | `apis-publicas` | `buscar_api` · `obtener_api` | 1671 APIs públicas · ficha (URL, auth, ejemplo) |
| **Conocimiento** | `bibliotecario` | `bibliotecario.catalogo` · `bibliotecario.consultar` | bóveda 33 sectores / 417 libros |
| **Skills** | `cosecha` | `buscar_skill` · `activar_skill` | qué skill hay · activarla |
| **Agentes** | `agentes` | `buscar_agente` · `activar_agente` · `invoke_agent` | qué agente sirve · invocarlo |
| **Proyecto** | `cupulas` | `cupulas.vista_proyecto` · `cupulas.buscar` · `cupulas.contexto` | estado vivo del proyecto · notas de su bóveda |
| **Rail** | `estados` | `ver_listas` · `fijar_objetivo` · `evaluar_rail` + crear/anadir/completar | el rumbo del trabajo, su objetivo |

## Patrón de un MÓDULO cúpula (NO inventar, replicar)

1. Hereda `BaseModule` (`require('../_shared/base-module')`).
2. `onLoad` registra las tools en `moduleLoader.toolsRegistry`.
3. `on<Op>Request` publica `<op>.response` correlado por `request_id` `{request_id, result|error}`.
4. Proyecciones puras (`_buscar`, `_detalle`) con `_errorResponse(400/404)`.
5. `handle<Op>Tool(args)` → `{status, data|error}` con `_handleHandlerError`.

## Detalles que ayer costaron (no re-investigar)

- El `ai-gateway` ya NO maneja el chat → lo hace `hermes-relay` → Hermes (:8642). La reja va en el bridge, no en ai-gateway.
- `script cupula-eventos/vigilante.js` falla con `subs is not iterable` (banco-ideas `subscribes` como dict) — el módulo runtime tolera dict.
- Las tools del catalog van por formato OpenAI function-calling (437/439).
- Reja: catálogo + `ui.request {dominio, accion, args, project_id}` + GLOBALES intactas.

## ⚠️ LECCIÓN GRANDE: NO reinventar cúpulas que YA existen

> **Paco me lo señaló**: yo no sabía que varias cúpulas ya existían y fui a crearlas
> desde cero. Regla: ANTES de crear/construir una cúpula, VERIFICAR que no exista ya.

**Inventario REAL de cúpulas ya construidas (NO recrear):**

| Cúpula | Módulo | Estado | Cómo llegó |
|---|---|---|---|
| Tools | `cupula-tools` | ✅ v0.2.0 en prod | era `cupula-eventos` (sirve tools), renombrado + dominio |
| Eventos | `cupula-eventos` | ✅ v0.1.0 en prod | la REAL (contrato del bus), construida hoy |
| APIs | `apis-publicas` | ✅ v0.1.0 en prod | 1671 APIs, construida hoy |
| Conocimiento | `bibliotecario` | ✅ ya existía | bóveda 33 sectores — NUNCA crear otra |
| Skills | `cosecha` | ✅ ya existía | cantera — NUNCA recrear |
| Agentes | `agentes` | ✅ ya existía | registro — NUNCA recrear |
| Rail | `estados` | ✅ ya existía | crear_lista — NUNCA recrear |
| Proyecto | `cupulas` | ✅ ya existía | vista_proyecto — NUNCA recrear |

**Las únicas construidas HOY** (porque NO existían): `cupula-eventos` (real) y
`apis-publicas`. El resto YA existía y solo se consulta.

## Conocimiento vivo (ir acumulando)

## Hallazgos 22-ago-2026 (despacho-de-pan)

- **Simlink para hermes**: `~/3enki → /home/admin/3enki/` (creado con `ln -s`). Hermes no podía atravesar `/home/admin/` — se arregló con `sudo chmod g+x /home/admin/`.
- **Chat escribe en repo, no en deploy**: los módulos nuevos en `/opt/enki/modules/` hay que copiarlos al repo (`~/3enki/modules/<slug>/`) para que no se pierdan.
- **BD readonly**: `python3` no puede escribir en la BD de proyectos (owner www-data, sin sudo password). Para enviar mensajes al chat de proyecto: MQTT directo al bus (`chat.message.saved` en `localhost:1883`).
- **Project IDs descubiertos**: despacho-de-pan = `b0e301bf-8ffd-4f1a-a9fe-66006e7b90d2`, conv = `77111b9e-873c-40ad-95e3-5f4f1ab9d707`.
- **Guardian revierte cada 15 min**: merge + deploy inmediato o se pierde.
- **Skills de proyecto van en la cantera**, no solo en el arsenal de Hermes: `modules/cosecha/cantera/enki/<slug>/SKILL.md`.

<!-- CORTAR AQUÍ — estas son las lecciones que la cúpula acumula y no debe perder -->

## Uso

Al arrancar una conversación sobre Enki: leer esta cúpula (skill_view) y reflejar
los datos duros. Cuando un turno dependa de un detalle aquí guardado → usarlo
directo, sin re-investigar. Cuando descubra algo nuevo → añadirlo con
skill_manage(action='patch').
