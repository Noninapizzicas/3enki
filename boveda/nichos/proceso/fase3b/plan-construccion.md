# PLAN DE CONSTRUCCIÓN — Sistema "Nichos Autónomos" (Fase 3b · ADAPTADOR)

> **Proyecto:** nichos (vertical "Nichos Autónomos")
> **Fase:** 3b · ADAPTADOR (traducir diseño OOP -> módulos-isla event-driven Enki)
> **Fecha:** 2026-09-24
>
> **Fuentes:**
> - `fase3/diseno-oop.md` — FASE 3 · PLASMA: 44 clases OOP con su FORMA (REFLEJO / MICRO-AGENTE /
>   CUSTODIO / CONVERSOR / PUENTE), eslabón limitante F2-validación expandido (C1…C7), puertos
>   abiertos, decisiones humanas vía `SolicitudDecision`.
> - `fase2/esquemas/esquema.md` — FASE 2: árbol de piezas A-G, H-J interlocutores, K-L-M roles, con
>   la forma de cada una (innegociable).
> - **Inventario REAL de Enki:** 198 módulos reales consultados en `/tmp/inventario-modulos-enki.json`
>   (se juzga por el `module.json` real — name/desc/subscribes/publishes — no por el nombre).
> - Patrones vivos: `arquitectura/cabecera/patron/modulo-real.md` y `.../modulo-hibrido.md`.

---

## 1 · Reglas de traducción aplicadas

| Clase OOP | Traducción Enki |
|---|---|
| CLASE con estado | módulo **CUSTODIO** (single-writer de su store) |
| CLASE que solo calcula | **PROYECCIÓN INTERNA** del módulo que la usa (jamás `_shared/`) |
| CLASE que orquesta | módulo **MICRO-AGENTE / ORQUESTADOR** |
| CLASE que habla con el exterior | módulo **PUENTE** |
| Dependencia entre clases | **EVENTO request/response**, nunca import |
| Lógica de negocio | dentro del módulo como proyección `_op`; `_shared/` SOLO infraestructura |

- Formas de hoja: `reflejo | custodio | conversor | puente | micro-agente`.
- Acciones: `CONSTRUIR | ADAPTAR | REUTILIZAR`. Cada `CONSTRUIR` justifica por qué no reutiliza.
- La forma de cada pieza viene del esquema F2 / diseño F3 — **no se negocia**.
- Tópicos del bus en **ASCII** (sin tildes/ñ). Todo flujo cierra su círculo con su par `*.failed`.
- **Puerto ABIERTO** (F0): Telegram es UNA implementación de `canal-supervision` (G1), nunca el
  portador; las fuentes y plataformas de cobro se declaran/reemplazan por evento; el `SolicitudDecision`
  se arma y entrega, NUNCA lo resuelve el sistema.

## 2 · Inventario: qué se REUTILIZA vs ADAPTA vs CONSTRUYE

> Del inventario real de 198 módulos salen **7 REUTILIZAR** de infraestructura/otro dominio que encajan
> por su contrato real. **0 ADAPTAR**: toda entidad de Nichos Autónomos tiene forma propia (del esquema
> F2) y NO existe un módulo con ese pattern Y ese dominio Y PosPersistencia per-proyecto — los que "se
> parecen" (ciclo-impresion, manejo-fallo, redactor, sonda/banco/evaluador/reloj del radar) son de otro
> dominio o de una iteración previa del radar MÚSICA (no nichos), romperían su proyecto si se ADAPTAN;
> por eso se toma su **patrón** y se justifica el CONSTRUIR. **44 CONSTRUIR** (las 44 clases de la fase 3).

### 2.1 — Hojas REUTILIZAR (7) — infraestructura / órganos compartidos

| slug | forma | rol |
|---|---|---|
| `scheduler` | reflejo | Motor cron/intervalo que dispara los ciclos del pipeline (L1). |
| `crawl4rs` | puente | Órgano web (obscura, Rust) — barrido de fuentes para B1/J1. |
| `filesystem` | reflejo | Base shared: stores leen/escriben via su reflejo. |
| `project-manager` | reflejo | Lifecycle del proyecto; PosPersistencia se scopea por `project_id`. |
| `telegram-bridge` | puente | Implementación del PuertoCanal (G1) en el sitio de despliegue. |
| `memoria-nicho` | custodio | Sustrato shared del historial real de señales/resultados (L4, C7). |
| `gestor-credenciales-nicho` | puente | Autoaprovisiona credenciales de fuentes/plataformas (J1). |

Razón de REUTILIZAR (no CONSTRUIR): su `module.json` real entrega exactamente el contrato que la pieza
necesita con PosPersistencia per-proyecto, sin riesgo de romper su proyecto de origen.

---

## 3 · Contrato de eventos (quién pide / quién responde + fire-and-forget con par de fallo)

### 3.1 — Pares request/response (RPC del bus)

| Quién pide (publishes .request) | Quién responde (subscribes .request -> .response) | Contrato |
|---|---|---|
| `canal-supervision` (G1/G3) / `clasificador-intencion` | `captura-semilla.aceptar` | Mensaje -> Semilla capturada / `captura-semilla.aceptar.failed` |
| `captura-semilla` | `normalizacion-semilla.normalizar` | Semilla -> intenciones / `.normalizar.failed` |
| `crawl4rs` (reutil) | `sondeo-territorio.sondear` | intenciones+fuentes -> candidatos / `.sondear.failed` |
| `sondeo-territorio` | `reglas-exclusion.excluir` | candidato -> excluido:bool / `.excluir.failed` |
| `puerto-fuente-datos` | `estudio-demanda.medir` | candidato+fuentes -> métricas+conclusión / `.medir.failed` |
| `puerto-fuente-datos` | `conversor-fuente.convertir` | fuenteBruta -> datos homogéneos / `.convertir.failed` |
| `estudio-demanda` / `criterio-viabilidad` | `veredicto-viabilidad.evaluar` | estudio+criterio -> VIABLE\|NO_VIABLE\|PUENTE / `.evaluar.failed` |
| `veredicto-viabilidad` | `corte-temprano.evaluar` | veredicto -> PasaAConstruccion:bool / `.evaluar.failed` |
| `criterio-viabilidad` | `ajustador-umbrales.retunear` | nuevo umbral -> aplicado/ajustado / `.retunear.failed` |
| `veredicto-viabilidad` + `catalogo-capacidades` | `camino-encontrar-construir.decidir` | nicho -> ENCONTRAR\|CONSTRUIR\|PUENTE / `.decidir.failed` |
| `cola-candidatos` | `batch-validacion.programar` | lote -> List<Veredicto> / `.programar.failed` |
| `registro-cobros` | `motor-cobro.ejecutar` | importe+pagador -> Cobro(EFECTIVO\|COMPROMETIDO) / `.ejecutar.failed` |
| `cuadro-salud-financiera` | `imputacion-costes.agregar` | costes -> CosteProyecto / `.agregar.failed` |
| `cuadro-salud-financiera` | `vista-portafolio.guardar` | vista agregada -> guardada / `.guardar.failed` |

### 3.2 — Fire-and-forget + par de fallo (todo cierra su círculo)

| Evento de dominio | Emisor | Consumidores | Par de fallo |
|---|---|---|---|
| `nichos.semilla.capturada` | captura-semilla | normalizacion-semilla, pipeline | `nichos.semilla.aceptar.failed` |
| `nichos.semilla.normalizada` | normalizacion-semilla | sondeo-territorio, pipeline | `nichos.semilla.normalizar.failed` |
| `nichos.territorio.sondeado` / `nichos.candidato.encontrado` | sondeo-territorio | reglas-exclusion, cola-candidatos, pipeline | `nichos.territorio.sondear.failed` |
| `nichos.candidato.excluido` | reglas-exclusion | cola-candidatos, pipeline | `nichos.reglas.excluir.failed` |
| `nichos.estudio.medido` | estudio-demanda | veredicto-viabilidad, pipeline | `nichos.estudio.medir.failed` |
| `nichos.veredicto.emitido` | veredicto-viabilidad | corte-temprano, pipeline | `nichos.veredicto.evaluar.failed` |
| `nichos.corte.aplicado` | corte-temprano | pipeline (CORTADO, no avanza) | `nichos.corte.evaluar.failed` |
| `nichos.camino.decidido` | camino-encontrar-construir | ensamblador-solucion, pipeline | `nichos.camino.decidir.failed` |
| `nichos.solucion.construida` | ensamblador-solucion | proponedor/modelo, pipeline | `nichos.solucion.construir.failed` |
| `nichos.cobro.ejecutado` | motor-cobro | registro-cobros, reglas-aprendidas, pipeline | `nichos.cobro.ejecutar.failed` |
| `nichos.cobro_registrado` | registro-cobros | cuadro-salud-financiera | `nichos.cobro.registrar.failed` |
| `nichos.coste_imputado` | imputacion-costes | cuadro-salud-financiera | `nichos.coste.agregar.failed` |
| `nichos.salud.actualizada` | cuadro-salud-financiera | reglas-aprendidas(C7), alerta-sangria(F4), vista-portafolio(K1), pulso-avance | `nichos.salud.actualizar.failed` |
| `nichos.umbral.recalibrado` | reglas-aprendidas | criterio-viabilidad(C2) | `nichos.reglas.recalibrar.failed` |
| `nichos.gate.solicitado` / `nichos.puente_solicitado` / `nichos.alerta.sangria` | gate(E2)/puente-humano(D2)/alerta(F4) | cola-decisiones-gate(K2) | `nichos.gate.solicitar.failed` / `nichos.puente.solicitar.failed` / `nichos.alerta.monitorear.failed` |
| `nichos.canal.envio_fallido` | canal-supervision | manejo-fallo(L3) | `nichos.canal.enviar.failed` |
| `nichos.pipeline.avanzar.failed` | pipeline-por-nicho | canal-supervision (alerta/supervisión) | — (flujo maestro) |

---

## 4 · Máquina de estados

```
SEMILLA --(A1/A2)--> BUSCADO --(B1/B2/B3 + L2)-- [colas] --> VALIDANDO(embudo C)
  VALIDANDO --(C1/C2/C3)--> VALIDADO --(C4/C6)--> CONSTRUIDO
  VALIDANDO --(C6: NO_VIABLE)--> CORTADO          (estado ilegal: VALIDADO sin haber pasado C3/C6)
  CONSTRUIDO --(D1/D2/D3/D4)--> OPERANDO
  OPERANDO --(E1/E2 gate APRUEBA)--> COBRANDO
  OPERANDO --(E2 RECHAZA)--> OPERANDO_EN_ESPERA   (SolicitudDecision expira y se re-pregunta)
  COBRANDO --(E3 cobro EFECTIVO)--> EN_CAJA
  COBRANDO --(no llega a caja con control)--> SANGRA
  EN_CAJA / SANGRA (F1/F2/F3) ==> alimentan C7 (recalibra umbral) y K1 (portafolio)
```
- **Dueño de la máquina:** `pipeline-por-nicho` (L1, CUSTODIO) consume eventos de dominio ajenos y
  aplica las transiciones; ningún otro módulo muta el estado del nicho (REGLA del agregado Nicho).
- **Estado ilegal imposible:** no existe `EN_CAJA` o `CONSTRUIDO` sin pasar por su precedente; el
  corte `C6` impide `NO_VIABLE -> CONSTRUIDO` (corte DURO determinista).

---

## 5 · Flujos principales

### 5.1 — Flujo maestro `semilla -> buscador -> validación[embudo] -> constructor -> operar-cobrar -> salud`
```
1. [A1 captura-semilla] canal recibe la semilla -> accept -> emite nichos.semilla.capturada.
2. [A2 normalizacion-semilla] desambigua intenciones -> nichos.semilla.normalizada.
3. [B1 sondeo-territorio] barre fuentes (via puerto-fuente-datos/conversor-fuente) y juzga
   territorio; [B2 reglas-exclusion] descarta falsos positivos previos.
4. [B3 perfil-limite-busqueda] respeta los límites declarados (un solo escritor: el dueño).
5. -> [L2 cola-candidatos] encola candidatos -> [C5 batch-validacion] toma lote en paralelo.
6. [EMBUDO C - el cuello]: [C1 estudio-demanda] mide 1er orden + disposición a pagar;
   [C7->C2] recalibra umbral con resultados reales; [C3 veredicto-viabilidad] evalúa contra
   [C2 criterio-viabilidad] -> VIABLE|NO_VIABLE|PUENTE; [C4 camino-encontrar-construir] decide
   ENCONTRAR|CONSTRUIR|PUENTE (riesgo declarado); [C6 corte-temprano] NO_VIABLE -> CORTADO.
   Viables entran al tramo caro con control; cortados no sangran (protege F3).
7. [D1 ensamblador-solucion] materializa (ejecución reflejo determinista) + [D3 catalogo-capacidades]
   (invariante: se crea lo que falta); [D4 proponedor-modelo-cobro] propone modelo.
   Bloqueo sin alternativa -> [D2 puente-humano] SolicitudDecision por evento.
8. [E1 estudio-competencia] se corre ANTES del gate -> alimenta el paquete.
9. [E2 gate-decision-operar] arma paquete-cerrado y solicita decisión (SolicitudDecision).
   Aprobado -> [E3 motor-cobro] ejecuta/registra y [E4 canal-distribucion] entrega al pagador.
10. [F1 registro-cobros] asienta append-only; [F2 imputacion-costes] agrega costes;
    [F3 cuadro-salud-financiera] declara GENERA|SANGRA|NEUTRO + flujo a caja.
    [F4 alerta-sangria] cruza techo -> SolicitudDecision.
11. [BUCLES] F3 retroalimenta C7 (recalibra umbral) y K1 (vista agregada del jefe);
    G2/G1 entregan el pulso/alertas al canal de supervisión.
```

### 5.2 — Bucle `resultados-reales -> reglas-aprendidas -> validador` (C7 -> C2)
```
[F1/F3] reportan resultado real por nicho (COBRÓ|SANGRA|NEUTRO) + métricas reales
  -> [C7 reglas-aprendidas] compara umbral contra resultado, calcula delta
  -> [C2 criterio-viabilidad] recalibra umbral vigente (autorizado: bucle de sistema + visto
     bueno del jefe via K3, según [ABIERTO] #10)
  -> el siguiente lote de [C1/C3] evalúa contra el umbral refinado.
REGLA: cada proyecto que cobra o sangra RECALIBRA el criterio; la "experiencia" F0 se vuelve un
embudo auto-afinado gobernado por dato real, no intuición.
```

### 5.3 — Decisión humana (SolicitudDecision) — el sistema NUNCA resuelve
| # | Punto | Pieza | Qué decide el dueño |
|---|---|---|---|
| 1 | Gate de operar | E2 (puente) | APRUEBA/RECHAZA operar un nicho construido |
| 2 | Puente humano | D2 (puente) | construye a mano / autoriza / decide dejar |
| 3 | Corte/alerta de sangría | F4 (puente) | mata el proyecto / lo mantiene a pérdida consciente |
| 4 | Camino construir de alto riesgo | C4 (micro-agente) | ¿construye sin visto bueno previo? |
| 5 | Modelo de cobro | D4 (micro-agente) | confirma o corrige el modelo |
| 6 | Ajuste de umbral/criterio | K3 (custodio) | retunea el criterio en caliente |
| 7 | Configuración declarable | B3, C2, H2, I1 | declara límites/cadencia/contratos |

Todas viajan por `SolicitudDecision` (PENDIENTE->RESUELTA|EXPIRADA); vencida sin resolver se
re-pregunta, nunca se asume.

---

## 6 · Hojas CONSTRUIR (44) — plantilla de 7 etapas

> Cada hoja CONSTRUIR justifica por qué no reutiliza: o no existe módulo con ese patrón en el dominio
> nichos+PosPersistencia per-proyecto, o el "parecido" es de otro dominio/iteración y ADAPTARlo
> rompería su proyecto. El patrón (reflejo/blueprint + ModuloHibridoReflejo + PosPersistencia) se toma
> prestado de `_shared` y de las instancias vivas del patrón.

### A1 · `captura-semilla` — reflejo (CONSTRUIR)
```
A. DEPENDENCIAS: _shared/modulo-hibrido-reflejo + filesystem + project-manager (project.activated).
B. MODULE.JSON: name:"captura-semilla"; subscribes:[nichos.semilla.aceptar.request, project.activated];
   publishes:[nichos.semilla.capturada, nichos.semilla.aceptar.failed].
C. INDEX.JS: class CapturaSemilla extends ModuloHibridoReflejo; onAcceptRequest =
   _atender(e,'aceptar','nichos.semilla.aceptar.response',d=>this._aceptar(d)); no persiste estado.
D. PROYECCIONES: _aceptar(mensaje) -> {status,data} valida vacíos/formato (test lo afirma);
   _formatear(mensaje) -> Semilla normalizada.
E. HANDLERS: onAcceptRequest -> _atender; onUnload flush (no store).
F. EVENTOS: publica nichos.semilla.capturada (+ failed determinista).
VERIFICACIÓN: ficheros en disco + smoke accept(ok)/accept(vacío)->failed + test del reflejo.
NO REUTILIZA: ninguna clase con estado de nicho existe en el inventario para el dominio nichos.
```

### A2 · `normalizacion-semilla` — micro-agente (CONSTRUIR)
```
A. DEPENDENCIAS: _shared/modulo-hibrido-reflejo + captura-semilla (RPC).
B. MODULE.JSON: name:"normalizacion-semilla"; subscribes:[nichos.semilla.normalizar.request];
   publishes:[nichos.semilla.normalizada, nichos.semilla.normalizar.failed].
C. INDEX.JS: híbrido — reflejo para _normalizarEstructura; blueprint/LLM para _desambiguar.
D. PROYECCIONES: _desambiguar(seed)->List<Intencion> (fuzzy); _normalizarEstructura(seed)->Semilla (mecánico).
E. HANDLERS: onNormalizarRequest -> _atender.
F. EVENTOS: nichos.semilla.normalizada (+ failed).
VERIFICACIÓN: híbrido; smoke normalizar una palabra multi-sentido -> N intenciones.
NO REUTILIZA: el juicio de desambiguación es de dominio nichos; no hay conversor equivalente.
```

### B1 · `sondeo-territorio` — micro-agente (CONSTRUIR)
```
A. DEPENDENCIAS: + normalizacion-semilla, puerto-fuente-datos, gestion-limites-fuente (RPC).
B. MODULE.JSON: name:"sondeo-territorio"; subscribes:[nichos.territorio.sondear.request];
   publishes:[nichos.territorio.sondeado, nichos.candidato.encontrado, nichos.territorio.sondear.failed].
C. INDEX.JS: híbrido; reflejo _barrerFuentes (parsea dataset crudo), blueprint _juzgarTerritorio.
D. PROYECCIONES: _barrerFuentes(intenciones)->DatasetBruto (reflejo, consume fuentes via J1);
   _juzgarTerritorio(dataset)->List<Candidato> (juicio); _proponerSiguientes(candidatos).
E. HANDLERS: onSondearRequest -> _atender.
F. EVENTOS: nichos.candidato.encontrado (-> cola-candidatos L2) + failed.
VERIFICACIÓN: smoke con fuente falsa (stub J1) y fuente real; candidatos no vacíos si hay demanda.
NO REUTILIZA: radar-fuente es de la vertical MÚSICA/radar, otro dominio -> se toma su patrón de barrido
y se CONSTRUYE para nichos.
```

### B2 · `reglas-exclusion` — micro-agente (CONSTRUIR)
```
A. DEPENDENCIAS: + sondeo-territorio, memoria-nicho (historial de falsos positivos).
B. MODULE.JSON: subscribes:[nichos.reglas.excluir.request]; publishes:[nichos.candidato.excluido, ...failed].
C/D. _aprenderDeCorridas(historial)->Reglas (blueprint/juicio); _aplicar(territorio)->excluido:bool.
E/F. Handler _atender; publica nichos.candidato.excluido.
VERIFICACIÓN: dado 1 fp previo, mismo candidato -> excluido=true.
NO REUTILIZA: evaluador del radar dictamina con 6 criterios fijos; nichos aprende de corridas reales.
```

### B3 · `perfil-limite-busqueda` — custodio (CONSTRUIR)
```
A. DEPENDENCIAS: + PosPersistencia + project-manager (project.activated).
B. MODULE.JSON: subscribes:[nichos.limite.leer.request, nichos.limite.declarar.request, project.activated].
C. INDEX.JS: custodio con PosPersistencia; onProjectActivated restaura; un solo escritor (DUEÑO).
D. PROYECCIONES: _leer()->LimitesBusqueda; _declarar(limites) con guard Rol=DUEÑO.
F. EVENTOS: nichos.limite.declarado (+ failed si otro escribe).
VERIFICACIÓN: guard de escritor; second-writer rechazado.
NO REUTILIZA: no existe store de límites de búsqueda per-proyecto en nichos.
```

### C1 · `estudio-demanda` — micro-agente (CONSTRUIR)
```
A. DEPENDENCIAS: + puerto-fuente-datos, conversor-fuente, gestion-limites-fuente.
B/C. Híbrido: _medirDemanda1erOrden + _medirDisposicionAPagar (reflejo, numeros declarados),
     _redactarConclusionMercado (juicio LLM).
D/E/F: Handler onMedirRequest; publica nichos.estudio.medido (+ failed).
VERIFICACIÓN: fuente inexistente -> se autoriza/crea (invariante J), no inventa números.
NO REUTILIZA: estudio de mercado de nichos no existe; conversor-fuente es la frontera (reutilizada).
```

### C2 · `criterio-viabilidad` — custodio (CONSTRUIR)
```
A/B/C: POSPersistencia; subscribes:[nichos.criterio.leer/declarar.request, nichos.umbral.recalibrado,
       project.activated]; un solo escritor (DUEÑO via K3).
D. PROYECCIONES: _declararUmbral(duenyo, umbral) store declarado (base 50-300 EUR/semana, [ABIERTO] por
   tipo); _leerVigente(nicho)->Umbral; _recalibrar(delta de C7) -> refina umbral.
F. EVENTOS: nichos.criterio.declarado / nichos.criterio.recalibrado (+ failed).
VERIFICACIÓN: guard escritor; el corte DURO "no viable no pasa" vive aquí + C6, no en el agente.
NO REUTILIZA: no existe criterio de viabilidad declarable per-proyecto en nichos.
```

### C3 · `veredicto-viabilidad` — micro-agente (CONSTRUIR)
```
A/B/C: híbrido; _evaluar(estudio, criterio)->VIABLE|NO_VIABLE|PUENTE (juicio asistido).
D/E/F: Handler; publica nichos.veredicto.emitido (+ failed).
VERIFICACIÓN: estudio>=umbral -> VIABLE; <umbral -> NO_VIABLE; el corte lo aplica C6.
NO REUTILIZA: evaluador del radar usa criterios fijos de otra vertical; veredicto de nichos es asistido.
```

### C4 · `camino-encontrar-construir` — micro-agente (CONSTRUIR)
```
A/B/C: _decidirCamino(nicho)->ENCONTRAR|CONSTRUIR|PUENTE (juicio, riesgo declarado).
D/E/F: riesgo alto -> _subirRiesgo() emite SolicitudDecision (D2/K2); publica nichos.camino.decidido.
VERIFICACIÓN: nicho sin capacidad -> ENCONTRAR; con riesgo alto -> sube decisión, no decide solo.
NO REUTILIZA: conserje del LibroDeCapacidades es de otro dominio (comercio); patrón prestado.
```

### C5 · `batch-validacion` — reflejo (CONSTRUIR)
```
A. DEPENDENCIAS: + cola-candidatos (L2), estudio-demanda, veredicto-viabilidad (RPC).
D. PROYECCIONES: _programar(lote)->loteEnEjecucion; _ejecutarEnParalelo(lote)->List<Veredicto>.
F: publica nichos.batch.lote_ejecutado (+ failed).
VERIFICACIÓN: desacopla el cuello; N nichos en paralelo, no en serie.
NO REUTILIZA: no existe batch de validación de nichos.
```

### C6 · `corte-temprano` — reflejo (CONSTRUIR)
```
D. PROYECCIONES: _evaluar(veredicto)->PasaAConstruccion:bool; regla: NO_VIABLE -> no avanza a F3.
F: publica nichos.corte.aplicado (+ failed).
VERIFICACIÓN: corte DURO determinista; un NO_VIABLE NUNCA llega a CONSTRUIDO.
NO REUTILIZA: corte temprano de nichos no existe (ciclo-impresion corta otro dominio).
```

### C7 · `reglas-aprendidas` — micro-agente (CONSTRUIR)
```
A. DEPENDENCIAS: + criterio-viabilidad, registro-cobros, cuadro-salud-financiera, memoria-nicho.
D. PROYECCIONES: _comparar(umbral, resultadosReales)->Delta (juicio); _recalibrar(umbral,delta)->
   UmbralRefinado -> C2 en caliente. Consume nichos.salud.actualizada (COBRÓ|SANGRA|NEUTRO).
F: publica nichos.umbral.recalibrado (+ failed).
VERIFICACIÓN: dado un COBRÓ con métricas, el umbral se recalibra y el siguiente lote usa el refinado.
NO REUTILIZA: destilador aprende skills, no umbrales de validación de nichos.
```

### D1 · `ensamblador-solucion` — micro-agente (CONSTRUIR)
```
A. DEPENDENCIAS: + camino-encontrar-construir, catalogo-capacidades.
D. PROYECCIONES: _decidirQueConstruir(nicho)->Especificacion (juicio); _ejecutarMontaje(espec)->
   SolucionOperable (reflejo determinista).
F: publica nichos.solucion.construida (+ failed). VERIFICACIÓN: ejecución es reflejo, decisión es LLM.
NO REUTILIZA: generador de soluciones de nichos no existe en inventario.
```

### D2 · `puente-humano` — puente (CONSTRUIR)
```
A. DEPENDENCIAS: + canal-supervision, cola-decisiones-gate.
D. PROYECCIONES: _detectarBloqueo(construir)->ok; _emitirSolicitud -> SolicitudDecision a K2/G1.
F: publica nichos.puente_solicitado (+ failed). VERIFICACIÓN: EXCEPCIÓN, no flujo normal.
NO REUTILIZA: D2 es el tapón humano de Nichos; manejo-fallo/adaptador-avisos son de otro dominio.
```

### D3 · `catalogo-capacidades` — custodio (CONSTRUIR)
```
A/B/C: PosPersistencia; un solo dueño escribe; INVARIANTE: si falta capacidad, se crea.
D. PROYECCIONES: _consultar(nicho)->CapacidadesDisponibles; _declararFaltante(capacidad).
F: publica nichos.capacidad.faltante_declarado (+ failed).
VERIFICACIÓN: capacidad faltante se crea (no hueco muerto).
NO REUTILIZA: catálogos (catalogo 3D, composicion-manager) son de otros dominios.
```

### D4 · `proponedor-modelo-cobro` — micro-agente (CONSTRUIR)
```
A. DEPENDENCIAS: + ensamblador-solucion, estudio-competencia.
D. PROYECCIONES: _proponerModelo(nicho)->ModeloCobro (susc|empresa|transaccional|[ABIERTO]).
F: publica nichos.modelo_cobro.propuesto (+ failed). Confirmado por el gate E2, no impuesto.
NO REUTILIZA: pago-gateway es el LÍDER de pago genérico (se llama por RPC); el MODELO de nichos se propone.
```

### E1 · `estudio-competencia` — micro-agente (CONSTRUIR)
```
A. DEPENDENCIAS: + puerto-fuente-datos, conversor-fuente, gestion-limites-fuente.
D: _analizarFuentes(nicho)->DatasetCompetidores (reflejo); _concluirDiferenciacion(dataset)->Conclusion (juicio).
F: publica nichos.competencia.analizado (+ failed). Se corre ANTES del gate.
NO REUTILIZA: marketing-competitors registra competidores de marketing; estudio de diferenciación de
nichos es otro juicio/dominio.
```

### E2 · `gate-decision-operar` — puente (CONSTRUIR)
```
A. DEPENDENCIAS: + paquete-decision, canal-supervision.
D. PROYECCIONES: _armarPaquete() -> paquete-cerrado (nicho+competencia+modelo+costo+proyección).
F: publica nichos.gate.solicitado (-> K2/G1) + failed. El sistema NO decide operar por su cuenta.
VERIFICACIÓN: aprueba/rechaza el dueño; no reunión síncrona.
NO REUTILIZA: gate de operación de nichos no existe; conserje/ejecutor son de otros dominios.
```

### E3 · `motor-cobro` — reflejo (CONSTRUIR)
```
A. DEPENDENCIAS: + pago-gateway (LÍDER provider-agnóstico), perfil-cobro-entrega, registro-cobros.
D. PROYECCIONES: _ejecutarCobro(importe,pagador)->Cobro via plataforma declarada;
   _distinguirEfectivoDePromesa(cobro)->EFECTIVO|COMPROMETIDO.
F: publica nichos.cobro.ejecutado (-> registro-cobros append-only) + failed.
NO REUTILIZA: cobro (prisma) y cobros (pizzepos) cobran su dominio; pago-gateway es el puerto agnóstico
reutilizable y se llama por RPC, el motor de cobro de NICHOS se CONSTRUYE encima del puerto.
```

### E4 · `canal-distribucion` — puente (CONSTRUIR)
```
A. DEPENDENCIAS: + perfil-cobro-entrega.
D. PROYECCIONES: _emitirEntrega -> lleva la solución al pagador por su canal.
F: publica nichos.entrega.enviada (+ failed).
NO REUTILIZA: canal de entrega de nichos no existe; el canal declarado es un puerto abierto.
```

### F1 · `registro-cobros` — custodio (CONSTRUIR)
```
A/B/C: PosPersistencia; append-only inmutable; un solo escritor = MOTOR_COBRO (E3).
D. PROYECCIONES: _appendUnico(duenyoEscritor,cobro) append-only; _consultar(nicho)->HistorialCobros.
F: publica nichos.cobro_registrado (+ failed). VERIFICACIÓN: cobro jamás se sobrescribe (efectivo vs
comprometido asentado).
NO REUTILIZA: registro-cobros de nichos no existe (historial 3D/registro de otro dominio).
```

### F2 · `imputacion-costes` — reflejo (CONSTRUIR)
```
A. DEPENDENCIAS: + coste-fuente (J4).
D. PROYECCIONES: _agregar(nicho)->CosteProyecto = construccion+operacion+fuentes.
F: publica nichos.coste_imputado (+ failed). VERIFICACIÓN: cada projecto absorbe su coste real.
NO REUTILIZA: calculadora de coste (prisma) es otro dominio; coste-fuente se reutiliza.
```

### F3 · `cuadro-salud-financiera` — custodio (CONSTRUIR)
```
A. DEPENDENCIAS: + registro-cobros, imputacion-costes.
D. PROYECCIONES: _agregarPorProyecto(F1,F2)->GENERA|SANGRA|NEUTRO (reflejo);
   _registrarFlujoACaja(nicho)->Flujo; _leer()->CuadroGlobal.
F: publica nichos.salud.actualizada + nichos.cuadro.flujo_a_caja (+ failed).
VERIFICACIÓN: medida maestra inalterable: se calcula de hechos (F1+F2), no de promesas.
NO REUTILIZA: cuadro de salud financiera de nichos per-proyecto no existe.
```

### F4 · `alerta-sangria` — puente (CONSTRUIR)
```
A. DEPENDENCIAS: + cuadro-salud-financiera, canal-supervision.
D. PROYECCIONES: _monitorear(cuadro)->CruzaTecho:bool; _emitirDecision -> SolicitudDecision.
F: publica nichos.alerta.sangria (+ failed). Al cruzar techo -> caso a decidir; no mata sola.
NO REUTILIZA: alerta de sangría de nichos no existe (homeostasis vigila el SISTEMA, no el negocio).
```

### G1 · `canal-supervision` — puente (CONSTRUIR)
```
A. DEPENDENCIAS: + telegram-bridge (REUTILIZAR) + perfil-supervision.
D. PROYECCIONES: _conectar(canal)->ok (agnóstico: Telegram es UNA impl); _emitirEnvio(enviar)->entrega.
F: publica nichos.canal.enviado / nichos.canal.conectado (+ envio_fallido).
NO REUTILIZA como canal único: canal-supervision de NICHO envuelve telegram-bridge (reutilizado) como
implementación del PUERTO; nunca se acopla al proveedor.
```

### G2 · `escalones-mensaje` — reflejo (CONSTRUIR)
```
A. DEPENDENCIAS: + perfil-supervision, canal-supervision.
D. PROYECCIONES: _rotular(tipo)->Escalon; _clasificar(tipo)->regla declarada (PULSO|ALERTA|DECISION).
F: publica nichos.escalon.clasificado (+ failed). Regla dura, no ambigua.
NO REUTILIZA: clasificación de escalones de nichos no existe.
```

### G3 · `clasificador-intencion` — micro-agente (CONSTRUIR)
```
A. DEPENDENCIAS: + captura-semilla.
D. PROYECCIONES: _clasificar(mensaje)->SEMILLA|DECISION|CONSULTA (lenguaje/ambiguo).
F: publica nichos.intencion.clasificada (+ failed).
NO REUTILIZA: clasificación de intención del dueño es dominio nichos.
```

### H1 · `paquete-decision` — micro-agente (CONSTRUIR)
```
A. DEPENDENCIAS: + estudio-competencia, proponedor-modelo-cobro, cuadro-salud-financiera.
D. PROYECCIONES: _construir(nicho,evidencia,riesgo,alternativa)->Paquete (hidrata reflejos + sintesis).
F: publica nichos.paquete_construido (+ failed).
NO REUTILIZA: síntesis de decisión autocxplicada de nichos no existe (conserje abre camino de comercio).
```

### H2 · `perfil-supervision` — custodio (CONSTRUIR)
```
A/B/C: PosPersistencia; un solo escritor (DUEÑO); canal + monitor consumen.
D. PROYECCIONES: _declararCadencia(duenyo,cadencia); _leer()->PerfilSupervision.
F: publica nichos.supervision.declarado (+ failed).
NO REUTILIZA: perfil de supervisión per-proyecto de nichos no existe.
```

### I1 · `perfil-cobro-entrega` — custodio (CONSTRUIR)
```
A/B/C: PosPersistencia; contrato de pago/entrega por pagador, escritor=CONSTRUCTOR+DUEÑO.
D. PROYECCIONES: _declararContrato(contrato); _leer(pagador)->PerfilCobroEntrega.
F: publica nichos.perfil.declarado (+ failed). Un solo dueño por store.
NO REUTILIZA: perfil de cobro/entrega por nicho no existe.
```

### I2 · `propuesta-valor-canal` — micro-agente (CONSTRUIR)
```
A. DEPENDENCIAS: + estudio-competencia, sondeo-territorio.
D. PROYECCIONES: _proponerMensaje(nicho)->Copy (cómo gana confianza/compra en el territorio).
F: publica nichos.copy_propuesto (+ failed).
NO REUTILIZA: copy/posicionamiento de nichos es juicio de dominio.
```

### I3 · `confirmacion-valor` — custodio (CONSTRUIR)
```
A/B/C: PosPersistencia; [ABIERTO] si se recoge feedback post-compra o solo se cobra; store custodio +
ingesta reflejo.
D. PROYECCIONES: _ingestar(feedback)->estructura (reflejo); _guardar (custodio); _consultar(nicho).
F: publica nichos.feedback_recibido (+ failed).
NO REUTILIZA: confirmación de valor del pagador de nicho no existe.
```

### J1 · `puerto-fuente-datos` — puente (CONSTRUIR)
```
A. DEPENDENCIAS: + crawl4rs (REUTILIZAR), gestor-credenciales-nicho (REUTILIZAR).
D. PROYECCIONES: _conectar(fuente)->ok swap sin acople; _consultar->DatasetBruto+Rate+Coste;
   _autorizar(fuentes autorizadas por el dueño).
F: publica nichos.fuente.conectada / nichos.fuente.reemplazada (+ consultar.failed).
NO REUTILIZA como puerto de NICHO: radar-fuente define las 6 fuentes de MÚSICA; el puerto de nichos se
CONSTRUYE encima de crawl4rs+gestor-credenciales (reutilizados) como frontera declarable y reemplazable.
```

### J2 · `conversor-fuente` — conversor (CONSTRUIR)
```
A. DEPENDENCIAS: + puerto-fuente-datos.
D. PROYECCIONES: _cruzar(fuenteBruta)->DatosHomogeneos (UNICA frontera de formatos); _mapear.
F: publica nichos.datos_homogeneos (+ failed). VERIFICACIÓN: el único cruce de formatos externos->internos.
NO REUTILIZA: importacion (3D) y conversor (prisma) son fronteras de OTROS dominios; conversor de fuentes
de nichos se CONSTRUYE.
```

### J3 · `gestion-limites-fuente` — reflejo (CONSTRUIR)
```
A. DEPENDENCIAS: + puerto-fuente-datos.
D. PROYECCIONES: _encolar(solicitud)->ok; _dosificar(rate)->no quemar el recurso.
F: publica nichos.fuente.dosificado (+ failed).
NO REUTILIZA: cola/rate de fuentes de nichos no existe.
```

### J4 · `coste-fuente` — reflejo (CONSTRUIR)
```
A. DEPENDENCIAS: + puerto-fuente-datos.
D. PROYECCIONES: _calcularCoste(nicho,fuente)->Coste; _agregarAProyecto -> alimenta F2.
F: publica nichos.fuente_costea_imputado (+ failed).
NO REUTILIZA: imputación de coste de fuente de nichos no existe; alimenta salud financiera.
```

### K1 · `vista-portafolio` — custodio (CONSTRUIR)
```
A. DEPENDENCIAS: + cuadro-salud-financiera, historial-nicho.
D. PROYECCIONES: _agregarSalud(F3,todos)->VistaPortafolio (reflejo); _guardarVista (custodio); _leer()->
   DashboardJefe.
F: publica nichos.vista_portafolio (+ failed).
NO REUTILIZA: panel-jefe (3D) agrega otro dominio; vista-agregada de nichos se CONSTRUYE.
```

### K2 · `cola-decisiones-gate` — custodio (CONSTRUIR)
```
A. DEPENDENCIAS: + canal-supervision.
B/C: PosPersistencia; UNA cola de gates; consumidor nichos.gate.solicitado/puente_solicitado/alerta.sangria.
D. PROYECCIONES: _encolar(solicitud)->ok; _resolverSiguiente(duenyo,resolucion)->desencola ordenado;
   _listar()->Cola.
F: publica nichos.decision.resuelta (+ gate.encolar.failed).
NO REUTILIZA: cola de decisiones de gates de nichos no existe.
```

### K3 · `ajustador-umbrales` — custodio (CONSTRUIR)
```
A. DEPENDENCIAS: + criterio-viabilidad.
D. PROYECCIONES: _retunear(duenyo,nuevoUmbral)->aplica a C2 (custodia store); _aplicar(cambio)->recalcula.
F: publica nichos.umbral_ajustado (+ failed). El jefe retunea en caliente.
NO REUTILIZA: retune de umbral de validación de nichos no existe.
```

### L1 · `pipeline-por-nicho` — custodio / ORQUESTADOR (CONSTRUIR · último)
```
A. DEPENDENCIAS: scheduler (REUTILIZAR) dispara el ciclo; consume RPC de TODAS las hojas (contrato
   tolerante: una RPC falla -> ciclo fallido, no basura).
B/C: PosPersistencia; máquina de estados UNA por proyecto (SEMILLA->...->EN_CAJA|SANGRA); dueño del
   estado de cada nicho (un único escritor).
D. PROYECCIONES: _avanzar(nicho,evento)->transición; _orquestarEtapa(nicho)->llama A/B/C/D/E/F segun
   estado; _registrarEnHistorial -> L4.
F: publica nichos.pipeline.avanzado / nichos.pipeline.ciclo_iniciado / nichos.pipeline.ciclo_completado
   (+ pipeline.avanzar.failed).
VERIFICACIÓN: ciclo semilla->caja completo + estado ilegal (VALIDADO sin C6) imposible + RPC falla con
   tolerancia.
NO REUTILIZA: ciclo-impresion (3D) y boss (prisma) orquestan otros dominios; en nichos la máquina de
   estados del pipeline es exclusiva.
```

### L2 · `cola-candidatos` — custodio (CONSTRUIR)
```
A. DEPENDENCIAS: + sondeo-territorio.
D. PROYECCIONES: _encolar(candidato)->ok; _tomarN(paralelismo)->lote (solo C5 saca); _longitud().
F: publica nichos.candidato_encolado / nichos.candidato_tomado (+ failed).
NO REUTILIZA: buffer del cuello de validación de nichos no existe.
```

### L3 · `manejo-fallo` — puente (CONSTRUIR)
```
A. DEPENDENCIAS: + puente-humano, canal-supervision.
D. PROYECCIONES: _reintentarMecanico(fallo)->ok (reflejo, hasta maxReintentos [ABIERTO]);
   _derivarASinAlternativa(fallo)->D2 (puente por evento).
F: publica nichos.fallo_manejado (+ failed). Reintento mecánico ANTES de escalar a humano.
NO REUTILIZA: manejo-fallo (3D) consulta política del dueño de impresión; en nichos maneja el ciclo, se
CONSTRUYE (patrón prestado) para no romper el manejo-fallo de impresión.
```

### L4 · `historial-nicho` — custodio (CONSTRUIR)
```
A. DEPENDENCIAS: + memoria-nicho (REUTILIZAR como sustrato).
D. PROYECCIONES: _appendUnico(duenyoEscritor=pipeline, estado)->append-only inmutable; _consultar(nicho).
F: publica nichos.historial_actualizado (+ failed).
NO REUTILIZA: historial (3D) registra impresiones; historial de nichos (estados/decisiones) se CONSTRUYE
sobre memoria-nicho.
```

### L5 · `pulso-avance` — reflejo (CONSTRUIR)
```
A. DEPENDENCIAS: + escalones-mensaje, canal-supervision.
D. PROYECCIONES: _calcularProgreso(etapa)->Progreso; _emitirEscalon(progreso)->pulso al supervisor.
F: publica nichos.pulso_emitido (+ failed).
NO REUTILIZA: pulso de avance de nichos no existe; escalones/pulso se clasifica por regla declarada.
```

---

## 7 · Resumen de decisión

- **51 hojas**: **44 CONSTRUIR** + **7 REUTILIZAR** + **0 ADAPTAR**.
- Los 7 REUTILIZAR son infraestructura/órganos compartidos con contrato real que encaja
  (`scheduler`, `crawl4rs`, `filesystem`, `project-manager`, `telegram-bridge`, `memoria-nicho`,
  `gestor-credenciales-nicho`).
- Cero ADAPTAR: cualquier módulo "parecido" es de otro dominio (radar-música, 3D, prisma, pizzepos) o de
  una iteración previa sin PosPersistencia per-proyecto; ADAPTARlo rompería su proyecto -> se toma su
  patrón y se CONSTRUYE para nichos.

---

## 8. ESPINA enki-plan (JSON embebido — la consume construir-modulos)

```json enki-plan
{
  "proyecto": "nichos",
  "proyecto_id": "nichos",
  "origen": "fase3/diseno-oop.md (44 clases) + fase2/esquemas/esquema.md (formas) + patron modulo-real/modulo-hibrido",
  "inventario": "198 modulos reales consultados en /tmp/inventario-modulos-enki.json (module.json real, no por nombre)",
  "regla": "modulos-isla event-driven: CLASE con estado->CUSTODIO; solo calcula->PROYECCION interna; orquesta->MICRO-AGENTE/ORQUESTADOR; habla exterior->PUENTE; dependencia->EVENTO request/response. Cero require cruzado, _shared solo infraestructura.",
  "orden": [
    "scheduler",
    "crawl4rs",
    "filesystem",
    "project-manager",
    "telegram-bridge",
    "memoria-nicho",
    "gestor-credenciales-nicho",
    "captura-semilla",
    "normalizacion-semilla",
    "puerto-fuente-datos",
    "gestion-limites-fuente",
    "sondeo-territorio",
    "reglas-exclusion",
    "perfil-limite-busqueda",
    "conversor-fuente",
    "estudio-demanda",
    "criterio-viabilidad",
    "veredicto-viabilidad",
    "catalogo-capacidades",
    "camino-encontrar-construir",
    "cola-candidatos",
    "batch-validacion",
    "corte-temprano",
    "registro-cobros",
    "coste-fuente",
    "imputacion-costes",
    "cuadro-salud-financiera",
    "reglas-aprendidas",
    "ensamblador-solucion",
    "canal-supervision",
    "puente-humano",
    "estudio-competencia",
    "proponedor-modelo-cobro",
    "paquete-decision",
    "gate-decision-operar",
    "perfil-cobro-entrega",
    "motor-cobro",
    "canal-distribucion",
    "alerta-sangria",
    "perfil-supervision",
    "escalones-mensaje",
    "clasificador-intencion",
    "propuesta-valor-canal",
    "confirmacion-valor",
    "historial-nicho",
    "vista-portafolio",
    "cola-decisiones-gate",
    "ajustador-umbrales",
    "manejo-fallo",
    "pulso-avance",
    "pipeline-por-nicho"
  ],
  "hojas": [
    {
      "slug": "scheduler",
      "forma": "reflejo",
      "accion": "REUTILIZAR",
      "reutiliza": [
        "scheduler"
      ],
      "depende_de": [],
      "subscribes": [
        "scheduler.job.trigger"
      ],
      "publishes": [
        "scheduler.fired"
      ],
      "proyecciones_internas": [],
      "nota": "Motor cron/intervalo que dispara los ciclos del pipeline (L1)."
    },
    {
      "slug": "crawl4rs",
      "forma": "puente",
      "accion": "REUTILIZAR",
      "reutiliza": [
        "crawl4rs"
      ],
      "depende_de": [],
      "subscribes": [
        "crawl4rs.leer.request",
        "crawl4rs.rastrear.request",
        "crawl4rs.buscar.request",
        "crawl4rs.mapear.request"
      ],
      "publishes": [
        "crawl4rs.leer.response",
        "crawl4rs.rastrear.response",
        "crawl4rs.buscar.response",
        "crawl4rs.mapear.response"
      ],
      "proyecciones_internas": [],
      "nota": "Organo web (obscura, Rust) que B1/J1 usan para barrer fuentes."
    },
    {
      "slug": "filesystem",
      "forma": "reflejo",
      "accion": "REUTILIZAR",
      "reutiliza": [
        "filesystem"
      ],
      "depende_de": [],
      "subscribes": [
        "fs.read.request",
        "fs.write.request",
        "fs.edit.request"
      ],
      "publishes": [
        "fs.read.response",
        "fs.write.response",
        "fs.edit.response"
      ],
      "proyecciones_internas": [],
      "nota": "Base shared: todos los stores leen/escriben via su reflejo."
    },
    {
      "slug": "project-manager",
      "forma": "reflejo",
      "accion": "REUTILIZAR",
      "reutiliza": [
        "project-manager"
      ],
      "depende_de": [],
      "subscribes": [
        "project.activate.request",
        "project.deactivate.request"
      ],
      "publishes": [
        "project.activated",
        "project.deactivated"
      ],
      "proyecciones_internas": [],
      "nota": "Lifecycle de proyecto; PosPersistencia scopes por project_id."
    },
    {
      "slug": "telegram-bridge",
      "forma": "puente",
      "accion": "REUTILIZAR",
      "reutiliza": [
        "telegram-bridge"
      ],
      "depende_de": [],
      "subscribes": [
        "telegram.text.received",
        "telegram.command.received",
        "telegram.callback.received"
      ],
      "publishes": [
        "telegram.bridge.vinculado",
        "telegram.bridge.envio_fallido"
      ],
      "proyecciones_internas": [],
      "nota": "Implementacion del PuertoCanal (G1) en el sitio de despliegue; nunca acopla G1."
    },
    {
      "slug": "memoria-nicho",
      "forma": "custodio",
      "accion": "REUTILIZAR",
      "reutiliza": [
        "memoria-nicho"
      ],
      "depende_de": [],
      "subscribes": [
        "memoria-nicho.senal.guardar.request",
        "memoria-nicho.consultar.request",
        "memoria-nicho.seguimiento.programar.request",
        "project.activated"
      ],
      "publishes": [
        "memoria.senal_persistida",
        "memoria.global_actualizada",
        "memoria.seguimiento_programado",
        "memoria.guardar.failed"
      ],
      "proyecciones_internas": [],
      "nota": "Sustrato shared del historial real (senales/resultados) que L4 y C7 leen/escriben."
    },
    {
      "slug": "gestor-credenciales-nicho",
      "forma": "puente",
      "accion": "REUTILIZAR",
      "reutiliza": [
        "gestor-credenciales-nicho"
      ],
      "depende_de": [],
      "subscribes": [
        "gestor-credenciales-nicho.canal.asegurar.request",
        "gestor-credenciales-nicho.listar.request",
        "project.activated"
      ],
      "publishes": [
        "gestor.canal_asegurado",
        "gestor.canal.failed"
      ],
      "proyecciones_internas": [],
      "nota": "Autoaprovisiona credenciales de fuentes/plataformas para J1; adapta credential-manager al dominio nichos."
    },
    {
      "slug": "captura-semilla",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "depende_de": [],
      "subscribes": [
        "nichos.semilla.aceptar.request"
      ],
      "publishes": [
        "nichos.semilla.capturada",
        "nichos.semilla.aceptar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_aceptar",
          "descripcion": "valida vacios/formato; test lo afirma; rechaza vacios con error determinista"
        },
        {
          "nombre": "_formatear",
          "descripcion": "limpia/normaliza estructura -> Semilla"
        }
      ]
    },
    {
      "slug": "normalizacion-semilla",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "captura-semilla"
      ],
      "depende_de": [
        "captura-semilla"
      ],
      "subscribes": [
        "nichos.semilla.normalizar.request"
      ],
      "publishes": [
        "nichos.semilla.normalizada",
        "nichos.semilla.normalizar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_desambiguar",
          "descripcion": "juego/ambiguo -> List<Intencion> (fuzzy)"
        },
        {
          "nombre": "_normalizarEstructura",
          "descripcion": "parte mecanica -> reflejo"
        }
      ]
    },
    {
      "slug": "sondeo-territorio",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "normalizacion-semilla",
        "puerto-fuente-datos",
        "gestion-limites-fuente"
      ],
      "depende_de": [
        "normalizacion-semilla",
        "puerto-fuente-datos",
        "gestion-limites-fuente"
      ],
      "subscribes": [
        "nichos.territorio.sondear.request"
      ],
      "publishes": [
        "nichos.territorio.sondeado",
        "nichos.candidato.encontrado",
        "nichos.territorio.sondear.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_barrerFuentes",
          "descripcion": "reflejo: parseo mecanico de fuentes -> DatasetBruto"
        },
        {
          "nombre": "_juzgarTerritorio",
          "descripcion": "juicio: que territorio merece seguir"
        },
        {
          "nombre": "_proponerSiguientes",
          "descripcion": "prioriza por demanda 1er orden"
        }
      ]
    },
    {
      "slug": "reglas-exclusion",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "sondeo-territorio",
        "memoria-nicho"
      ],
      "depende_de": [
        "sondeo-territorio"
      ],
      "subscribes": [
        "nichos.reglas.excluir.request"
      ],
      "publishes": [
        "nichos.candidato.excluido",
        "nichos.reglas.excluir.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_aprenderDeCorridas",
          "descripcion": "falsos positivos previos afinan reglas"
        },
        {
          "nombre": "_aplicar",
          "descripcion": "devuelve excluido: bool"
        }
      ]
    },
    {
      "slug": "perfil-limite-busqueda",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "depende_de": [],
      "subscribes": [
        "nichos.limite.leer.request",
        "nichos.limite.declarar.request",
        "project.activated"
      ],
      "publishes": [
        "nichos.limite.declarado",
        "nichos.limite.declarar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_leer",
          "descripcion": "leer() -> LimitesBusqueda"
        },
        {
          "nombre": "_declarar",
          "descripcion": "un solo escritor (DUEÑO por el canal) escribe limites"
        }
      ]
    },
    {
      "slug": "estudio-demanda",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "puerto-fuente-datos",
        "conversor-fuente"
      ],
      "depende_de": [
        "puerto-fuente-datos",
        "conversor-fuente"
      ],
      "subscribes": [
        "nichos.estudio.medir.request"
      ],
      "publishes": [
        "nichos.estudio.medido",
        "nichos.estudio.medir.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_medirDemanda1erOrden",
          "descripcion": "reflejo: lee numeros declarados -> Metrica"
        },
        {
          "nombre": "_medirDisposicionAPagar",
          "descripcion": "reflejo -> Metrica"
        },
        {
          "nombre": "_redactarConclusionMercado",
          "descripcion": "juicio: concluye mercado de los numeros"
        }
      ]
    },
    {
      "slug": "criterio-viabilidad",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "depende_de": [],
      "subscribes": [
        "nichos.criterio.leer.request",
        "nichos.criterio.declarar.request",
        "nichos.umbral.recalibrado",
        "project.activated"
      ],
      "publishes": [
        "nichos.criterio.declarado",
        "nichos.criterio.recalibrado",
        "nichos.criterio.declarar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declararUmbral",
          "descripcion": "criterio declarable, no experiencia oculta"
        },
        {
          "nombre": "_leerVigente",
          "descripcion": "leerVigente(nicho) -> Umbral"
        },
        {
          "nombre": "_recalibrar",
          "descripcion": "aplica delta de C7 -> refina umbral"
        }
      ]
    },
    {
      "slug": "veredicto-viabilidad",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "estudio-demanda",
        "criterio-viabilidad"
      ],
      "depende_de": [
        "estudio-demanda",
        "criterio-viabilidad"
      ],
      "subscribes": [
        "nichos.veredicto.evaluar.request"
      ],
      "publishes": [
        "nichos.veredicto.emitido",
        "nichos.veredicto.evaluar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_evaluar",
          "descripcion": "juicio asistido -> VIABLE|NO_VIABLE|PUENTE"
        }
      ]
    },
    {
      "slug": "camino-encontrar-construir",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "veredicto-viabilidad",
        "catalogo-capacidades"
      ],
      "depende_de": [
        "veredicto-viabilidad",
        "catalogo-capacidades"
      ],
      "subscribes": [
        "nichos.camino.decidir.request"
      ],
      "publishes": [
        "nichos.camino.decidido",
        "nichos.camino.decidir.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_decidirCamino",
          "descripcion": "oportunidad con riesgo declarado -> ENCONTRAR|CONSTRUIR|PUENTE"
        },
        {
          "nombre": "_subirRiesgo",
          "descripcion": "riesgo alto -> SolicitudDecision (D2)"
        }
      ]
    },
    {
      "slug": "batch-validacion",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "cola-candidatos"
      ],
      "depende_de": [
        "cola-candidatos"
      ],
      "subscribes": [
        "nichos.batch.programar.request"
      ],
      "publishes": [
        "nichos.batch.lote_ejecutado",
        "nichos.batch.programar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_programar",
          "descripcion": "saca lote de L2 -> loteEnEjecucion"
        },
        {
          "nombre": "_ejecutarEnParalelo",
          "descripcion": "N nichos a la vez -> List<Veredicto>"
        }
      ]
    },
    {
      "slug": "corte-temprano",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "veredicto-viabilidad"
      ],
      "depende_de": [
        "veredicto-viabilidad"
      ],
      "subscribes": [
        "nichos.corte.evaluar.request"
      ],
      "publishes": [
        "nichos.corte.aplicado",
        "nichos.corte.evaluar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_evaluar",
          "descripcion": "Si NO_VIABLE -> no avanza a F3 (corte DURO determinista)"
        },
        {
          "nombre": "_aplicar",
          "descripcion": "emite cortado"
        }
      ]
    },
    {
      "slug": "reglas-aprendidas",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "criterio-viabilidad",
        "registro-cobros",
        "cuadro-salud-financiera"
      ],
      "depende_de": [
        "criterio-viabilidad",
        "registro-cobros",
        "cuadro-salud-financiera"
      ],
      "subscribes": [
        "nichos.reglas.recalibrar.request",
        "nichos.salud.actualizada",
        "nichos.cobro.ejecutado"
      ],
      "publishes": [
        "nichos.umbral.recalibrado",
        "nichos.reglas.recalibrar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_comparar",
          "descripcion": "(umbral, resultadosReales) -> Delta"
        },
        {
          "nombre": "_recalibrar",
          "descripcion": "(umbral, delta) -> UmbralRefinado -> C2 en caliente"
        }
      ]
    },
    {
      "slug": "catalogo-capacidades",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "depende_de": [],
      "subscribes": [
        "nichos.capacidad.consultar.request",
        "nichos.capacidad.declarar.request",
        "project.activated"
      ],
      "publishes": [
        "nichos.capacidad.faltante_declarado",
        "nichos.capacidad.declarar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_consultar",
          "descripcion": "consultar(nicho) -> CapacidadesDisponibles"
        },
        {
          "nombre": "_declararFaltante",
          "descripcion": "invariante: se crea lo que falta"
        }
      ]
    },
    {
      "slug": "ensamblador-solucion",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "camino-encontrar-construir",
        "catalogo-capacidades"
      ],
      "depende_de": [
        "camino-encontrar-construir",
        "catalogo-capacidades"
      ],
      "subscribes": [
        "nichos.solucion.construir.request"
      ],
      "publishes": [
        "nichos.solucion.construida",
        "nichos.solucion.construir.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_decidirQueConstruir",
          "descripcion": "juicio -> Especificacion"
        },
        {
          "nombre": "_ejecutarMontaje",
          "descripcion": "reflejo determinista -> SolucionOperable"
        }
      ]
    },
    {
      "slug": "puente-humano",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "canal-supervision"
      ],
      "depende_de": [
        "canal-supervision"
      ],
      "subscribes": [
        "nichos.puente.solicitar.request"
      ],
      "publishes": [
        "nichos.puente_solicitado",
        "nichos.puente.solicitar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_detectarBloqueo",
          "descripcion": "detecta bloqueo sin alternativa mecanica"
        },
        {
          "nombre": "_emitirSolicitud",
          "descripcion": "arma SolicitudDecision -> K2/G1"
        }
      ]
    },
    {
      "slug": "proponedor-modelo-cobro",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "ensamblador-solucion",
        "estudio-competencia"
      ],
      "depende_de": [
        "ensamblador-solucion",
        "estudio-competencia"
      ],
      "subscribes": [
        "nichos.modelo.proponer.request"
      ],
      "publishes": [
        "nichos.modelo_cobro.propuesto",
        "nichos.modelo.proponer.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_proponerModelo",
          "descripcion": "suscripcion|empresa|transaccional|[ABIERTO]; queda CONFIRMADO por el gate E2"
        }
      ]
    },
    {
      "slug": "estudio-competencia",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "puerto-fuente-datos",
        "conversor-fuente"
      ],
      "depende_de": [
        "puerto-fuente-datos",
        "conversor-fuente"
      ],
      "subscribes": [
        "nichos.competencia.analizar.request"
      ],
      "publishes": [
        "nichos.competencia.analizado",
        "nichos.competencia.analizar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_analizarFuentes",
          "descripcion": "reflejo -> DatasetCompetidores"
        },
        {
          "nombre": "_concluirDiferenciacion",
          "descripcion": "juicio -> Conclusion"
        }
      ]
    },
    {
      "slug": "gate-decision-operar",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "paquete-decision",
        "canal-supervision"
      ],
      "depende_de": [
        "paquete-decision",
        "canal-supervision"
      ],
      "subscribes": [
        "nichos.gate.solicitar.request",
        "nichos.decision.resuelta"
      ],
      "publishes": [
        "nichos.gate.solicitado",
        "nichos.gate.solicitar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_armarPaquete",
          "descripcion": "paquete-cerrado: nicho+competencia+modelo+costo+proyeccion"
        }
      ]
    },
    {
      "slug": "motor-cobro",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "gate-decision-operar",
        "perfil-cobro-entrega",
        "registro-cobros"
      ],
      "depende_de": [
        "gate-decision-operar",
        "perfil-cobro-entrega",
        "registro-cobros"
      ],
      "subscribes": [
        "nichos.cobro.ejecutar.request"
      ],
      "publishes": [
        "nichos.cobro.ejecutado",
        "nichos.cobro.ejecutar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_ejecutarCobro",
          "descripcion": "via plataforma declarada -> Cobro"
        },
        {
          "nombre": "_distinguirEfectivoDePromesa",
          "descripcion": "EFECTIVO|COMPROMETIDO|[ABIERTO]"
        }
      ]
    },
    {
      "slug": "canal-distribucion",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "perfil-cobro-entrega"
      ],
      "depende_de": [
        "perfil-cobro-entrega"
      ],
      "subscribes": [
        "nichos.entrega.enviar.request"
      ],
      "publishes": [
        "nichos.entrega.enviada",
        "nichos.entrega.enviar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_emitirEntrega",
          "descripcion": "lleva la solucion al pagador por su canal"
        }
      ]
    },
    {
      "slug": "registro-cobros",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "depende_de": [],
      "subscribes": [
        "nichos.cobro.ejecutado",
        "nichos.cobro.registrar.request",
        "project.activated"
      ],
      "publishes": [
        "nichos.cobro_registrado",
        "nichos.cobro.registrar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_appendUnico",
          "descripcion": "append-only inmutable; un solo escritor (E3)"
        },
        {
          "nombre": "_consultar",
          "descripcion": "consultar(nicho) -> HistorialCobros"
        }
      ]
    },
    {
      "slug": "imputacion-costes",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "coste-fuente"
      ],
      "depende_de": [
        "coste-fuente"
      ],
      "subscribes": [
        "nichos.coste.agregar.request"
      ],
      "publishes": [
        "nichos.coste_imputado",
        "nichos.coste.agregar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_agregar",
          "descripcion": "construccion+operacion+fuentes -> CosteProyecto"
        }
      ]
    },
    {
      "slug": "cuadro-salud-financiera",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "registro-cobros",
        "imputacion-costes"
      ],
      "depende_de": [
        "registro-cobros",
        "imputacion-costes"
      ],
      "subscribes": [
        "nichos.salud.actualizar.request",
        "nichos.cobro_registrado",
        "nichos.coste_imputado",
        "project.activated"
      ],
      "publishes": [
        "nichos.salud.actualizada",
        "nichos.cuadro.flujo_a_caja",
        "nichos.salud.actualizar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_agregarPorProyecto",
          "descripcion": "(F1,F2) -> GENERA|SANGRA|NEUTRO"
        },
        {
          "nombre": "_registrarFlujoACaja",
          "descripcion": "-> Flujo real"
        },
        {
          "nombre": "_leer",
          "descripcion": "leer() -> CuadroGlobal"
        }
      ]
    },
    {
      "slug": "alerta-sangria",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "cuadro-salud-financiera",
        "canal-supervision"
      ],
      "depende_de": [
        "cuadro-salud-financiera",
        "canal-supervision"
      ],
      "subscribes": [
        "nichos.alerta.monitorear.request",
        "nichos.salud.actualizada"
      ],
      "publishes": [
        "nichos.alerta.sangria",
        "nichos.alerta.monitorear.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_monitorear",
          "descripcion": "-> CruzaTecho: bool"
        },
        {
          "nombre": "_emitirDecision",
          "descripcion": "SolicitudDecision -> K2/G1"
        }
      ]
    },
    {
      "slug": "canal-supervision",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "telegram-bridge",
        "perfil-supervision"
      ],
      "depende_de": [
        "telegram-bridge"
      ],
      "subscribes": [
        "nichos.canal.enviar.request",
        "nichos.canal.conectar.request"
      ],
      "publishes": [
        "nichos.canal.enviado",
        "nichos.canal.enviar.failed",
        "nichos.canal.conectado"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_conectar",
          "descripcion": "agnostico: Telegram es una implementacion, no el portador"
        },
        {
          "nombre": "_emitirEnvio",
          "descripcion": "entrega el mensaje al canal declarado"
        }
      ]
    },
    {
      "slug": "escalones-mensaje",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "perfil-supervision",
        "canal-supervision"
      ],
      "depende_de": [
        "perfil-supervision",
        "canal-supervision"
      ],
      "subscribes": [
        "nichos.escalon.clasificar.request"
      ],
      "publishes": [
        "nichos.escalon.clasificado",
        "nichos.escalon.clasificar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_rotular",
          "descripcion": "PULSO|ALERTA|DECISION"
        },
        {
          "nombre": "_clasificar",
          "descripcion": "regla dura declarada, no ambigua"
        }
      ]
    },
    {
      "slug": "clasificador-intencion",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "captura-semilla"
      ],
      "depende_de": [
        "captura-semilla"
      ],
      "subscribes": [
        "nichos.intencion.clasificar.request"
      ],
      "publishes": [
        "nichos.intencion.clasificada",
        "nichos.intencion.clasificar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_clasificar",
          "descripcion": "SEMILLA|DECISION|CONSULTA (lenguaje/ambiguo)"
        }
      ]
    },
    {
      "slug": "paquete-decision",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "estudio-competencia",
        "proponedor-modelo-cobro",
        "cuadro-salud-financiera"
      ],
      "depende_de": [
        "estudio-competencia",
        "proponedor-modelo-cobro",
        "cuadro-salud-financiera"
      ],
      "subscribes": [
        "nichos.paquete.construir.request"
      ],
      "publishes": [
        "nichos.paquete_construido",
        "nichos.paquete.construir.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_construir",
          "descripcion": "hidrata reflejos + redacta sintesis autocxplicada"
        }
      ]
    },
    {
      "slug": "perfil-supervision",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "depende_de": [],
      "subscribes": [
        "nichos.supervision.leer.request",
        "nichos.supervision.declarar.request",
        "project.activated"
      ],
      "publishes": [
        "nichos.supervision.declarado",
        "nichos.supervision.declarar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declararCadencia",
          "descripcion": "un solo escritor (DUEÑO)"
        },
        {
          "nombre": "_leer",
          "descripcion": "leer() -> PerfilSupervision"
        }
      ]
    },
    {
      "slug": "perfil-cobro-entrega",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "depende_de": [],
      "subscribes": [
        "nichos.perfil.consultar.request",
        "nichos.perfil.declarar.request",
        "project.activated"
      ],
      "publishes": [
        "nichos.perfil.declarado",
        "nichos.perfil.declarar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_declararContrato",
          "descripcion": "contrato de pago/entrega por pagador, escritor=CONSTRUCTOR+DUEÑO"
        },
        {
          "nombre": "_leer",
          "descripcion": "leer(pagador) -> PerfilCobroEntrega"
        }
      ]
    },
    {
      "slug": "propuesta-valor-canal",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "estudio-competencia"
      ],
      "depende_de": [
        "estudio-competencia"
      ],
      "subscribes": [
        "nichos.copy.proponer.request"
      ],
      "publishes": [
        "nichos.copy_propuesto",
        "nichos.copy.proponer.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_proponerMensaje",
          "descripcion": "juicio de copy/posicionamiento hidratado por datos del canal"
        }
      ]
    },
    {
      "slug": "confirmacion-valor",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia"
      ],
      "depende_de": [],
      "subscribes": [
        "nichos.feedback.ingestar.request",
        "nichos.feedback.guardar.request",
        "project.activated"
      ],
      "publishes": [
        "nichos.feedback_recibido",
        "nichos.feedback.guardar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_ingestar",
          "descripcion": "reflejo: recoge post-compra"
        },
        {
          "nombre": "_guardar",
          "descripcion": "custodio del store de feedback"
        },
        {
          "nombre": "_consultar",
          "descripcion": "consultar(nicho) -> Feedback"
        }
      ]
    },
    {
      "slug": "puerto-fuente-datos",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "crawl4rs",
        "gestor-credenciales-nicho"
      ],
      "depende_de": [
        "crawl4rs",
        "gestor-credenciales-nicho"
      ],
      "subscribes": [
        "nichos.fuente.consultar.request",
        "nichos.fuente.conectar.request",
        "nichos.fuente.reemplazar.request"
      ],
      "publishes": [
        "nichos.fuente.conectada",
        "nichos.fuente.reemplazada",
        "nichos.fuente.consultar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_conectar",
          "descripcion": "swap sin acople a vendor"
        },
        {
          "nombre": "_consultar",
          "descripcion": "-> DatasetBruto + Rate + Coste"
        },
        {
          "nombre": "_autorizar",
          "descripcion": "fuentes autorizadas por el dueño"
        }
      ]
    },
    {
      "slug": "conversor-fuente",
      "forma": "conversor",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "puerto-fuente-datos"
      ],
      "depende_de": [
        "puerto-fuente-datos"
      ],
      "subscribes": [
        "nichos.fuente.convertir.request"
      ],
      "publishes": [
        "nichos.datos_homogeneos",
        "nichos.fuente.convertir.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_cruzar",
          "descripcion": "UNICA frontera de formatos -> DatosHomogeneos"
        },
        {
          "nombre": "_mapear",
          "descripcion": "mapear(formatoOrigen, formatoInterno)"
        }
      ]
    },
    {
      "slug": "gestion-limites-fuente",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "puerto-fuente-datos"
      ],
      "depende_de": [
        "puerto-fuente-datos"
      ],
      "subscribes": [
        "nichos.fuente.dosificar.request"
      ],
      "publishes": [
        "nichos.fuente.dosificado",
        "nichos.fuente.dosificar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_encolar",
          "descripcion": "cola/rate declarados"
        },
        {
          "nombre": "_dosificar",
          "descripcion": "no quemar el recurso de la fuente"
        }
      ]
    },
    {
      "slug": "coste-fuente",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "puerto-fuente-datos"
      ],
      "depende_de": [
        "puerto-fuente-datos"
      ],
      "subscribes": [
        "nichos.fuente.coste.calcular.request"
      ],
      "publishes": [
        "nichos.fuente_costea_imputado",
        "nichos.fuente.coste.calcular.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_calcularCoste",
          "descripcion": "coste por fuente -> Coste"
        },
        {
          "nombre": "_agregarAProyecto",
          "descripcion": "alimenta F2/imputacion-costes"
        }
      ]
    },
    {
      "slug": "vista-portafolio",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "cuadro-salud-financiera",
        "historial-nicho"
      ],
      "depende_de": [
        "cuadro-salud-financiera",
        "historial-nicho"
      ],
      "subscribes": [
        "nichos.vista.leer.request",
        "nichos.vista.guardar.request",
        "nichos.salud.actualizada",
        "project.activated"
      ],
      "publishes": [
        "nichos.vista_portafolio",
        "nichos.vista.guardar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_agregarSalud",
          "descripcion": "reflejo: cruza la salud de todos -> VistaPortafolio"
        },
        {
          "nombre": "_guardarVista",
          "descripcion": "custodia store de vistas"
        },
        {
          "nombre": "_leer",
          "descripcion": "leer() -> DashboardJefe"
        }
      ]
    },
    {
      "slug": "cola-decisiones-gate",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "canal-supervision"
      ],
      "depende_de": [
        "canal-supervision"
      ],
      "subscribes": [
        "nichos.gate.encolar.request",
        "nichos.gate.resolver.request",
        "project.activated",
        "nichos.gate.solicitado",
        "nichos.puente_solicitado",
        "nichos.alerta.sangria"
      ],
      "publishes": [
        "nichos.gate_encolado",
        "nichos.gate_resuelto",
        "nichos.decision.resuelta",
        "nichos.gate.encolar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_encolar",
          "descripcion": "una sola cola de gates por resolver"
        },
        {
          "nombre": "_resolverSiguiente",
          "descripcion": "desencola ordenado (el jefe)"
        },
        {
          "nombre": "_listar",
          "descripcion": "listar() -> Cola"
        }
      ]
    },
    {
      "slug": "ajustador-umbrales",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "criterio-viabilidad"
      ],
      "depende_de": [
        "criterio-viabilidad"
      ],
      "subscribes": [
        "nichos.umbral.retunear.request",
        "project.activated"
      ],
      "publishes": [
        "nichos.umbral_ajustado",
        "nichos.umbral.retunear.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_retunear",
          "descripcion": "jefe retunea en caliente -> custodia store"
        },
        {
          "nombre": "_aplicar",
          "descripcion": "aplica cambio -> recalcula -> C2"
        }
      ]
    },
    {
      "slug": "cola-candidatos",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "sondeo-territorio"
      ],
      "depende_de": [
        "sondeo-territorio"
      ],
      "subscribes": [
        "nichos.candidato.encolar.request",
        "nichos.candidato.tomar.request",
        "project.activated",
        "nichos.candidato.encontrado"
      ],
      "publishes": [
        "nichos.candidato_encolado",
        "nichos.candidato_tomado",
        "nichos.candidato.encolar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_encolar",
          "descripcion": "buffer del cuello de botella"
        },
        {
          "nombre": "_tomarN",
          "descripcion": "(paralelismo) -> lote, solo C5"
        },
        {
          "nombre": "_longitud",
          "descripcion": "numeroEnCola"
        }
      ]
    },
    {
      "slug": "manejo-fallo",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "puente-humano",
        "canal-supervision"
      ],
      "depende_de": [
        "puente-humano",
        "canal-supervision"
      ],
      "subscribes": [
        "nichos.fallo.manejar.request"
      ],
      "publishes": [
        "nichos.fallo_manejado",
        "nichos.fallo.manejar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_reintentarMecanico",
          "descripcion": "reflejo: alternativas mecanicas hasta maxReintentos"
        },
        {
          "nombre": "_derivarASinAlternativa",
          "descripcion": "puente: sin alternativa -> D2 por evento"
        }
      ]
    },
    {
      "slug": "historial-nicho",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "memoria-nicho"
      ],
      "depende_de": [
        "memoria-nicho"
      ],
      "subscribes": [
        "nichos.historial.append.request",
        "project.activated"
      ],
      "publishes": [
        "nichos.historial_actualizado",
        "nichos.historial.append.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_appendUnico",
          "descripcion": "append-only inmutable de estados/decisiones"
        },
        {
          "nombre": "_consultar",
          "descripcion": "consultar(nicho) -> Historial"
        }
      ]
    },
    {
      "slug": "pulso-avance",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "escalones-mensaje",
        "canal-supervision",
        "pipeline-por-nicho"
      ],
      "depende_de": [
        "escalones-mensaje",
        "canal-supervision"
      ],
      "subscribes": [
        "nichos.pulso.calcular.request"
      ],
      "publishes": [
        "nichos.pulso_emitido",
        "nichos.pulso.calcular.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_calcularProgreso",
          "descripcion": "etapa -> Progreso"
        },
        {
          "nombre": "_emitirEscalon",
          "descripcion": "pulso al supervisor via G1"
        }
      ]
    },
    {
      "slug": "pipeline-por-nicho",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": [
        "_shared/modulo-hibrido-reflejo",
        "_shared/pos-persistencia",
        "scheduler"
      ],
      "depende_de": [],
      "subscribes": [
        "nichos.pipeline.ciclo.iniciar.request",
        "nichos.ciclo.avanzar.request"
      ],
      "publishes": [
        "nichos.pipeline.avanzado",
        "nichos.pipeline.ciclo.iniciado",
        "nichos.pipeline.ciclo_completado",
        "nichos.pipeline.avanzar.failed"
      ],
      "proyecciones_internas": [
        {
          "nombre": "_avanzar",
          "descripcion": "maquina de estados UNA por proyecto: semilla->caja"
        },
        {
          "nombre": "_orquestarEtapa",
          "descripcion": "llama a A/B/C/D/E/F segun estado"
        },
        {
          "nombre": "_registrarEnHistorial",
          "descripcion": "alimenta L4"
        }
      ]
    }
  ]
}
```
