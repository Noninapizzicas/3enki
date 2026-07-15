---
id: cupulas/eventos
dominio: cupulas
resumen: La cúpula del CONTRATO del bus — el vigilante que cruza todo lo que conduce eventos (manifests, blueprints, skills, código) contra todo lo que los atiende, y canta los fantasmas en PR y pulso semanal.
fuentes:
  - scripts/cupula-eventos/**
  - modules/cupula-eventos/**
  - .github/workflows/cupula-eventos.yml
verificado: 2026-07-15
---

# CÚPULA DE EVENTOS — el contrato del bus, vigilado

> Las otras cúpulas guardan el documento (cabecera), el rail (estados) y la flota
> (agentes). Esta guarda **el idioma**: en un sistema donde todo se habla por
> eventos, un evento conducido que nadie atiende es un timeout silencioso — el
> fallo más caro de diagnosticar. Nació de un día real: una skill sellada
> conduciendo un evento inventado, un enum aceptado por el freno y rechazado por
> el dueño, y un replay muriendo en silencio años-luz de su causa.

## Contrato (JSON)

```json
{
  "esquema": "cupula-eventos-v1",
  "vigilante": "scripts/cupula-eventos/vigilante.js [--testigo] [--json]",
  "censo": {
    "atendidos": "module.json subscribes · blueprints eventos_que_escucho · operaciones de blueprint (<id>.<op>.request) · tools/tools_http por su NOMBRE · suscripciones PROGRAMÁTICAS en código (sub/subscribe en .js)",
    "conducidos": "publishAndWait(...) y _rpc(...) SOLO en pseudocódigo ejecutable (comentarios y prosa NO conducen — la prosa no lleva contratos), skills de la cantera y código",
    "publicados": "publishes de manifest · eventos_publicados de blueprint · publish(...) en pseudocódigo y código"
  },
  "cantos": {
    "rpc_fantasma": "ERROR — un RPC conducido que NADIE atiende (timeout silencioso garantizado)",
    "publish_huerfano": "WARN — publish de dominio sin subscriber; en consola solo los de pseudocódigo/skill (los de manifest los consume el frontend por MQTT dinámico → viven en --json)",
    "test_fantasma": "WARN — un stub de test compara contra un evento .request de módulo real que nadie atiende (raíz del caso destilador: el fantasma vivía en el test y jamás cantó)",
    "veto_por_nombre": "WARN — un freno veta PROCEDENCIA (fuente/canal/proveedor/origen/motor/provider) con lista cerrada: la ley de la evidencia (prisma-del-caso) manda calificar por evidencia, no por nombre",
    "intencion_madura": "OFRENDA — un trabajo_pendiente con evento_esperado (futuro DECLARADO, forma no prosa) cuyo evento YA se atiende: ciérralo. El canto positivo del conserje aplicado al contrato",
    "rechazo_mudo": "WARN — INVALID_INPUT sin hint en pseudocódigo: un muro sin puerta empuja al rodeo (curl, fs.edit, eventos inventados — visto en vivo). Mandato del freno fértil: todo rechazo lleva su camino. Línea base 2026-07-09: 65 (recetas 32)"
  },
  "fase": "GRADUADA (2026-07-09, repo a 0 fantasmas) — un rpc_fantasma ROMPE el CI; los WARN cantan sin bloquear",
  "organos_ci": {
    "check_en_pr": "cupula-eventos.yml on:pull_request → veredicto en el job summary",
    "pulso": "cron lunes 08:00 (junto al pulso de la cabecera)"
  }
}
```

## La CARA RUNTIME — la biblioteca buscable del bus (modules/cupula-eventos, {{version:modules/cupula-eventos}})

> El vigilante (arriba) es la cara de CI: canta fantasmas en PR. Esta es la cara VIVA: sirve el
> catálogo del bus al LLM, gemela EXACTA de `buscar_agente` (agentes) y `buscar_skill` (cantera).
> Cierra el propósito por el que se pensaron las cúpulas: **dar acceso a TODAS las capacidades del
> sistema SIN saturar contexto** — una puerta diminuta y universal, el catálogo entero detrás.

```json
{
  "esquema": "cupula-eventos-runtime-v1",
  "principio": "puerta diminuta universal + catálogo detrás, top-K bajo demanda (los ~400 contratos nunca entran al prompt)",
  "tools": {
    "buscar_capacidad": "{query, tipo?:tool|rpc|*, limite?} → top-K {name, tipo, descripcion} rankeado (catálogo BARATO). Gemela de buscar_agente.",
    "detalle_capacidad": "{name} → {request_shape, como_conducir, response_topic, confirmation} (el CUERPO bajo demanda — el 'abrir cajón' del bus)"
  },
  "indice": "moduleLoader.toolsRegistry — el mismo índice VIVO que alimenta getToolsForAI (siempre fresco, sin re-escanear)",
  "universalidad": "ambas en GLOBAL_TOOLS del ai-gateway → toda página (por el fix de _getTools que expone GLOBAL_TOOLS también en ramas blueprint/cajones)",
  "dos_caras": "vigilante (CI, escanea ficheros, canta fantasmas) + runtime (vivo, lee el registry, sirve al LLM) — misma verdad, como la cabecera (doc + check)"
}
```

```
FUNCION buscarCapacidad({query, tipo='*', limite=10}):        // PROYECCIÓN PURA (gemela de _buscarAgente)
  idx ← toolsRegistry.values()                                // índice vivo
  rank ← idx.filtrar(no-propias · tipo).map(c → {c, s: Σ tokens(query).en(name×2 + description)})
          .filtrar(s>0).ordenarDesc(s).tomar(limite)
  RETORNA {total, capacidades: rank.map(→ {name, tipo, descripcion})}   // BARATO, sin cuerpo

FUNCION detalleCapacidad({name}):                             // el cuerpo, bajo demanda (= cajon.abrir)
  t ← toolsRegistry.get(name)  · SI !t: 404
  RETORNA {name, tipo, request_shape: t.parameters, como_conducir: "bus.publishAndWait('name', …)",
           response_topic: name+'.response', confirmation: t.confirmation}
```

Test: `cupula-eventos__runtime` (12: registro · rank name>description · filtro tipo · límite · no-auto · detalle contrato · confirmation · 404/400 · response correlada).

## Cazas del primer barrido (2026-07-09 — la cúpula pagó su coste el día que nació)

```
✗ destilador → propiocepcion.leer.request     la tool se atiende por su NOMBRE (sin .request):
                                              el replay de rutas moría en timeout silencioso. CURADO
                                              en el mismo PR (destilador _rpc('propiocepcion.leer')).
✗ carta-marketing → agent-observer.consultar.request   RESUELTO POR FORMA: era un publishAndWait
                                              dentro de un COMENTARIO (la prosa escondía el contrato). La intención
                                              ahora es trabajo_pendiente con evento_esperado TIPADO — cuando
                                              agent-observer lo atienda, la cúpula canta INTENCIÓN MADURA.
⚠ chat.notification.requested (agente-base) · tienda.bundle.actualizada (subsistema-tienda)
                                              publishes de pseudocódigo sin subscriber — revisar al tocar.
FALSOS POSITIVOS DOMADOS  media-generator y carta-digital se suscriben EN CÓDIGO (onLoad),
                          no por manifest → el censo lee también los .js (por eso 'código' es fuente).
```

## Límite honesto (lo que esta v1 NO cruza)

Shapes y enums entre blueprints (el caso `fuente:'soysuper'` aceptada por el freno de
escandallo y rechazada por `recetas.actualizar_precio`) piden entender los contratos
de payload, no solo los nombres — es la siguiente rebanada de la escalera, cuando el
canto de nombres esté graduado. Tampoco ve las skills selladas EN VIVO en la cantera
de cada proyecto (datos, no repo): ese cruce pertenece al pulso contra la propiocepción
(lo declarado vs lo realmente conducido en el bus).
