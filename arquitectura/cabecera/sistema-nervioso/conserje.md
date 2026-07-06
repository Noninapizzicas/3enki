---
id: sistema-nervioso/conserje
dominio: aprendizaje
resumen: OFRECE vs USA: LibroDeCapacidades, brecha priorizada por intención, empujón consumido por el nervio, registro central de interruptores.
fuentes:
  - modules/conserje/**
  - modules/_shared/libro-capacidades.js
  - modules/interruptores/**
verificado: 2026-07-06
---

# Subsistema CONSERJE — Abrir el camino al comerciante (OFRECE vs USA)

> Hermano del destilador en el oído (escucha el bus crudo), pero con otro objetivo:
> no destila skills — detecta **fricción del comerciante** y le ofrece el siguiente
> paso, **en positivo** (no señala la carencia). El empujón EMERGE de la estructura:
> lo que el sistema OFRECE menos lo que el comerciante USA = la oportunidad. Sin
> sondas hardcodeadas. La señal de oro es la **intención**: lo que el comerciante
> alarga la mano a tocar pero está vacío. Verificado en vivo contra Nonina.

## La abstracción (LibroDeCapacidades) — pieza pura

```json
{
  "esquema": "libro-de-capacidades-v1",
  "tesis": "el empujon emerge de OFRECE - USA, priorizado por INTENCION",
  "Capacidad": { "id": "marca|recetas|carta|...", "ofrece": "frase de valor",
                 "requiere": ["id"], "entrada": "evento.accion", "valor": "1..10" },
  "estado_proyecto": { "usadas": "Set<id> (entrega valor ya)",
                       "intentadas": "Set<id> (la toca pero esta vacia)" },
  "brecha": "ofrecidas - usadas, ordenada por: intencion(x3 desbloqueo) x valor x listo",
  "dos_formas": { "descubrimiento": "ofrecida nunca tocada",
                  "desbloqueo": "intentada no lista (vacia) -> prioridad ALTA" },
  "requiere_ordena_la_apertura": "no empuja 'disena la carta' sin marca; lo bloqueado tiene prioridad 0"
}
```

```
CLASE LibroDeCapacidades {                 // modules/_shared/libro-capacidades.js — sin bus ni I/O
  constructor(capacidades: Array<Capacidad>)
  brecha(estado): Array<ItemBrecha>        // { id, ofrece, entrada, tipo, listo, bloqueada_por, prioridad }
    PARA cap NO usada:
      listo ← cap.requiere TODO en usadas
      tipo  ← intentadas.has(cap.id) ? 'desbloqueo' : 'descubrimiento'
      prioridad ← listo ? valor * (desbloqueo ? 3 : 1) : 0
  siguienteEmpujon(estado): el top LISTO con prioridad>0, o null

  PIZZEPOS_CAPACIDADES = [marca, recetas, escandallo, carta(req recetas),
                          diseno(req marca+carta), digital(req carta+marca)]
  // sale casi entero de la seccion "Bases compartidas" de esta cabecera
}
```

## ConserjeModule (REFLEJO) — cruza OFRECE vs USA en vivo

```
CLASE ConserjeModule HEREDA BaseModule {
  libro: LibroDeCapacidades(PIZZEPOS_CAPACIDADES)
  activo: false                            // OFF por defecto; lo gobierna el interruptor
  estados: Map<project, {usadas, intentadas}>
  pendientes: Map<project, empujon>        // lo lee el nervio, UNA vez
  pendingReq: Map<request_id, {project_id, capacidad}>   // correla req->resp
  cooldown: Map<`${project}::${cap}`, ts>  // no agobiar (24h)

  onLoad: _registrarBoton() ; _startBusCapture() ; tick cada 15s
  onSolicitarRegistro: re-registra (cura la carrera de arranque)
  onInterruptorCambiado(id='conserje'): activo ← enabled (en caliente)

  // ── el bus delata el USO. CLAVE: el .response NO lleva project_id (vive en el
  //    .request); por eso se CORRELA request->response por request_id ──
  _capturar(topic, msg):
    SI evento EN SEÑAL_REQUEST  : pendingReq[request_id] ← {project_id, capacidad} ; RETORNA
    SI evento EN SEÑAL_RESPONSE : pend ← pendingReq[request_id] ; _actualizar(pend.project, cap, lleno(resp.data.data))
    SI evento EN SEÑAL_EVENTO   : _actualizar(project_id, cap, lleno(data))   // autocontenido
  _actualizar(project, cap, lleno):
    lleno ? (usadas.add(cap), intentadas.delete(cap)) : (NO usada ? intentadas.add(cap))
    dirty.add(project)

  _tick (si activo): PARA project dirty: item ← libro.siguienteEmpujon(estado)
    SI item Y NO en cooldown: emitir conserje.empujon + pendientes[project] ← empujon ; cooldown[key] ← now
  _emitirEmpujon: mensaje POSITIVO (desbloqueo: "buscas X pero esta sin montar, ¿lo completamos?")

  // ── el NERVIO lo lee (consume-on-read: se ofrece una vez) ──
  tool conserje.empujon_pendiente {project_id} -> { empujon } + DELETE
  ui conserje.brecha {project_id} -> visibilidad (usadas, intentadas, ranking)
}
```

## Nervio del conserje (en AIGateway) — el empujón llega al chat

```
// Calco del nervio propioceptivo. En _executeLLM, turno REAL con proyecto:
_leerEmpujon(project_id): RPC best-effort (2s) a conserje.empujon_pendiente (consume)
_composeEmpujonSection(empujon):
  "# UN EMPUJON PARA EL COMERCIANTE — ofrecelo UNA vez, natural, en positivo: <mensaje>.
   Si encaja, propon; si el usuario va a otra cosa, DEJALO. No insistas. No digas que es automatico."
inyeccion: SOLO turno real con proyecto (no sintetico). Si conserje OFF -> no hay pendiente -> no inyecta.
```

## Registro central de interruptores + panel (todos los on/off en un sitio)

```
CLASE InterruptoresModule HEREDA BaseModule {     // el panel de control
  toggles: Map<id, {id, label, descripcion, grupo, estado, default}>
  onLoad: publica interruptor.solicitar_registro  // anuncio: cura la carrera de arranque
  onRegistrar(evento): _upsert (el estado PERSISTIDO manda sobre el default)
  ui interruptores.listar -> el panel los pinta por grupo
  ui interruptores.set {id, enabled} -> persiste data/interruptores.json + emite interruptor.cambiado
  // el dueño del interruptor escucha cambiado y reacciona EN CALIENTE sin reinicio

  PATRON anuncio/solicitud (como tarifas.config.solicitada):
    interruptores al cargar pide registro -> cada feature re-registra -> order-independent
}

// FRONTEND: modules/interruptores (work-bar 🎛️) — InterruptoresPanel.svelte
//   lista los toggles por grupo, un switch por cada uno; al pulsar -> interruptores.set.

PENDIENTE (boot-sync): al arrancar, el estado persistido (panel ON) no propaga al
  modulo dueño -> el conserje arranca activo:false aunque el toggle estuviera ON.
  Cura: en onRegistrar, si el persistido difiere del default, emitir interruptor.cambiado.
```

## Ciclo (verificado EN VIVO contra Nonina)

```
1. el comerciante lee su marca (vacia)
     get_perfil.request (project_id) + get_perfil.response (datos, sin project_id)
     -> conserje CORRELA por request_id -> marca INTENTADA
2. tick -> conserje.empujon "¿completamos tu marca?" + pendiente[nonina]     [VISTO EN VIVO]
3. turno ajeno ("¿que tal el dia?")
     -> nervio lee el pendiente (consume) -> inyecta en silencio
     -> el chat lo ofrece natural, UNA vez, en positivo ("sin prisa")          [VISTO EN VIVO]
```

## Piezas / eventos

```
modules/_shared/libro-capacidades.js   (abstraccion pura · tests 9/9)
modules/conserje/                       (reflejo + LibroDeCapacidades · OFF por defecto)
modules/interruptores/                  (registro central + persistencia)
frontend/src/lib/modules/interruptores/ (panel 🎛️ barra lateral)
ai-gateway: _leerEmpujon + _composeEmpujonSection (el nervio)

EVENTOS {
  interruptor.registrar / .solicitar_registro / .cambiado   (panel de on/off)
  conserje.empujon {project_id, tipo, recurso, mensaje, accion_sugerida}
  conserje.empujon_pendiente (tool, consume-on-read) -> .response   (lo lee el nervio)
}
TESTS { libro-capacidades 9/9 · interruptores+conserje 12/12 (correlacion req->resp, on/off en caliente, cooldown, nervio) }
```
