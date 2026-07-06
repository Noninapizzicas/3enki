---
id: sistema-nervioso/aprendizaje
dominio: aprendizaje
resumen: Destilador (mina el bus y sella skills), Conserje (ofrece en positivo), Interruptores (panel central on/off).
fuentes:
  - modules/destilador/**
  - modules/interruptores/**
verificado: 2026-07-06
---

# Sistema Nervioso de Aprendizaje — Destilador · Conserje · Interruptores

> El cerebro vivo del sistema: percibe (propiocepción), aprende (destilador), ofrece (conserje),
> y se gobierna por interruptores. Obsidian es la versión disecada de esto; aquí late. No es un
> órgano nuevo — son facultades que conectan los órganos que ya existen (bus, propiocepción, fs).

## Mapa neuronal (la metáfora, anclada a piezas reales)

```
neurona            = página/blueprint (un nodo que dispara)
sinapsis           = arista del grafo de eventos (publica → escucha)
disparo            = evento del bus (publish → MQTT propaga la activación)
plasticidad (Hebb) = destilador: rutas que se repiten → sella el atajo (skill)
nervios            = propiocepción (lo que pasó) + vista-bridge (lo que se ve)
control inhibitorio= interruptores (apagar una vía en caliente)
sinapsis latente   = evento 'dangling' (publica-sin-oyente / oye-sin-emisor) = mención-sin-enlazar
autorretrato       = graph/ (force-layout · god nodes · subsistemas · dangling) — el cerebro viéndose
```

## DESTILADOR (module {{version:modules/destilador}} · blueprint 0.3.0) — el lazo de aprendizaje

```
HÍBRIDO  reflejo (JS) mina el bus + sirve/sella skills · blueprint (LLM) redacta la skill.
FACULTADES {
  MINERO (paso 1)      agrupa eventos por correlation_id en TRAZAS → reduce a FIRMA (secuencia
                       dominio.op) → firma recurrente (>= umbral) → aprendizaje.candidata.detectada
  COLA+GUARDIA (paso 2) el blueprint redacta el SKILL.md desde los registros REALES (cero invención);
                       queda en cola → un humano aprueba (destilador.aprobar) → escribe en
                       .claude/skills/ con ANTI-WIPE (no pisa skill existente → 409 conflicto)
  AUTO-MEJORA (paso 3)  skill.aplicada etiqueta la traza → mide tasa de fallo (ventana deslizante)
                       → aprendizaje.revision.requerida al cruzar umbral (histéresis si se recupera)
  REPLAY (lado lectura) destilador.ruta {project_id, desde} → trayectorias aprendidas que ARRANCAN
                       en 'desde', con su CONTINUACION (lo que suele venir después), rank por ocurrencias.
                       Inspirado en ReasoningBank (ruflo): capturar Y RE-EJECUTAR. Match por prefijo
                       DETERMINISTA (cero embeddings) — el upgrade semántico (HNSW) es para después.
}

SKILL.md ENRIQUECIDA (blueprint 0.3.0 · lengua materna, prosa racionada) {
  ## Cuándo usar  trigger como CONDICIÓN        ## Contrato   JSON in/out
  ## Mecanismo    PSEUDOCÓDIGO OOP (el grueso)  ## Pasos      bullets accionables (OBLIGATORIA: guard no_esteril)
  ## Filosofía    OPCIONAL — prosa 1-2 líneas SOLO si hay trade-off que el Mecanismo no captura;
                  si el mecanismo basta, la sección NO existe (P0: la prosa que no protege un porqué se disuelve)
}

NERVIO CERRADO (reflejo 0.6.0)  el lazo Hebbiano se cierra INTERNAMENTE: en _evaluarSkills, si la
   firma de la traza coincide con la de una skill APROBADA (cola estado='aprobada'), cuenta como
   APLICADA y su desenlace (ok/fail, ya detectado vía traza.fallo) alimenta la ventana del paso 3.
   El destilador SIENTE sus skills sin emisor externo. (_etiquetarSkill sigue como receptor para
   señales skill.aplicada externas, si algún día llegan — vía bus crudo, sub-declarado en el grafo.)
```

## CONSERJE (module {{version:modules/conserje}}) — el ofrecedor proactivo (en POSITIVO)

```
Cruza lo que el sistema OFRECE (LibroDeCapacidades) con lo que el comerciante USA (derivado del bus)
y ofrece el siguiente paso EN POSITIVO (no señala la carencia). La señal de oro es la INTENCIÓN —
lo que el comerciante alarga la mano a tocar pero está vacío (= una mención-sin-enlazar accionada).

DOS FACULTADES, DOS INTERRUPTORES INDEPENDIENTES {
  BRECHA  (switch 'conserje')        OFRECE vs USA → "te falta montar X, ¿lo completamos?"
  RUTAS   (switch 'conserje-rutas')  REPLAY SUGERENTE: tras un paso, pregunta destilador.ruta
                                     "desde aquí, ¿por dónde se suele ir?" → ofrece la continuación
                                     aprendida ("después de recetas: escandallo → carta. ¿Sigo?").
                                     Ofrece, NO impone · una vez · cooldown · solo rutas probadas (>=umbral).
}
PRIORIDAD  la brecha gana el tick: la ruta no pisa un empujón pendiente.
El nervio (ai-gateway) lee conserje.empujon_pendiente y lo surfacea en el chat, consume-on-read.
```

## INTERRUPTORES (module {{version:modules/interruptores}}) — el panel central de on/off

```
REGISTRO CENTRAL de todos los botones del sistema. Cada feature registra el suyo al cargar
(interruptor.registrar {id, label, grupo, default}); el panel lo pinta; al pulsarlo,
interruptor.cambiado avisa al dueño para reaccionar EN CALIENTE (sin reinicio).
Estado global persistido (data/interruptores.json): lo tocado por el humano MANDA sobre el default.

SYNC AL CARGAR (v1.1.0)  onRegistrar, tras el upsert, EMITE interruptor.cambiado si el estado
   persistido difiere del default anunciado → el 'off' (u 'on') del humano SOBREVIVE al reinicio.
   Solo emite en divergencia (sin ruido). Beneficia a todos los dueños.

BOTONES VIVOS (grupo 'aprendizaje') {
  destilador        ON por defecto (preserva el lazo corriendo) · OFF = no mina (cero captura);
                    ver/aprobar/consultar-rutas SIGUE disponible (apagar es no APRENDER, no dejar de consultar)
  conserje          OFF por defecto · empujones por brecha
  conserje-rutas    OFF por defecto · replay sugerente de rutas aprendidas (independiente del anterior)
}
PATRÓN  para añadir un on/off: campo this.activoX=false → publish('interruptor.registrar',{id,...,default})
        en onLoad → onInterruptorCambiado filtra por id y setea this.activoX → gatea la facultad.
```

## Topics / eventos del subsistema

```
aprendizaje.candidata.detectada / .encolada / skill.creada / revision.requerida   (destilador)
destilador.ruta.request → .response   (REPLAY lado lectura; lo consume el conserje y el LLM/tool)
destilador.leer_registros.request / encolar_candidata.request   (RPC internos del lazo)
conserje.empujon                      (ofrecimiento; tipo ∈ {desbloqueo, descubrimiento, ruta})
interruptor.registrar / interruptor.cambiado   (panel central; cambiado avisa al dueño en caliente)
skill.aplicada                        (RECEPTOR en destilador; emisor PENDIENTE — nervio suelto)
```
