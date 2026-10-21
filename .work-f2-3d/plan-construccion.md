# PLANO DE ACOPLAMIENTO — Taller personal de impresión 3D (proyecto 3d)

> **Proyecto:** 3d · Taller personal de impresión 3D (uso propio, una impresora SPARKX i7, moneda del dueño `STL → GCODE`: STL modelo → [slicer] → GCODE impresión; NO se usa `.3mf`).
> **Fuente del diseño:** `.work-f2-3d/diseno-oop.md` (FASE 3 · PLASMA, 24 clases · 17 piezas) + `.work-f2-3d/esquema.md` (FASE 2).
> **Entrada:** diseño OOP agnóstico (QUÉ) · **Salida:** plano de acoplamiento al sistema Enki real (CÓMO).
> **Consumidor:** fase 4 `construir-modulos` (hoja a hoja, en orden de dependencias de la espina).
> **Autor:** adaptador X→Enki (fase 3b, agente prisma-universal).

---

## 1. Decisión de traducción central

Enki NO es OOP clásico: las 24 clases del diseño se traducen a **módulos-isla event-driven**. Ningún módulo hace `require` de la lógica de otro (ni siquiera la composición de las clases del diseño, que se reparte por eventos) — se hablan SOLO por eventos (`publishAndWait` para request/response, `publish` para fire-and-forget), con `correlation_id` propagando causalidad. Reglas innegociables del adaptador:

| Clase del diseño OOP | Traducción Enki |
|---|---|
| CLASE con estado | módulo **CUSTODIO** (single-writer de su store) |
| CLASE que solo calcula | **PROYECCIÓN INTERNA** dentro del módulo que la usa (jamás helper en `_shared/`) |
| CLASE que orquesta | módulo **MICRO-AGENTE / ORQUESTADOR** (el ciclo de impresión orquesta) |
| CLASE que habla con el exterior | módulo **PUENTE** |
| Dependencia entre clases | **EVENTO request/response**, nunca import |
| Lógica de negocio | DENTRO del módulo como proyección `_op` del reflejo; `_shared/` es SOLO infraestructura (`modulo-hibrido-reflejo`, `pos-persistencia`) |

**Aplicación al diseño (las 17 piezas, forma ya decidida en FASE 2 §4):**

- **CUSTODIO (4):** `Catalogo→catalogo`, `Cola→cola`, `Filamento→filamento`, `Cupula→cupula-gcode` — cada uno single-writer de su store (persistencia por proyecto con `PosPersistencia`).
- **CONVERSOR (2):** `ImportadorModelos→importacion` (STL/GCODE + lectores por formato, puertos ABIERTO) · `Preparador→adaptador-slicing` (ya construido, REUTILIZAR; slicer STL→gcode).
- **PUENTE (3):** `AdaptadorImpresora→adaptador-impresora` (REUTILIZAR) · `Avisador→adaptador-avisos` + confirmación humana `→adaptador-confirmacion` (REUTILIZAR, soporta la REF pieza 18) · `BuscadorRepositorios→buscador-repositorios` (CONSTRUIR).
- **REFLEJO (8):** `MotorEncadenamiento→motor-encadenamiento` · `MotorPropuesta→motor-propuesta` · `CicloImpresion→ciclo-impresion` (orquestador) · `CalculoConsumo→consumo` · `Historial→historial` (append-only) · `ManejoFallo→manejo-fallo` · `PanelTrabajador→panel-trabajador` · `PanelJefe→panel-jefe`.

**Composición del diseño traducida a proyecciones internas (NO módulos nuevos):**
- `MotorPropuesta` y `CalculoConsumo` NO son módulos por separado de sus proyecciones: la clase **CalculoConsumo** es proyección interna `_op` del módulo `consumo` (que además es reflejo con store mínimo); el **MotorPropuesta** vive como reflejo `motor-propuesta` que PROPONE (no muta) — su orden se aplica solo cuando el jefe aprueba vía `cola.reordenar`.
- La clase **Modelo/TareaCola/ArchivoPreparado/Bobina/RegistroImpresion** son value objects que habitan cada store del custodio que las posee; el `TareaCola→ArchivoPreparado` es asociación referencial resuelta por evento (`archivo.preparado`), nunca por import.

## 2. Inventario consultado (el suelo real)

`find /home/admin/3enki/modules -maxdepth 2 -name module.json` → **≈115 módulos raíz** con manifest, incluidas verticales `prisma/*`, `pizzepos/*`, `conversacion/*`, `agentes/*`. Regla: NO se inventa lo que ya existe. Para el proyecto 3d **ya existen 4 puentes construidos** (de una iteración previa de FASE 4 que hizo la infraestructura de frontera) y **NO existe ningún custodio ni reflejo del dominio de impresión**. Cada hoja CONSTRUIR (§5) justifica por qué no reutiliza lo existente.

Módulos 3d vivos verificados en `module.json`:

| Módulo real | Forma real (manifest) | Pieza del diseño que cubre | Decisión |
|---|---|---|---|
| `modules/adaptador-impresora` | PUENTE stateless (Moonraker/SPARKX, doble transporte local o bridge) | 7 AdaptadorImpresora | **REUTILIZAR** |
| `modules/adaptador-avisos` | PUENTE stateless (Telegram vía `telegram-bridge`, ack explícito, par `enviar.failed`) | 8 Avisador | **REUTILIZAR** |
| `modules/adaptador-confirmacion` | PUENTE stateless (telegram.callback.received → `confirmacion_recibida`) | 18 Aprobación/confirmación (REF) | **REUTILIZAR** |
| `modules/adaptador-slicing` | PUENTE stateless al slicer externo (CrealityPrint CLI; `slicear` STL→gcode + `leer_stl`) | 6 Preparador (SlicerPort) + lectura STL | **REUTILIZAR** |
| `modules/disenador_parametrico` | REFLEJO OpenSCAD (`disenador.generar_stl`) | — (genera modelos *diseñados*, fuente DISEÑADO) | **Reuso opcional** como origen de archivos para `importacion`, NO es pieza de las 17 |
| `modules/crawl4rs` | órgano web (SearXNG `buscar` + leer) | transporte genérico de búsqueda | **Infraestructura** reutilizada por `buscador-repositorios` |

**Justificación de cada REUTILIZAR:** los tres puentes 3d y el adaptador-slicing están escritos EXACTAMENTE para este dominio (mismo proyecto 3d, mismos puertos `subir_gcode/iniciar_impresion/observar_estado/slicear/leer_stl/enviar/confirmar`), con par de fallo canónico y contrato en ASCII — reutilizarlos no es heurístico, es el mismo diseño ya aterrizado. El slicer consume la moneda del dueño: STL → gcode (cero `.3mf` intermedio). El `disenador_parametrico` no se cuela como pieza (no está entre las 17) pero recibe evento `archivo.preparado`/`modelo.registrado` si el dueño genera un STL paramétrico.

## 3. Mapa de traducción OOP → módulos Enki

| Entidad del diseño (FASE 3) | Módulo Enki (slug) | Forma (FASE 2) | Acción |
|---|---|---|---|
| `Catalogo` (pieza 1, CUSTODIO) | `catalogo` | custodio | **CONSTRUIR** |
| `Cola` (pieza 2, CUSTODIO `[CORAZÓN]`) | `cola` | custodio | **CONSTRUIR** |
| `Filamento` (pieza 3, CUSTODIO) | `filamento` | custodio | **CONSTRUIR** |
| `Cupula` (pieza 4, CUSTODIO) | `cupula-gcode` | custodio | **CONSTRUIR** |
| `ImportadorModelos` (pieza 5, CONVERSOR) | `importacion` | conversor | **CONSTRUIR** |
| `Preparador` (pieza 6, CONVERSOR) | `adaptador-slicing` | puente | **REUTILIZAR** |
| `AdaptadorImpresora` (pieza 7, PUENTE) | `adaptador-impresora` | puente | **REUTILIZAR** |
| `Avisador` (pieza 8, PUENTE) | `adaptador-avisos` | puente | **REUTILIZAR** |
| `BuscadorRepositorios` (pieza 9, PUENTE) | `buscador-repositorios` | puente | **CONSTRUIR** |
| `MotorEncadenamiento` (pieza 10, REFLEJO) | `motor-encadenamiento` | reflejo | **CONSTRUIR** |
| `MotorPropuesta` (pieza 11, REFLEJO) | `motor-propuesta` | reflejo | **CONSTRUIR** |
| `CicloImpresion` (pieza 12, REFLEJO/orquestador) | `ciclo-impresion` | reflejo | **CONSTRUIR** |
| `CalculoConsumo` (pieza 13, REFLEJO) | `consumo` | reflejo | **CONSTRUIR** |
| `Historial` (pieza 14, REFLEJO, append-only) | `historial` | reflejo | **CONSTRUIR** |
| `ManejoFallo` (pieza 15, REFLEJO) | `manejo-fallo` | reflejo | **CONSTRUIR** |
| `PanelTrabajador` (pieza 16, REFLEJO, rol HOY) | `panel-trabajador` | reflejo | **CONSTRUIR** |
| `PanelJefe` (pieza 17, REFLEJO, rol FUTURO) | `panel-jefe` | reflejo | **CONSTRUIR** |
| Aprobación de modelos (pieza 18, `REF`) | `adaptador-confirmacion` | puente | **REUTILIZAR** (capacidad de confirmación humana + reconciliar del catálogo) |
| `Modelo/TareaCola/ArchivoPreparado/Bobina/RegistroImpresion/SolicitudDecision` | value objects dentro de los stores de sus custodios | — | — |
| `LectorArchivo` (LectorSTL/LectorGCODE) · `ImpresoraPort` · `CanalAvisosPort` · `SlicerPort` · `RepositoriosPort` | puertos ABIERTO, inyectados en el sitio de despliegue; cableados en los puentes | — | — |

## 4. Contrato de eventos del dominio (bus en ASCII; transliteración del diseño: imprimida→imprimida, añadir→anadir, cola→cola)

### 4.1 Pares request/response (RPC del bus, `publishAndWait`)

| Evento request | Quién pide | Quién responde |
|---|---|---|
| `catalogo.registrar/por_id/actualizar/listar.request` | importacion / panel-jefe / panel-trabajador | catalogo |
| `importacion.importar/leer_metadatos.request` | panel-jefe / catálogo | importacion |
| `buscador-repositorios.buscar.request` | panel-jefe | buscador-repositorios |
| `cupula-gcode.registrar/marcar_consumido/listos/reserva/obtener.request` | ciclo-impresion / motor-encadenamiento / cola / motor-propuesta | cupula-gcode |
| `cola.encolar/reordenar/marcar_urgente/cancelar/siguiente/imprimiendo/terminada.request` | ciclo-impresion / panel-jefe / panel-trabajador / motor-encadenamiento | cola |
| `motor-propuesta.proponer.request` | panel-jefe / cola | motor-propuesta |
| `motor-encadenamiento.al_terminar.request` | ciclo-impresion | motor-encadenamiento |
| `ciclo-impresion.iniciar/pausar/reanudar/abortar.request` | motor-encadenamiento / panel-trabajador / cola | ciclo-impresion |
| `historial.registrar/por_modelo/recientes/borrar.request` | ciclo-impresion / consumo / panel-jefe | historial |
| `consumo.promedio/pronostico.request` | panel-jefe | consumo |
| `manejo-fallo.manejar.request` | ciclo-impresion / panel-trabajador | manejo-fallo |
| `filamento.registrar/descontar/cambiar/evaluar.request` | ciclo-impresion / panel-trabajador / panel-jefe | filamento |

### 4.2 Eventos fire-and-forget (dominio) + pares de fallo

| Evento | Publica | Significado | Par canónico |
|---|---|---|---|
| `modelo.registrado` | catalogo | Ficha nueva o actualizada (reconciliado) | `catalogo.registrar.failed` |
| `archivo.preparado` | cupula-gcode | GCODE listo en la cúpula (alimenta cola/reserva) | `cupula-gcode.registrar.failed` |
| `cola.actualizada` | cola | Mutación de orden/estado (repinta paneles) | `cola.*.failed` |
| `material.actualizado` / `material.bajo` | filamento | Cambio de bobina / cruce de umbral (NO decide) | `filamento.*.failed` |
| `impresion.iniciada` | ciclo-impresion | La pieza pasa a IMPRIMIENDO (aviso inicio) | `ciclo-impresion.iniciar.failed` |
| `impresion.registrada` | historial | Registro append-only con dato MEDIDO | `historial.registrar.failed` |
| `impresion.terminada` | ciclo-impresion | TERMINADA con `ok:true` → dispara el encadenamiento | `ciclo-impresion.terminada.failed` |
| `pieza.imprimida` | historial | Éxito registrado en el historial (dato MEDIDO + lectura agregada; NO dispara encadenamiento) | `historial.registrar.failed` |
| `impresion.fallida` | ciclo-impresion | Fallo → manejo-fallo (siempre avisar) | `ciclo-impresion.failed` |
| `ciclo_abortado` | ciclo-impresion | Aborto por trabajador | — |
| `aviso.solicitar` | cualquier pieza | Pide aviso por el canal del dueño | `adaptador-avisos.enviar.failed` |
| `adaptador-confirmacion.confirmacion_recibida` | adaptador-confirmacion | Respuesta del dueño interpretada (transporta, no decide) | `adaptador-confirmacion.confirmar.failed` |
| `cola_vacia` | motor-encadenamiento | Impresora ociosa, nada listo para encadenar | — |

**Regla de garantía (del diseño FASE 3 flujos):** TODO flujo cierra su círculo con su par de resultado; nadie da por hecho un envío/impresión sin `ok:true` explícito del proveedor (honestidad M11) ni un gramo/tempo sin dato MEDIDO del historial (cero estimación).

## 5. Máquina de estados del ciclo + dueño

```
ENCOLADA --(ciclo.iniciar: subir_archivo ok)--> ENVIANDO --(iniciar_impresion ok)--> IMPRIMIENDO --(telemetría)--> IMPRIMIENDO
IMPRIMIENDO --(trabajador pausar)--> PAUSADO --(reanudar)--> IMPRIMIENDO
IMPRIMIENDO --(onTerminadaOk)--> TERMINADA   -> impresion.terminada(fuente ÚNICA del encadenamiento) + historial.registrar(OK) + filamento.descontar
IMPRIMIENDO --(fallo)--> FALLIDA             -> manejo-fallo: REINTENTAR | SALTAR | ESPERAR_DECISION (siempre avisar)
IMPRIMIENDO --(trabajador abortar)--> CANCELADA  -> historial CANCELADA
FALLIDA --(reintentar aprobado)--> ENCOLADA | --(saltar aprobado)--> encadena la siguiente
```

- **Disparo de encadenamiento con fuente ÚNICA:** solo `ciclo-impresion` (el dueño de las transiciones) emite `impresion.terminada` al alcanzar TERMINADA con `ok:true`, y ese es el ÚNICO evento que dispara `motor-encadenamiento.al_terminar`. `pieza.imprimida` (del historial) ES un hito informativo (registro append-only + dato MEDIDO para consumo), nunca dispara encadenamiento — evita doble disparo si `cola.terminada` y el historial emitieran por separado.
- **Dueño de las transiciones:** el `ciclo-impresion` (orquestador) aplica las transiciones al consumir eventos físicos (telemetría/fallo del `adaptador-impresora`) o comandos del trabajador/cola. Estado ilegal imposible: nunca dos tareas en IMPRIMIENDO (una sola impresora).
- **Cero juicio:** la aprobación de propuestas, el marcado de urgencia, la reposición de filamento, aprobar/reintentar/saltar van por `adaptador-confirmacion` (SolicitudDecision) y esperan la respuesta del dueño — el sistema nunca la sustituye.

---

## 6. Hojas del plan — módulos a CONSTRUIR (cada una con 7 etapas)

### 6.1 `catalogo` — CUSTODIO (pieza 1)
- **DEP:** `_shared/pos-persistencia`; consumidores `importacion`, `panel-jefe`, `panel-trabajador`.
- **MODULE.JSON:** name `catalogo`; subscribes `catalogo.registrar/por_id/actualizar/listar.request`; publishes `modelo.registrado`, `catalogo.registrar.failed`.
- **INDEX.JS:** `ModuloHibridoReflejo`; `project.activated` + `PosPersistencia` (persiste por proyecto; único escritor del store modelos).
- **PROYECCIONES:** `_registrar` (reconcilia ANTES de crear: nombre canónico + fuente + origenUrl → NO duplica), `_porId`, `_listar`, `_actualizar`.
- **HANDLERS RPC:** `onRegistrarRequest(e){ this._atender(e,'registrar','catalogo.registrar.response', d=>this._registrar(d)) }` (y análogos).
- **EVENTOS:** publica `modelo.registrado` al registrar; par de fallo `catalogo.registrar.failed`.
- **VERIF:** ficheros en disco, smoke de `registrar/por_id`, store por proyecto.

### 6.2 `cola` — CUSTODIO `[CORAZÓN]` (pieza 2)
- **DEP:** `cupula-gcode` (siguienteAImprimir = cabecera con gcode listo). `motor-propuesta` PROPONE (no muta) vía `cola.reordenar` si el jefe aprueba — la flecha va AL REVÉS: `motor-propuesta` depende de `cola`, no al revés (la cola se construye sola con la cúpula).
- **MODULE.JSON:** name `cola`; subscribes `cola.encolar/reordenar/marcar_urgente/cancelar/siguiente/imprimiendo/terminada.request`; publishes `cola.actualizada`, `cola.*.failed`.
- **INDEX.JS:** único dueño del store tareas (`ArrayDePrioridad` FIFO + urgencia) + `enImpresion`.
- **PROYECCIONES:** `_encolar` (encola; una propuesta de reorden la decide el jefe tras `motor-propuesta.proponer`), `_reordenar` (solo si el jefe aprobó), `_marcarUrgente`, `_siguienteAImprimir` (cabecera preparada), `_marcarImprimiendo/_marcarTerminada`.
- **HANDLERS RPC:** `onEncolarRequest(e){...}` etc.
- **EVENTOS:** `cola.actualizada` en cada mutación; par de fallo por op.
- **VERIF:** encolar→orden FIFO/urgente, siguiente solo con gcode listo.

### 6.3 `filamento` — CUSTODIO (pieza 3)
- **DEP:** `historial` (dato MEDIDO para descontar), `adaptador-avisos`.
- **MODULE.JSON:** name `filamento`; subscribes `filamento.registrar/descontar/cambiar/evaluar.request`; publishes `material.actualizado`, `material.bajo`, `filamento.*.failed`.
- **INDEX.JS:** store bobinas + `umbralRepos` (decisión del dueño, ABIERTO); único escritor.
- **PROYECCIONES:** `_registrarBobina`, `_descontar` (SOLO con gramo del historial), `_cambiarBobina`, `_restaDe`, `_evaluarUmbral` (resta<umbral → emite `material.bajo`; avisa, NO decide).
- **HANDLERS RPC:** `onDescontarRequest(e){...}` etc.
- **EVENTOS:** `material.actualizado`/`material.bajo`; par de fallo.
- **VERIF:** CERO descuento sin registro previo de la impresión; umbral emite aviso.

### 6.4 `cupula-gcode` — CUSTODIO (pieza 4)
- **DEP:** `importacion`/`adaptador-slicing` (el gcode llega listo; STL fuente NO entra a la cúpula), `cola`.
- **MODULE.JSON:** name `cupula-gcode`; subscribes `cupula-gcode.registrar/marcar_consumido/listos/reserva/obtener.request`; publishes `archivo.preparado`, `cupula-gcode.registrar.failed`.
- **INDEX.JS:** store de la moneda (`ArchivoPreparado`: ruta/perfil/gramos est/tiempo est/listo) + `reservaMin` ABIERTO; único escritor.
- **PROYECCIONES:** `_registrar` (emite `archivo.preparado`), `_marcarConsumido`, `_listosParaImprimir`, `_reserva` (alimenta la cola), `_obtener`.
- **HANDLERS RPC:** `onRegistrarRequest(e){...}` etc.
- **EVENTOS:** `archivo.preparado`; par de fallo.
- **VERIF:** solo GCODE en la cúpula (moneda `STL → gcode`, cero `.3mf`); reserva no re-slicea lo ya listo.

### 6.5 `importacion` — CONVERSOR (pieza 5)
- **DEP:** puertos inyectados `LectorSTL/LectorGCODE` (ABIERTO; `leer_stl` reutilizado por `adaptador-slicing` si aplica), `catalogo`.
- **MODULE.JSON:** name `importacion`; subscribes `importacion.importar/leer_metadatos.request`; publishes `importacion.importar.response`, `importacion.importar.failed`.
- **INDEX.JS:** CONVERSOR stateless (base técnica `ModuloHibridoReflejo` SIN `project.activated` ni `PosPersistencia`: no persiste estado, solo lee metadatos y entrega); distingue GCODE preparado (→ cúpula directo) de STL fuente (→ catálogo).
- **PROYECCIONES:** `_importar` (nombre/unidades/material sugerido/formatos por lector), `_leerMetadatos`.
- **HANDLERS RPC:** `onImportarRequest(e){ this._atender(e,'importar','importacion.importar.response', d=>this._importar(d)) }`.
- **EVENTOS:** par de fallo `importacion.importar.failed`.
- **VERIF:** entrada STL (fuente) y GCODE (preparado) con metadatos; GCODE preparado no duplica catálogo; sin estado que persistir.

### 6.6 `buscador-repositorios` — PUENTE (pieza 9)
- **DEP:** transporte `crawl4rs.buscar` (infraestructura reutilizada, NO pieza); puerto `RepositoriosPort` ABIERTO.
- **MODULE.JSON:** name `buscador-repositorios`; subscribes `buscador-repositorios.buscar.request`; publishes `buscador-repositorios.buscar.response`, `buscador-repositorios.buscar.failed`.
- **INDEX.JS:** reflejo stateless; NO inventa resultados — devuelve lo que el puerto obtiene con forma `ResultadoRepositorio` (fuente/titulo/url/autor/formatos).
- **PROYECCIONES:** `_buscar` (mapea transport → resultados tipados), `_resultadoDe`.
- **HANDLERS RPC:** `onBuscarRequest(e){ this._atender(e,'buscar','buscador-repositorios.buscar.response', d=>this._buscar(d)) }`.
- **EVENTOS:** par de fallo `buscador-repositorios.buscar.failed`.
- **VERIF:** resultados TAL CUAL (Printables/MakerWorld/Cults3D/Thingiverse); sin inventar.

### 6.7 `motor-encadenamiento` — REFLEJO (pieza 10)
- **DEP:** `ciclo-impresion` (fuente ÚNICA del disparo: `impresion.terminada`), `cola` (siguienteAImprimir).
- **MODULE.JSON:** name `motor-encadenamiento`; subscribes `motor-encadenamiento.al_terminar.request`; publishes `cola_vacia`, `motor-encadenamiento.al_terminar.failed`.
- **INDEX.JS:** reflejo puro (sin store propio).
- **PROYECCIONES:** `_alTerminar` — consume `impresion.terminada` (el ciclo marca TERMINADA y descontó filamento) → `siguiente=cola.siguienteAImprimir` → si ≠NULO `ciclo.iniciar(siguiente)` (automático); si =NULO aviso `cola_vacia`.
- **HANDLERS RPC:** `onAlTerminarRequest(e){...}`.
- **EVENTOS:** `cola_vacia` (impresora ociosa) o dispara `ciclo-impresion.iniciar.request`.
- **VERIF:** encadena solo la cabecera lista; nunca decide SI imprimir; NO re-marca terminada (lo hizo el ciclo).

### 6.8 `motor-propuesta` — REFLEJO (pieza 11)
- **DEP:** `cola`, `cupula-gcode`.
- **MODULE.JSON:** name `motor-propuesta`; subscribes `motor-propuesta.proponer.request`; publishes `motor-propuesta.proponer.response`, `motor-propuesta.proponer.failed`.
- **INDEX.JS:** reflejo puro; PROPONE (FIFO+urgencia+preferencia a preparadas, agrupación afinidad ABIERTO), NO muta.
- **PROYECCIONES:** `_proponerOrden` (URGENTE→antigüedad FIFO→preparadas→[ABIERTO afinidad]).
- **HANDLERS RPC:** `onProponerRequest(e){...}`.
- **EVENTOS:** la orden vuelve por response; el jefe aprueba vía `cola.reordenar`.
- **VERIF:** sin propuesta aprobada NO se reordena solo.

### 6.9 `ciclo-impresion` — REFLEJO / ORQUESTADOR (pieza 12)
- **DEP:** `adaptador-impresora` (REUSE), `historial`, `filamento`, `manejo-fallo`, `motor-encadenamiento`, `adaptador-avisos`.
- **MODULE.JSON:** name `ciclo-impresion`; subscribes `ciclo-impresion.iniciar/pausar/reanudar/abortar.request`; publishes `impresion.iniciada`, `impresion.fallida`, `ciclo_abortado`, `ciclo-impresion.*.failed`.
- **INDEX.JS:** máquina de estados determinista (dueño de transiciones del §5); sin store de escritura propio (estado en memoria + eventos).
- **PROYECCIONES:** `_transitar` (valida transición legal), `_onProgreso`, `_onTerminadaOk` (→ emite `impresion.terminada` = fuente ÚNICA de encadenamiento + historial + filamento), `_onFallo` (→manejo-fallo).
- **HANDLERS RPC:** `onIniciarRequest(e){...}` etc.
- **EVENTOS:** `impresion.iniciada/terminada/fallida`, `ciclo_abortado`; pares de fallo por op.
- **VERIF:** estado ilegal imposible; termina → emite `impresion.terminada` (úNICO disparo) + registra + descontar; fallo → siempre avisa.

### 6.10 `consumo` — REFLEJO (pieza 13)
- **DEP:** `historial` (media de dato MEDIDO), `filamento`.
- **MODULE.JSON:** name `consumo`; subscribes `consumo.promedio/pronostico.request`; publishes `consumo.promedio.response`, `consumo.promedio.failed`.
- **INDEX.JS:** reflejo puro; consume `impresion.registrada` para alimentar la media.
- **PROYECCIONES:** `_consumoPromedio`, `_tiempoPromedio`, `_pronosticoTanda` (CERO estimación sin muestras → NULO o pregunta al dueño, nunca conjetura).
- **HANDLERS RPC:** `onConsumoPromedioRequest(e){...}` etc.
- **EVENTOS:** par de fallo.
- **VERIF:** sin muestras del modelo → devuelve NULO; gramo/tempo REAL solo del historial.

### 6.11 `historial` — REFLEJO (pieza 14, append-only)
- **DEP:** `adaptador-avisos` (aviso opcional), `consumo` (lee la media).
- **MODULE.JSON:** name `historial`; subscribes `historial.registrar/por_modelo/recientes/borrar.request`; publishes `impresion.registrada`, `pieza.imprimida`, `historial.registrar.failed`.
- **INDEX.JS:** registro append-only (solo añade; único `borrar` permitido: asiento erróneo); store persistente por proyecto.
- **PROYECCIONES:** `_registrar` (emite `impresion.registrada` y, si OK, `pieza.imprimida`), `_porModelo`, `_recientes`, `_borrarAsiento`.
- **HANDLERS RPC:** `onRegistrarRequest(e){...}` etc.
- **EVENTOS:** `impresion.registrada` + `pieza.imprimida` (hito informativo y dato MEDIDO; NO dispara encadenamiento); par de fallo.
- **VERIF:** append-only; emite `pieza.imprimida` solo con resultado OK; el encadenamiento lo dispara `ciclo`.

### 6.12 `manejo-fallo` — REFLEJO (pieza 15)
- **DEP:** `adaptador-avisos` (avisar SIEMPRE), `adaptador-confirmacion` (SolicitudDecision para juicio ABIERTO), `motor-encadenamiento`.
- **MODULE.JSON:** name `manejo-fallo`; subscribes `manejo-fallo.manejar.request`; publishes `manejo-fallo.manejar.failed`.
- **INDEX.JS:** reflejo puro; `PoliticaFallo` (reintentos max / saltar) configurada por el dueño [ABIERTO].
- **PROYECCIONES:** `_manejar` — 1) avisar SIEMPRE · 2) política reintento limitado no superado → REINTENTAR · 3) política saltar o agotado → SALTAR (no detener) · 4) política ABIERTO → SolicitudDecision y espera.
- **HANDLERS RPC:** `onManejarRequest(e){...}`.
- **EVENTOS:** dispara `adaptador-confirmacion.confirmar.request` cuando exige juicio; par de fallo.
- **VERIF:** ningún fallo se calla; ninguna acción sin política conocida del dueño.

### 6.13 `panel-trabajador` — REFLEJO (pieza 16, rol HOY)
- **DEP:** `ciclo-impresion`, `cola`, `filamento`, `cupula-gcode`, `manejo-fallo`, `historial`.
- **MODULE.JSON:** name `panel-trabajador`; subscribes `panel-trabajador.estado_vivo/proximo_encadenar/eventos/pendientes/control.request`; publishes `panel-trabajador.estado_vivo.response`, `panel-trabajador.*.failed`.
- **INDEX.JS:** proyección de lectura + comandos que DELEGAN en el ciclo/filamento/manejo-fallo; NO decide conjunto/futuro.
- **PROYECCIONES:** `_estadoVivo`, `_proximoAEncadenar`, `_eventosRecientes`, `_pendientesConfirmacion`, `_pausar/_abortar/_reanudar` (→ ciclo), `_reintentar/_saltar` (→ manejoFallo), `_marcarCambioBobina` (→ filamento), `_confirmar` (transporta).
- **HANDLERS RPC:** `onEstadoVivoRequest(e){...}` etc.
- **EVENTOS:** par de fallo.
- **VERIF:** control HOY delega; confirmación espera respuesta del dueño.

### 6.14 `panel-jefe` — REFLEJO (pieza 17, rol FUTURO)
- **DEP:** `cola`, `ciclo-impresion`, `filamento`, `historial`, `cupula-gcode`, `consumo`, `motor-propuesta`, `adaptador-confirmacion`.
- **MODULE.JSON:** name `panel-jefe`; subscribes `panel-jefe.resumen/propuestas/aprobar_propuesta/marcar_prioridad/pedir_reposicion/ver_detalle.request`; publishes `panel-jefe.*.response`, `panel-jefe.*.failed`.
- **INDEX.JS:** proyección REFLEJO que cruza los stores (CERO juicio); se repinta con `cola.actualizada | pieza.imprimida | impresion.registrada | material.actualizado`.
- **PROYECCIONES:** `_resumen`, `_propuestas` (motor.proponer → para aprobar), `_aprobarPropuesta` (→ `cola.reordenar`, juicio del dueño), `_marcarPrioridad`, `_pedirReposicion`, `_verDetalle`.
- **HANDLERS RPC:** `onResumenRequest(e){...}` etc.
- **EVENTOS:** par de fallo.
- **VERIF:** el jefe propone/aprueba (decisión humana), el sistema transporta.

---

## 7. Qué se REUTILIZA del inventario real (resumen) y qué se evaluó y NO

### 7.1 REUTILIZAR
| Módulo real | Rol en el plano | Quién lo consume |
|---|---|---|
| `adaptador-impresora` | PUENTE a SPARKX i7 (subir_gcode/iniciar/observar_estado, interpreta a estado_sistema) — pieza 7 | ciclo-impresion |
| `adaptador-avisos` | PUENTE Telegram (envía inicio/fin/fallo/material, ack explícito, par `enviar.failed`) — pieza 8 | ciclo, filamento, manejo-fallo |
| `adaptador-confirmacion` | PUENTE confirmación humana (approve/reintentar/saltar/reponer — transporte de decisión, pieza 18 REF) | ciclo, manejo-fallo, panel-jefe, panel-trabajador |
| `adaptador-slicing` | PUENTE slicer externo (slicear STL→gcode + leer_stl) — pieza 6 (CONVERSOR aterrizado como puente) | cupula-gcode, importacion |
| `crawl4rs` | transporte de búsqueda web (SearXNG `buscar`) para `buscador-repositorios` | buscador-repositorios |
| `disenador_parametrico` | genera STL paramétrico (fuente DISEÑADO) — alimenta `importacion`/`catalogo` | importacion (opcional, no pieza) |
| `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` | base de todo reflejo + persistencia por proyecto + `project.activated` | las 14 hojas CONSTRUIR |

### 7.2 Evaluados y NO reutilizados (con motivo)
| Módulo real evaluado | Por qué NO se reutiliza |
|---|---|
| `adaptador-laser` | Otra máquina (láser), otro protocolo; rompería la vertical si se adaptara a la SPARKX. Se toma su PATRÓN de puente stateless con par de fallo (que ya encarna `adaptador-impresora`). |
| `estados` | Cúpula de listas ordenadas con freno entre pasos. La cola de impresión (FIFO+urgencia con `enImpresion` y única impresora) no es una lista de tachado libre/estricto: forzar `estados.anadir/avanzar` deformaría el dominio. La cola vive DENTRO del custodio `cola`. |
| `inventario` (prisma/restaurante) | stock_real + reservas de VENTA por pedido; el filamento es stock físico con `restante` en gramos y `enUso`, sin pedidos ni reservas. Contrato y dominio distintos; el custodio `filamento` es propio. |
| `cupulas` | Bóveda de notas-código (knowledge), no es el almacén de la MONEDA física (archivos GCODE preparados). La `cupula-gcode` custodia el gcode real, no notas. |
| `cosecha`/`cantera-semantica`/`conserje` etc. | Otras sustancias (skills/conocimiento). Cero solape con la cola de impresión. |
| `prisma/*`, `pizzepos/*`, `marketing-*` | Otras verticales (comercio, POS, marketing). El taller es uso propio, sin venta (rol CLIENTE NULO). NO se importa nada de venta. |

**Rol CLIENTE — VEREDICTO NULO:** el taller no vende. NO se crean módulos de carrito/pedidos/cobros/escaparate ni de cliente; la salida ocasional de una pieza es acto manual del dueño (decisión abierta al dueño, no se construye).

---

## 13. ESPINA enki-plan (JSON embebido — la consume construir-modulos)

```json enki-plan
{
  "proyecto": "3d",
  "proyecto_id": "3d",
  "origen": ["diseno-oop.md (FASE 3)", "esquema.md (FASE 2)"],
  "inventario": "115 modulos raiz vistos en modules/; 4 puentes 3d ya construidos (adaptador-impresora, adaptador-avisos, adaptador-confirmacion, adaptador-slicing) reutilizados; 14 hojas CONSTRUIR.",
  "regla": "modulos-isla event-driven: cada clase con estado = CUSTODIO single-writer; quien solo calcula = proyeccion interna de un REFLEJO; quien habla con el exterior = PUENTE; dependencias SOLO por evento request/response o fire-and-forget, nunca import. Moneda del dueno: STL (modelo) -> GCODE (impresion); el slicer traduce STL->gcode; NO se usa .3mf.",
  "orden": [
    "adaptador-impresora",
    "adaptador-avisos",
    "adaptador-confirmacion",
    "adaptador-slicing",
    "catalogo",
    "cupula-gcode",
    "filamento",
    "importacion",
    "historial",
    "cola",
    "buscador-repositorios",
    "consumo",
    "motor-propuesta",
    "manejo-fallo",
    "motor-encadenamiento",
    "panel-trabajador",
    "panel-jefe",
    "ciclo-impresion"
  ],
  "hojas": [
    { "slug": "adaptador-impresora", "forma": "puente", "accion": "REUTILIZAR", "reutiliza": ["adaptador-impresora"], "depende_de": [], "subscribes": ["adaptador-impresora.subir_gcode.request","adaptador-impresora.iniciar_impresion.request","adaptador-impresora.observar_estado.request"], "publishes": ["adaptador-impresora.estado_crudo","subir_gcode.failed","iniciar_impresion.failed","observar_estado.failed"], "proyecciones_internas": [{"nombre":"_interpretarEstado","descripcion":"conversor: estado crudo -> estado_sistema"}], "nota": "pieza 7 ya aterrizada" },
    { "slug": "adaptador-avisos", "forma": "puente", "accion": "REUTILIZAR", "reutiliza": ["adaptador-avisos"], "depende_de": [], "subscribes": ["adaptador-avisos.enviar.request","aviso.solicitar"], "publishes": ["adaptador-avisos.enviar.response","adaptador-avisos.enviar.failed"], "proyecciones_internas": [{"nombre":"_construirMensaje","descripcion":"template por tipo: terminado/cambio_filamento/fallo/cola_vacia/filamento_bajo"}], "nota": "pieza 8 ya aterrizada (ack explicito)" },
    { "slug": "adaptador-confirmacion", "forma": "puente", "accion": "REUTILIZAR", "reutiliza": ["adaptador-confirmacion"], "depende_de": [], "subscribes": ["adaptador-confirmacion.confirmar.request","telegram.callback.received"], "publishes": ["adaptador-confirmacion.confirmar.response","adaptador-confirmacion.confirmacion_recibida","adaptador-confirmacion.confirmar.failed"], "proyecciones_internas": [{"nombre":"_interpretarConfirmacion","descripcion":"map boton->tipo; transporta la decision del dueno, no la decide"}], "nota": "soporta la confirmacion humana (pieza 18 REF)" },
    { "slug": "adaptador-slicing", "forma": "puente", "accion": "REUTILIZAR", "reutiliza": ["adaptador-slicing"], "depende_de": [], "subscribes": ["adaptador-slicing.slicear.request","adaptador-slicing.leer_stl.request"], "publishes": ["adaptador-slicing.slicear.response","adaptador-slicing.leer_stl.response","adaptador-slicing.slicear.failed"], "proyecciones_internas": [], "nota": "pieza 6 (CONVERSOR slicer) aterrizada como puente stateless: slicer STL -> gcode (moneda del dueno, cero .3mf) y lector STL" },
    { "slug": "catalogo", "forma": "custodio", "accion": "CONSTRUIR", "reutiliza": ["_shared/pos-persistencia"], "depende_de": [], "subscribes": ["catalogo.registrar.request","catalogo.por_id.request","catalogo.actualizar.request","catalogo.listar.request"], "publishes": ["modelo.registrado","catalogo.registrar.failed","catalogo.actualizar.failed"], "proyecciones_internas": [{"nombre":"_registrar","descripcion":"reconcilia ANTES de crear (nombre canonico+fuente+origenUrl): NO duplica"}] },
    { "slug": "cupula-gcode", "forma": "custodio", "accion": "CONSTRUIR", "reutiliza": ["_shared/pos-persistencia"], "depende_de": ["importacion","adaptador-slicing"], "subscribes": ["cupula-gcode.registrar.request","cupula-gcode.marcar_consumido.request","cupula-gcode.listos.request","cupula-gcode.reserva.request","cupula-gcode.obtener.request"], "publishes": ["archivo.preparado","cupula-gcode.registrar.failed","cupula-gcode.marcar_consumido.failed"], "proyecciones_internas": [{"nombre":"_reserva","descripcion":"proxima tanda lista que alimenta la cola; no re-slicea lo preparado"}] },
    { "slug": "filamento", "forma": "custodio", "accion": "CONSTRUIR", "reutiliza": ["_shared/pos-persistencia"], "depende_de": ["historial"], "subscribes": ["filamento.registrar.request","filamento.descontar.request","filamento.cambiar.request","filamento.evaluar.request"], "publishes": ["material.actualizado","material.bajo","filamento.descontar.failed","filamento.cambiar.failed"], "proyecciones_internas": [{"nombre":"_descontar","descripcion":"solo con gramo MEDIDO del historial; cero estimacion"}, {"nombre":"_evaluarUmbral","descripcion":"resta<umbral -> material.bajo (avisa, no decide)"}] },
    { "slug": "cola", "forma": "custodio", "accion": "CONSTRUIR", "reutiliza": ["_shared/pos-persistencia"], "depende_de": ["cupula-gcode"], "subscribes": ["cola.encolar.request","cola.reordenar.request","cola.marcar_urgente.request","cola.cancelar.request","cola.siguiente.request","cola.imprimiendo.request","cola.terminada.request"], "publishes": ["cola.actualizada","cola.encolar.failed","cola.cancelar.failed"], "proyecciones_internas": [{"nombre":"_siguienteAImprimir","descripcion":"cabecera YA preparada en la cupula; una sola impresora a la vez"},{"nombre":"_reordenar","descripcion":"aplica orden PROPUESTA por motor-propuesta SOLO si el jefe la aprobo; jamas reordena por su cuenta (flecha invertida: motor-propuesta depende de cola, no al reves)"}] },
    { "slug": "importacion", "forma": "conversor", "accion": "CONSTRUIR", "reutiliza": [], "depende_de": ["catalogo"], "subscribes": ["importacion.importar.request","importacion.leer_metadatos.request"], "publishes": ["importacion.importar.response","importacion.leer_metadatos.response","importacion.importar.failed"], "proyecciones_internas": [{"nombre":"_leerMetadatos","descripcion":"CONVERSOR stateless (ModuloHibridoReflejo SIN PosPersistencia ni project.activated); nombre/unidades/material sug/formatos por lector (STL/GCODE); GCODE preparado -> cupula, STL fuente -> catalogo; sin estado que persistir"}] },
    { "slug": "buscador-repositorios", "forma": "puente", "accion": "CONSTRUIR", "reutiliza": ["crawl4rs"], "depende_de": [], "subscribes": ["buscador-repositorios.buscar.request"], "publishes": ["buscador-repositorios.buscar.response","buscador-repositorios.buscar.failed"], "proyecciones_internas": [{"nombre":"_buscar","descripcion":"NO inventa resultados; devuelve ResultadoRepositorio (fuente/titulo/url/autor/formatos) TAL CUAL del puerto"}] },
    { "slug": "historial", "forma": "reflejo", "accion": "CONSTRUIR", "reutiliza": ["_shared/pos-persistencia"], "depende_de": [], "subscribes": ["historial.registrar.request","historial.por_modelo.request","historial.recientes.request","historial.borrar.request"], "publishes": ["impresion.registrada","pieza.imprimida","historial.registrar.failed"], "proyecciones_internas": [{"nombre":"_registrar","descripcion":"append-only; emite pieza.imprimida solo con resultado OK; hito informativo y dato MEDIDO, NO dispara encadenamiento (lo dispara ciclo)"}] },
    { "slug": "consumo", "forma": "reflejo", "accion": "CONSTRUIR", "reutiliza": [], "depende_de": ["historial"], "subscribes": ["consumo.promedio.request","consumo.pronostico.request"], "publishes": ["consumo.promedio.response","consumo.pronostico.response","consumo.promedio.failed"], "proyecciones_internas": [{"nombre":"_pronosticoTanda","descripcion":"CERO estimacion sin muestras; devuelve NULO o pregunta al dueno"}] },
    { "slug": "motor-propuesta", "forma": "reflejo", "accion": "CONSTRUIR", "reutiliza": [], "depende_de": ["cola","cupula-gcode"], "subscribes": ["motor-propuesta.proponer.request"], "publishes": ["motor-propuesta.proponer.response","motor-propuesta.proponer.failed"], "proyecciones_internas": [{"nombre":"_proponerOrden","descripcion":"URGENTE->FIFO->preparadas->[ABIERTO afinidad]; PROPUESTA, no muta; sin aprobacion del jefe no se reordena"}] },
    { "slug": "manejo-fallo", "forma": "reflejo", "accion": "CONSTRUIR", "reutiliza": [], "depende_de": ["adaptador-avisos","adaptador-confirmacion","motor-encadenamiento"], "subscribes": ["manejo-fallo.manejar.request"], "publishes": ["manejo-fallo.manejar.failed"], "proyecciones_internas": [{"nombre":"_manejar","descripcion":"avisa siempre; REINTENTAR/SALTAR segun politica ABIERTO; ESPERAR_DECISION si exige juicio (SolicitudDecision)"}] },
    { "slug": "motor-encadenamiento", "forma": "reflejo", "accion": "CONSTRUIR", "reutiliza": [], "depende_de": ["ciclo-impresion","cola"], "subscribes": ["motor-encadenamiento.al_terminar.request"], "publishes": ["cola_vacia","motor-encadenamiento.al_terminar.failed"], "proyecciones_internas": [{"nombre":"_alTerminar","descripcion":"fuente UNICA del disparo: consume impresion.terminada (el ciclo marca TERMINADA y descontio filamento) -> siguiente=cola.siguienteAImprimir; si <> NULO ciclo.iniciar (auto); si NULO aviso cola_vacia; no re-marca terminada"}] },
    { "slug": "panel-trabajador", "forma": "reflejo", "accion": "CONSTRUIR", "reutiliza": [], "depende_de": ["ciclo-impresion","cola","filamento","cupula-gcode","manejo-fallo","historial"], "subscribes": ["panel-trabajador.estado_vivo.request","panel-trabajador.proximo_encadenar.request","panel-trabajador.eventos.request","panel-trabajador.pendientes.request","panel-trabajador.control.request"], "publishes": ["panel-trabajador.estado_vivo.response","panel-trabajador.control.failed"], "proyecciones_internas": [{"nombre":"_control","descripcion":"pausar/abortar/reanudar/reintentar/saltar/cambio bobina/confirmar -> DELEGAN en ciclo/filamento/manejo-fallo; HOY, no decide futuro"}] },
    { "slug": "panel-jefe", "forma": "reflejo", "accion": "CONSTRUIR", "reutiliza": [], "depende_de": ["cola","ciclo-impresion","filamento","historial","cupula-gcode","consumo","motor-propuesta","adaptador-confirmacion"], "subscribes": ["panel-jefe.resumen.request","panel-jefe.propuestas.request","panel-jefe.aprobar_propuesta.request","panel-jefe.marcar_prioridad.request","panel-jefe.pedir_reposicion.request","panel-jefe.ver_detalle.request"], "publishes": ["panel-jefe.resumen.response","panel-jefe.aprobar_propuesta.failed"], "proyecciones_internas": [{"nombre":"_resumen","descripcion":"cruza los stores; CERO juicio; se repinta con cola.actualizada|pieza.imprimida|impresion.registrada|material.actualizado"}] },
    { "slug": "ciclo-impresion", "forma": "reflejo", "accion": "CONSTRUIR", "reutiliza": [], "depende_de": ["adaptador-impresora","historial","filamento","manejo-fallo","motor-encadenamiento","adaptador-avisos"], "subscribes": ["ciclo-impresion.iniciar.request","ciclo-impresion.pausar.request","ciclo-impresion.reanudar.request","ciclo-impresion.abortar.request"], "publishes": ["impresion.iniciada","impresion.terminada","impresion.fallida","ciclo_abortado","ciclo-impresion.iniciar.failed","ciclo-impresion.abortar.failed"], "proyecciones_internas": [{"nombre":"_transitar","descripcion":"maquina de estados determinista; una sola impresora -> nunca dos en IMPRIMIENDO; TERMINADA emite impresion.terminada (fuente UNICA de encadenamiento) + registra + descontar; fallo/abortado siempre avisa"}] }
  ]
}
```
