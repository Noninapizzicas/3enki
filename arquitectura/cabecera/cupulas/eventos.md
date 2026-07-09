---
id: cupulas/eventos
dominio: cupulas
resumen: La cúpula del CONTRATO del bus — el vigilante que cruza todo lo que conduce eventos (manifests, blueprints, skills, código) contra todo lo que los atiende, y canta los fantasmas en PR y pulso semanal.
fuentes:
  - scripts/cupula-eventos/**
  - .github/workflows/cupula-eventos.yml
verificado: 2026-07-09
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
    "conducidos": "publishAndWait(...) y _rpc(...) en blueprints, skills de la cantera y código",
    "publicados": "publishes de manifest · eventos_publicados de blueprint · publish(...) en pseudocódigo y código"
  },
  "cantos": {
    "rpc_fantasma": "ERROR — un RPC conducido que NADIE atiende (timeout silencioso garantizado)",
    "publish_huerfano": "WARN — publish de dominio sin subscriber; en consola solo los de pseudocódigo/skill (los de manifest los consume el frontend por MQTT dinámico → viven en --json)",
    "test_fantasma": "WARN — un stub de test compara contra un evento .request de módulo real que nadie atiende (raíz del caso destilador: el fantasma vivía en el test y jamás cantó)",
    "veto_por_nombre": "WARN — un freno veta PROCEDENCIA (fuente/canal/proveedor/origen/motor/provider) con lista cerrada: la ley de la evidencia (prisma-del-caso) manda calificar por evidencia, no por nombre"
  },
  "fase": "TESTIGO — canta sin bloquear (--testigo en CI); se gradúa quitando el flag cuando el repo quede sin fantasmas",
  "organos_ci": {
    "check_en_pr": "cupula-eventos.yml on:pull_request → veredicto en el job summary",
    "pulso": "cron lunes 08:00 (junto al pulso de la cabecera)"
  }
}
```

## Cazas del primer barrido (2026-07-09 — la cúpula pagó su coste el día que nació)

```
✗ destilador → propiocepcion.leer.request     la tool se atiende por su NOMBRE (sin .request):
                                              el replay de rutas moría en timeout silencioso. CURADO
                                              en el mismo PR (destilador _rpc('propiocepcion.leer')).
✗ carta-marketing → agent-observer.consultar.request   agent-observer solo atiende agent.execute.*.
                                              PENDIENTE: decisión del dueño (¿op nueva o evento mal nombrado?).
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
