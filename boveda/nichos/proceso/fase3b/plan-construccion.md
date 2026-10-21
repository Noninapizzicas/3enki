# FASE 3b · Plan de Construcción — Nichos Autónomos

> **Proyecto:** nichos
> **Fuentes:**
>   - `/home/user/3enki/boveda/nichos/proceso/fase3/diseno-oop.md` (44 clases OOP)
>   - `/home/user/3enki/boveda/nichos/proceso/fase2/esquemas/esquema.md`
>   - `/home/user/3enki/boveda/nichos/proceso/fase2/esquemas/pasada-diseccion.md`
>   - `/home/user/3enki/arquitectura/cabecera/patron/modulo-hibrido.md`
>   - Inventario real: `find modules/ -maxdepth 3 -name module.json` → 322 manifests vivos.
> **Fecha:** 2026-10-04
> **Autor:** adaptador-disenos (F3b)
>
> **Qué entrega.** El plano de acoplamiento: cada clase OOP del F3 → su forma
> Enki (CUSTODIO · PROYECTOR · REFLEJO · PUENTE · CONVERSOR · MICRO-AGENTE),
> con la acción que decidimos (REUTILIZAR módulos existentes, ADAPTAR —
> prácticamente vacío — o CONSTRUIR hojas nuevas), los eventos del CANON y la
> espina `enki-plan` que consume la F4 (`construir-modulos`).
>
> **Qué NO cierra.** Las orejas finas al bus vivo del repo. F7b (`ensamblaje`)
> entra sobre cada hoja cuando nazca, lee los manifests existentes y le añade
> las suscripciones que necesite oír del ecosistema real. F3b escribe con la
> mejor intención y respeta el canon; F7b cose.

---

## 1 · Canon aplicado — una vez, bien

```
FORMA DEL NOMBRE
  <dominio>.<objeto>.<verbo>[.<modo>]

  dominio   = 'nichos' para TODA la vertical (identidad del subsistema).
  objeto    = sustantivo singular en minúscula.
  verbo     = participio pasado en PULSOS · infinitivo en RPCs.
  separador = SIEMPRE punto entre segmentos (nunca '_').
  ASCII     = sin tildes ni ñ en nombres de evento.
  idempotencia = cada RPC lleva correlation_id (QoS1 + unicidad en el handler).
```

Donde el diseño F3 habló de `nichos.semilla.normalizada.failed`, aquí lo
escribimos tal cual. Donde apareció `nichos.pipeline.ciclo_iniciado`, lo
reescribimos como `nichos.pipeline.ciclo.iniciado`. Donde apareció
`nicho.cortado.pre_construccion`, lo reescribimos como
`nichos.cortado.pre.construccion`. El dominio se normaliza a `nichos`
(plural, el nombre del vertical) en todos los eventos: si el diseño usó
`nicho.*` singular por tradición de prosa, aquí la grafía fija es `nichos.*`.

---

## 2 · Resumen de traducción — 44 clases OOP → forma Enki

| F3 · clase OOP | Forma OOP | Forma Enki | Acción | Hoja (slug) |
|---|---|---|---|---|
| A1 · CapturadorSemilla | REFLEJO puro | reflejo | CONSTRUIR | `nichos-capturador-semilla` |
| A2 · NormalizadorSemilla | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-normalizador-semilla` |
| B1 · SondeadorTerritorio | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-sondeador-territorio` |
| B2 · ReglasExclusionAprendidas | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-reglas-exclusion` |
| B3 · PerfilLimiteBusqueda | CUSTODIO | custodio | CONSTRUIR | `nichos-perfil-limite-busqueda` |
| C1 · EstudioDemanda | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-estudio-demanda` |
| C2 · CriterioViabilidad | CUSTODIO | custodio | CONSTRUIR | `nichos-criterio-viabilidad` |
| C3 · VeredictoViabilidad | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-veredicto-viabilidad` |
| C4 · CaminoEncontrarConstruir | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-camino-encontrar-construir` |
| C5 · BatchValidacion | REFLEJO | reflejo | CONSTRUIR | `nichos-batch-validacion` |
| C6 · CortadorTempranoSangria | REFLEJO | reflejo | CONSTRUIR | `nichos-cortador-temprano` |
| C7 · ReglasAprendidasValidacion | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-reglas-aprendidas-validacion` |
| D1 · EnsambladorSolucion | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-ensamblador-solucion` |
| D2 · PuenteHumano | PUENTE | puente | CONSTRUIR | `nichos-puente-humano` |
| D3 · CatalogoCapacidadesFaltantes | CUSTODIO | custodio | CONSTRUIR | `nichos-catalogo-capacidades` |
| D4 · ProponedorModeloCobro | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-proponedor-modelo-cobro` |
| E1 · EstudioCompetencia | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-estudio-competencia` |
| E2 · GateDecisionOperar | PUENTE | puente | CONSTRUIR | `nichos-gate-decision-operar` |
| E3 · MotorCobro | REFLEJO | reflejo | CONSTRUIR | `nichos-motor-cobro` |
| E4 · CanalDistribucion | PUENTE | puente | CONSTRUIR | `nichos-canal-distribucion` |
| F1 · RegistroCobros | CUSTODIO | custodio | CONSTRUIR | `nichos-registro-cobros` |
| F2 · ImputacionCostesProyecto | REFLEJO | reflejo | CONSTRUIR | `nichos-imputacion-costes` |
| F3 · CuadroSaludFinanciera | CUSTODIO+REFLEJO | custodio | CONSTRUIR | `nichos-cuadro-salud` |
| F4 · AlertaSangria | PUENTE | puente | CONSTRUIR | `nichos-alerta-sangria` |
| G1 · PuertoCanal + RegistroCanales | PUENTE | puente | CONSTRUIR | `nichos-puerto-canal` |
| G2 · EscalonesMensaje | REFLEJO | reflejo | CONSTRUIR | `nichos-escalones-mensaje` |
| G3 · ClasificadorIntencion | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-clasificador-intencion` |
| H1 · PaquetadorDecisionAutoexplicado | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-paquetador-decision` |
| H2 · PerfilSupervision | CUSTODIO | custodio | CONSTRUIR | `nichos-perfil-supervision` |
| I1/M1 · PerfilCobroEntregaPorNicho | CUSTODIO | custodio | CONSTRUIR | `nichos-perfil-cobro-entrega` |
| I2/M2 · PropuestaValorCanal | MICRO-AGENTE | micro-agente | CONSTRUIR | `nichos-propuesta-valor-canal` |
| I3/M3 · ConfirmacionValorRecibido | CUSTODIO+REFLEJO | custodio | CONSTRUIR | `nichos-confirmacion-valor` |
| J1 · PuertoFuenteDatos | PUENTE | puente | CONSTRUIR | `nichos-puerto-fuente-datos` |
| J2 · ConversorFuente | CONVERSOR | conversor | CONSTRUIR | `nichos-conversor-fuente` |
| J3 · GestionLimitesFuente | REFLEJO | reflejo | CONSTRUIR | `nichos-gestion-limites-fuente` |
| J4 · ImputadorCosteFuente | REFLEJO | reflejo | CONSTRUIR | `nichos-imputacion-coste-fuente` |
| K1 · VistaAgregadaPortafolio | REFLEJO+CUSTODIO | custodio | CONSTRUIR | `nichos-vista-portafolio` |
| K2 · ColaDecisionesGate | CUSTODIO | custodio | CONSTRUIR | `nichos-cola-decisiones` |
| K3 · AjustadorUmbrales | REFLEJO+CUSTODIO | reflejo | CONSTRUIR | `nichos-ajustador-umbrales` |
| L1 · PipelinePorNicho | CUSTODIO (state machine) | custodio | CONSTRUIR | `nichos-pipeline` |
| L2 · ColaCandidatosValidacion | CUSTODIO | custodio | CONSTRUIR | `nichos-cola-candidatos` |
| L3 · ManejoFalloReintento | REFLEJO+PUENTE | reflejo | CONSTRUIR | `nichos-manejo-fallo` |
| L4 · HistorialPorNicho | CUSTODIO (append-only) | custodio | CONSTRUIR | `nichos-historial` |
| L5 · PulsoAvanceEtapa | REFLEJO | reflejo | CONSTRUIR | `nichos-pulso-avance` |
| ESLABÓN · OrquestadorNicho | ORQUESTADOR | micro-agente | CONSTRUIR | `nichos-orquestador` |

**Total CONSTRUIR:** 45 hojas (44 F3 + 1 eslabón orquestador).

Los value objects `SolicitudDecision` / `RespuestaDecision` son **payloads** de
eventos del canon, no hojas-módulo. Viven dentro de los eventos
`nichos.decision.solicitud.abierta` / `nichos.decision.solicitud.respondida`
que publica/escucha `nichos-cola-decisiones` (K2).

---

## 3 · Tabla de eventos canónicos del dominio `nichos`

> Cada evento declarado UNA vez. La grafía aquí es la que se cita idéntica en
> cada manifest que lo publique o escuche. El payload mínimo describe los
> campos tipados que el consumidor puede dar por supuestos; `correlation_id`,
> `timestamp` y `source` son invariantes transversales de TODO evento del bus
> (no se repiten en cada fila).

### 3.1 · PULSOS fire-and-forget (familia participio)

| Evento | Emisor | Familia | Payload mínimo |
|---|---|---|---|
| `nichos.semilla.capturada` | A1 | pulso | `{ id_nicho, texto, autor, canal }` |
| `nichos.semilla.normalizada` | A2 | pulso | `{ id_nicho, intenciones[], nitidez }` |
| `nichos.semilla.normalizada.failed` | A2 | pulso.failed | `{ id_nicho, razon_codigo, detalle }` |
| `nichos.candidato.detectado` | B1 | pulso | `{ id_nicho, titulo, territorio, senal, evidencia[] }` |
| `nichos.sondeo.completado` | B1 | pulso | `{ id_nicho, candidatos_total }` |
| `nichos.sondeo.failed` | B1 | pulso.failed | `{ id_nicho, razon_codigo, detalle }` |
| `nichos.reglas.exclusion.actualizadas` | B2 | pulso | `{ semilla_firma, patrones_total }` |
| `nichos.perfil.limite.declarado` | B3 | pulso | `{ version, por_autor }` |
| `nichos.perfil.limite.declarado.failed` | B3 | pulso.failed | `{ razon_codigo, detalle }` |
| `nichos.estudio.demanda.completado` | C1 | pulso | `{ id_nicho, demanda_1er_orden, disposicion_a_pagar, fuentes_usadas[], coste }` |
| `nichos.estudio.demanda.failed` | C1 | pulso.failed | `{ id_nicho, razon_codigo, detalle }` |
| `nichos.criterio.viabilidad.declarado` | C2 | pulso | `{ version, por_autor }` |
| `nichos.criterio.viabilidad.declarado.failed` | C2 | pulso.failed | `{ razon_codigo, detalle }` |
| `nichos.veredicto.emitido` | C3 | pulso | `{ id_nicho, decision: VIABLE\|NO_VIABLE\|PUENTE, razon }` |
| `nichos.camino.decidido` | C4 | pulso | `{ id_nicho, tipo: ENCONTRAR\|CONSTRUIR }` |
| `nichos.validacion.lote.iniciado` | C5 | pulso | `{ lote_id, candidatos_total }` |
| `nichos.validacion.lote.completado` | C5 | pulso | `{ lote_id, viables, no_viables, puentes }` |
| `nichos.cortado.pre.construccion` | C6 | pulso | `{ id_nicho, razon }` |
| `nichos.regla.aprendida.propuesta` | C7 | pulso | `{ patron, umbral_actual, umbral_sugerido }` |
| `nichos.construccion.iniciada` | D1 | pulso | `{ id_proyecto }` |
| `nichos.construccion.completada` | D1 | pulso | `{ id_proyecto, capacidades_creadas[], capacidades_pendientes[] }` |
| `nichos.construccion.failed` | D1 | pulso.failed | `{ id_proyecto, razon_codigo, detalle }` |
| `nichos.puente.humano.alzado` | D2 | pulso | `{ id_nicho, bloqueo, paquete }` |
| `nichos.catalogo.capacidad.encargada` | D3 | pulso | `{ capacidad_id, descripcion }` |
| `nichos.catalogo.capacidad.disponible` | D3 | pulso | `{ capacidad_id }` |
| `nichos.modelo.cobro.propuesto` | D4 | pulso | `{ id_proyecto, modelo }` |
| `nichos.competencia.estudiada` | E1 | pulso | `{ id_proyecto, panorama, diferencial, fuentes_usadas[] }` |
| `nichos.gate.operar.abierto` | E2 | pulso | `{ id_proyecto, solicitud_id, paquete }` |
| `nichos.cobro.registrado` | E3 | pulso | `{ id_proyecto, tipo: EFECTIVO\|COMPROMETIDO\|DEVUELTO, importe, cobro_ref }` |
| `nichos.cobro.failed` | E3 | pulso.failed | `{ id_proyecto, razon_codigo, detalle }` |
| `nichos.distribucion.realizada` | E4 | pulso | `{ id_proyecto, canal, envio_ref }` |
| `nichos.distribucion.failed` | E4 | pulso.failed | `{ id_proyecto, razon_codigo, detalle }` |
| `nichos.salud.recalculada` | F3 | pulso | `{ id_proyecto, estado: GENERA\|SANGRA\|NEUTRO, flujo }` |
| `nichos.sangria.alerta.emitida` | F4 | pulso | `{ id_proyecto, solicitud_id, vista }` |
| `nichos.canal.mensaje.recibido` | G1 | pulso | `{ canal, autor, cuerpo, meta }` |
| `nichos.canal.mensaje.enviado` | G1 | pulso | `{ canal, destino, escalon, confirmacion_ref }` |
| `nichos.canal.registrado` | G1 | pulso | `{ canal, external_id, project_id }` |
| `nichos.escalon.clasificado` | G2 | pulso | `{ evento_ref, escalon: PULSO\|ALERTA\|DECISION\|SILENCIO }` |
| `nichos.intencion.clasificada` | G3 | pulso | `{ mensaje_ref, tipo: SEMILLA\|RESPUESTA_DECISION\|CONSULTA\|AJUSTE_CONFIG\|DESCONOCIDO }` |
| `nichos.paquete.decision.redactado` | H1 | pulso | `{ nicho_id, narrativa, riesgo, alternativa }` |
| `nichos.perfil.supervision.declarado` | H2 | pulso | `{ version, por_autor }` |
| `nichos.perfil.cobro.declarado` | I1 | pulso | `{ tipo_nicho, version, por_autor }` |
| `nichos.propuesta.valor.redactada` | I2 | pulso | `{ id_proyecto, canal, tono, gancho }` |
| `nichos.feedback.ingerido` | I3 | pulso | `{ id_proyecto, entrada_ref }` |
| `nichos.fuente.consumida` | J3 | pulso | `{ fuente, importe, margen_restante }` |
| `nichos.fuente.coste.registrado` | J4 | pulso | `{ id_proyecto, fuente, importe }` |
| `nichos.portafolio.recalculado` | K1 | pulso | `{ vista, generan, sangran, flujo_total }` |
| `nichos.decision.solicitud.abierta` | K2 | pulso | `{ solicitud_id, tipo, contexto, opciones[], caducidad }` |
| `nichos.decision.solicitud.respondida` | K2 | pulso | `{ solicitud_id, opcion_elegida, dueno, nota_libre }` |
| `nichos.decision.solicitud.caducada` | K2 | pulso | `{ solicitud_id, caducidad }` |
| `nichos.umbral.ajustado` | K3 | pulso | `{ destino: CRITERIO\|PERFIL_LIMITE\|PERFIL_SUPERVISION, cambio, por_autor }` |
| `nichos.pipeline.transicion.aplicada` | L1 | pulso | `{ id, desde, hasta, causa, autor }` |
| `nichos.pipeline.transicion.ilegal` | L1 | pulso.failed | `{ id, desde, hasta, razon_codigo: TRANSICION_ILEGAL }` |
| `nichos.candidato.encolado` | L2 | pulso | `{ id_nicho, posicion }` |
| `nichos.fallo.reintentado` | L3 | pulso | `{ fallo_id, intento, proximo_delay }` |
| `nichos.historial.registrado` | L4 | pulso | `{ id, evento }` |
| `nichos.pulso.avance.emitido` | L5 | pulso | `{ id_proyecto, estado_actual, instante }` |
| `nichos.pipeline.ciclo.iniciado` | Orquestador | pulso | `{ id_nicho, mensaje_ref }` |
| `nichos.pipeline.ciclo.cerrado.exito` | Orquestador | pulso | `{ id_proyecto, resumen }` |

### 3.2 · RPCs (terna cerrada: `.request` / `.response` / `.failed`)

Cada atendedor DECLARA la terna completa en SU manifest (`subscribes` el
`.request`; `publishes` el `.response` y el `.failed`). El emisor declara el
`.request` en su `publishes` y las dos del par en su `subscribes` si
necesita leer la respuesta.

| RPC (prefijo) | Atendedor | Verbo | Payload request mínimo | Payload response mínimo |
|---|---|---|---|---|
| `nichos.semilla.capturar` | A1 | capturar | `{ mensaje }` | `{ semilla }` |
| `nichos.semilla.normalizar` | A2 | normalizar | `{ semilla }` | `{ semilla_normalizada \| solicitud_decision }` |
| `nichos.perfil.limite.leer` | B3 | leer | `{}` | `{ perfil_limite }` |
| `nichos.perfil.limite.declarar` | B3 | declarar | `{ cambio, por_autor }` | `{ nueva_version }` |
| `nichos.reglas.exclusion.consultar` | B2 | consultar | `{ semilla }` | `{ conjunto_reglas }` |
| `nichos.territorio.sondear` | B1 | sondear | `{ semilla_normalizada }` | `{ candidatos[] \| solicitud_decision }` |
| `nichos.criterio.viabilidad.leer` | C2 | leer | `{}` | `{ umbral_viabilidad }` |
| `nichos.criterio.viabilidad.declarar` | C2 | declarar | `{ cambio, por_autor }` | `{ nueva_version }` |
| `nichos.demanda.estudiar` | C1 | estudiar | `{ candidato, correlacion }` | `{ informe }` |
| `nichos.veredicto.emitir` | C3 | emitir | `{ informe }` | `{ veredicto }` |
| `nichos.camino.decidir` | C4 | decidir | `{ informe, veredicto }` | `{ camino \| solicitud_decision }` |
| `nichos.validacion.lote.correr` | C5 | correr | `{ tamano? }` | `{ lote_id, procesados }` |
| `nichos.cortar.temprano` | C6 | cortar | `{ id_nicho, veredicto }` | `{ transicion }` |
| `nichos.aprendizaje.proponer` | C7 | proponer | `{}` | `{ solicitud_decision? \| vacio }` |
| `nichos.catalogo.capacidad.disponibles` | D3 | disponibles | `{}` | `{ capacidades[] }` |
| `nichos.catalogo.capacidad.encargar` | D3 | encargar | `{ capacidad }` | `{ encargo }` |
| `nichos.catalogo.capacidad.promover` | D3 | promover | `{ capacidad }` | `{ estado_catalogo }` |
| `nichos.solucion.ensamblar` | D1 | ensamblar | `{ id_nicho, veredicto, camino }` | `{ solucion \| puente_humano_aviso \| solicitud_decision }` |
| `nichos.puente.humano.alzar` | D2 | alzar | `{ id_nicho, bloqueo }` | `{ solicitud_decision }` |
| `nichos.modelo.cobro.proponer` | D4 | proponer | `{ id_nicho, solucion }` | `{ modelo_cobro }` |
| `nichos.competencia.estudiar` | E1 | estudiar | `{ solucion }` | `{ informe_competencia }` |
| `nichos.gate.operar.abrir` | E2 | abrir | `{ solucion, competencia, modelo }` | `{ solicitud_decision }` |
| `nichos.cobro.ejecutar` | E3 | ejecutar | `{ id_proyecto, modelo, venta }` | `{ cobro \| promesa_cobro }` |
| `nichos.distribucion.llevar` | E4 | llevar | `{ solucion, modelo }` | `{ envio }` |
| `nichos.registro.cobros.registrar` | F1 | registrar | `{ entrada_cobro, por_autor }` | `{ ref_cobro }` |
| `nichos.registro.cobros.consultar` | F1 | consultar | `{ filtro }` | `{ entradas[] }` |
| `nichos.costes.imputar` | F2 | imputar | `{ id_proyecto, hasta }` | `{ coste_total }` |
| `nichos.cuadro.salud.estado` | F3 | estado | `{ id_proyecto }` | `{ vista_proyecto }` |
| `nichos.cuadro.salud.recalcular` | F3 | recalcular | `{ id_proyecto, hasta }` | `{ vista_proyecto }` |
| `nichos.sangria.barrer` | F4 | barrer | `{ ahora }` | `{ solicitudes_emitidas[] }` |
| `nichos.canal.enviar` | G1 | enviar | `{ canal?, destino, mensaje }` | `{ confirmacion }` |
| `nichos.canal.registrar` | G1 | registrar | `{ canal, external_id, project_id, purpose }` | `{ registrado }` |
| `nichos.escalon.clasificar` | G2 | clasificar | `{ evento_dominio }` | `{ escalon }` |
| `nichos.intencion.clasificar` | G3 | clasificar | `{ mensaje_entrante }` | `{ intencion_entrante }` |
| `nichos.paquete.decision.empaquetar` | H1 | empaquetar | `{ nicho_id, evidencia, riesgo, alternativa }` | `{ paquete_contexto }` |
| `nichos.perfil.supervision.leer` | H2 | leer | `{}` | `{ perfil_supervision }` |
| `nichos.perfil.supervision.declarar` | H2 | declarar | `{ cambio, por_autor }` | `{ nueva_version }` |
| `nichos.perfil.cobro.plantilla` | I1 | plantilla | `{ tipo_nicho }` | `{ perfil_cobro_entrega }` |
| `nichos.perfil.cobro.declarar` | I1 | declarar | `{ cambio, por_autor }` | `{ nueva_version }` |
| `nichos.propuesta.valor.redactar` | I2 | redactar | `{ nicho, panorama, canal }` | `{ propuesta_valor }` |
| `nichos.feedback.ingerir` | I3 | ingerir | `{ feedback_crudo }` | `{ entrada_feedback }` |
| `nichos.feedback.consultar` | I3 | consultar | `{ proyecto }` | `{ entradas[] }` |
| `nichos.fuente.consumir` | J1 | consumir | `{ fuente, peticion }` | `{ resultado_crudo }` |
| `nichos.conversor.normalizar` | J2 | normalizar | `{ crudo, origen }` | `{ dato_homogeneo }` |
| `nichos.fuente.limites.puede.consumir` | J3 | puedeConsumir | `{ fuente }` | `{ puede, margen }` |
| `nichos.fuente.coste.consultar` | J4 | consultar | `{ id_proyecto, hasta }` | `{ coste }` |
| `nichos.portafolio.vista` | K1 | vista | `{ ahora }` | `{ vista_portafolio }` |
| `nichos.cola.decisiones.encolar` | K2 | encolar | `{ solicitud_decision }` | `{ encolada }` |
| `nichos.cola.decisiones.siguientes` | K2 | siguientes | `{ dueno }` | `{ solicitudes[] }` |
| `nichos.cola.decisiones.cerrar` | K2 | cerrar | `{ solicitud_id, respuesta }` | `{ cerrada }` |
| `nichos.umbrales.ajustar` | K3 | ajustar | `{ respuesta_decision, por_autor }` | `{ aplicados[] }` |
| `nichos.pipeline.transitar` | L1 | transitar | `{ id, transicion }` | `{ estado_nuevo }` |
| `nichos.pipeline.estado` | L1 | estado | `{ id }` | `{ estado_actual }` |
| `nichos.cola.candidatos.encolar` | L2 | encolar | `{ candidato }` | `{ encolado }` |
| `nichos.cola.candidatos.sacar` | L2 | sacar | `{ n }` | `{ lote[] }` |
| `nichos.fallo.manejar` | L3 | manejar | `{ fallo }` | `{ accion_tomada }` |
| `nichos.historial.registrar` | L4 | registrar | `{ id, evento }` | `{ registrado }` |
| `nichos.historial.cronologia` | L4 | cronologia | `{ id }` | `{ eventos[] }` |
| `nichos.pulso.avance.barrer` | L5 | barrer | `{ ahora }` | `{ pulsos_emitidos }` |
| `nichos.ciclo.abrir` | Orquestador | abrir | `{ mensaje }` | `{ id_nicho }` |
| `nichos.gate.cerrar` | Orquestador | cerrar | `{ mensaje_respuesta }` | `{ solicitud_id, aplicado }` |

### 3.3 · Invariantes transversales del transporte

- `correlation_id` propaga por toda la cadena del nicho; nada emite sin él.
- Cada acción con riesgo cierra su par `.failed`; nunca un flujo muere mudo.
- `fuentes_usadas[]` queda rastreable en los eventos que consumen puertos de
  datos (auditoría del coste imputable a cada proyecto).
- QoS1 + unicidad por `correlation_id` en el handler = idempotencia (patrón
  Enki, no QoS2).

---

## 4 · Hojas CONSTRUIR — 45 hojas, 7 etapas por hoja

> Convención compacta. Las 7 etapas se dicen en una ficha de alta densidad para
> que F4 pueda compilarla sin ambigüedad: **A** dependencias (bases _shared +
> eventos del canon que escucha/publica), **B** `module.json` esqueleto, **C**
> `index.js` (extends `ModuloHibridoReflejo`, `onUnload` flush, hidratar en
> `project.activated` si hay `PosPersistencia`), **D** proyecciones puras
> `_op(input) → {status, data}`, **E** handlers RPC `on<Op>Request`, **F**
> pulsos del canon + par `.failed`, **VERIFICACIÓN** smoke mínimo. Los nombres
> de evento SON los del §3; cualquier variante aquí es error del plan, no
> licencia del constructor.
>
> **Base común (A).** Todas las hojas dependen de `_shared/modulo-hibrido-reflejo`
> (clase base del canon híbrido) y, cuando persisten estado, de
> `_shared/pos-persistencia` (hidratación por `project.activated`). Lo que
> cambia de hoja en hoja es la lista de eventos del CANON y el store local.

### 4.A · Bloque A — ENTRADA (SEMILLA-BUSCADOR)

#### nichos-capturador-semilla  —  reflejo

```
A. DEPENDENCIAS   _shared/modulo-hibrido-reflejo · nichos.semilla.capturar.{request,response}
                   · nichos.semilla.capturada
B. MODULE.JSON    name:"nichos-capturador-semilla" · version:"0.1.0"
                   publishes:[ nichos.semilla.capturada, nichos.semilla.capturar.response,
                                nichos.semilla.capturar.failed ]
                   subscribes:[ { event: nichos.semilla.capturar.request,
                                   handler: onCapturarRequest } ]
C. INDEX.JS       class CapturadorSemilla extends ModuloHibridoReflejo
                   { sin estado persistido · onUnload no-op }
D. PROYECCIONES   _capturar({mensaje}) → {status:'ok', data:{semilla:{id,texto,autor,canal,ts}}}
                   · _mintId(): genera id_nicho determinista (hash corto de texto+ts)
E. HANDLERS RPC   onCapturarRequest(e) → _atender(e,'capturar',
                     'nichos.semilla.capturar.response', d => this._capturar(d))
F. EVENTOS        PULSO nichos.semilla.capturada {id_nicho,texto,autor,canal}
                   FALLO nichos.semilla.capturar.failed {razon_codigo,detalle}
VERIFICACIÓN      smoke: publishAndWait(.request,{mensaje}) → .response con semilla.id
                   + oyente capta nichos.semilla.capturada; no toca disco.
```

#### nichos-normalizador-semilla  —  micro-agente

```
A. DEPENDENCIAS   _shared/modulo-hibrido-reflejo · ai-gateway (llm.complete) ·
                   nichos.semilla.normalizar.{request,response,failed}
                   · nichos.semilla.normalizada / .failed · nichos.decision.solicitud.abierta
B. MODULE.JSON    publishes:[ nichos.semilla.normalizada, nichos.semilla.normalizada.failed,
                               nichos.semilla.normalizar.response, llm.complete.request,
                               nichos.decision.solicitud.abierta ]
                   subscribes:[ { nichos.semilla.normalizar.request, onNormalizarRequest } ]
C. INDEX.JS       MICRO-AGENTE con cajón blueprint:
                   · reflejo delega al LLM via ai-gateway (prompt destilador)
                   · si nitidez < umbral → publica nichos.decision.solicitud.abierta
D. PROYECCIONES   _normalizar({semilla}) → {status, data:{intenciones[], nitidez} | solicitud_decision}
                   · _nitidez(ints): heurística 0..1
E. HANDLERS RPC   onNormalizarRequest → _atender('normalizar', ...response, _normalizar)
F. EVENTOS        PULSO nichos.semilla.normalizada {id_nicho,intenciones[],nitidez}
                   FALLO nichos.semilla.normalizada.failed {razon_codigo,detalle}
VERIFICACIÓN      smoke: semilla ambigua → emite solicitud_decision; semilla nítida → pulso.
```

### 4.B · Bloque B — BÚSQUEDA (BUSCADOR F1)

#### nichos-sondeador-territorio  —  micro-agente

```
A. DEPENDENCIAS   crawl4rs (buscar/leer) · nichos-reglas-exclusion · nichos-perfil-limite-busqueda
                   · nichos-puerto-fuente-datos (fuentes externas)
B. MODULE.JSON    publishes:[ nichos.candidato.detectado, nichos.sondeo.completado,
                               nichos.sondeo.failed, nichos.territorio.sondear.response,
                               nichos.reglas.exclusion.consultar.request,
                               nichos.perfil.limite.leer.request,
                               nichos.fuente.consumir.request ]
                   subscribes:[ { nichos.territorio.sondear.request, onSondearRequest } ]
C. INDEX.JS       MICRO-AGENTE. Sin store propio (candidatos van al pulso).
D. PROYECCIONES   _sondear({semilla_normalizada}) → {candidatos[]|solicitud_decision}
                   · _dedupeContraExclusion · _recortarALimite
E. HANDLERS RPC   onSondearRequest → _atender('sondear',...response,_sondear)
F. EVENTOS        PULSO nichos.candidato.detectado (uno por candidato) ·
                   nichos.sondeo.completado {candidatos_total} · .failed
VERIFICACIÓN      smoke: semilla→candidatos pasando filtros de B2 y B3.
```

#### nichos-reglas-exclusion  —  micro-agente

```
A. DEPENDENCIAS   PosPersistencia · ai-gateway (destilado de patrones)
B. MODULE.JSON    publishes:[ nichos.reglas.exclusion.actualizadas,
                               nichos.reglas.exclusion.consultar.response ]
                   subscribes:[ { nichos.reglas.exclusion.consultar.request, onConsultarRequest },
                                 { nichos.sondeo.completado, onSondeoCompletado } ]
C. INDEX.JS       CUSTODIO ligero + MICRO-AGENTE: aprende patrones del feedback.
                   Store: /nichos/exclusiones.json (por semilla.firma).
D. PROYECCIONES   _consultar({semilla}) → {conjunto_reglas[]}
                   · _ingerirFeedback({sondeo}): emite .actualizadas al mutar
E. HANDLERS RPC   onConsultarRequest → _atender('consultar',...)
F. EVENTOS        PULSO nichos.reglas.exclusion.actualizadas
VERIFICACIÓN      smoke: consultar sin histórico → conjunto vacío; tras N sondeos → patrones.
```

#### nichos-perfil-limite-busqueda  —  custodio

```
A. DEPENDENCIAS   PosPersistencia · project.activated
B. MODULE.JSON    publishes:[ nichos.perfil.limite.declarado, .declarado.failed,
                               nichos.perfil.limite.leer.response,
                               nichos.perfil.limite.declarar.response ]
                   subscribes:[ { nichos.perfil.limite.leer.request, onLeerRequest },
                                 { nichos.perfil.limite.declarar.request, onDeclararRequest },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO. Store /nichos/perfil-limite.json {version, limites, por_autor}.
D. PROYECCIONES   _leer() → {perfil_limite}
                   · _declarar({cambio,por_autor}) → {nueva_version} · emite .declarado
E. HANDLERS RPC   onLeerRequest · onDeclararRequest (ambos vía _atender)
F. EVENTOS        PULSO nichos.perfil.limite.declarado · .declarado.failed
VERIFICACIÓN      smoke: leer sin fichero → esqueleto por defecto; declarar → versión++ en disco.
```

### 4.C · Bloque C — VALIDACIÓN (VALIDADOR F2, ESLABÓN LIMITANTE)

#### nichos-estudio-demanda  —  micro-agente

```
A. DEPENDENCIAS   ai-gateway · nichos-puerto-fuente-datos · nichos-gestion-limites-fuente
B. MODULE.JSON    publishes:[ nichos.estudio.demanda.completado, .failed,
                               nichos.demanda.estudiar.response,
                               nichos.fuente.consumir.request,
                               nichos.fuente.limites.puede.consumir.request ]
                   subscribes:[ { nichos.demanda.estudiar.request, onEstudiarRequest } ]
C. INDEX.JS       MICRO-AGENTE. Sin estado (el informe viaja en el response).
D. PROYECCIONES   _estudiar({candidato,correlacion}) → {informe:{demanda_1er_orden,
                                                        disposicion_a_pagar,fuentes_usadas[],coste}}
                   · _agregarFuentes · _coste
E. HANDLERS RPC   onEstudiarRequest → _atender('estudiar',...)
F. EVENTOS        PULSO nichos.estudio.demanda.completado · .failed
VERIFICACIÓN      smoke: candidato → informe con fuentes_usadas no vacío + coste imputado.
```

#### nichos-criterio-viabilidad  —  custodio

```
A. DEPENDENCIAS   PosPersistencia · project.activated
B. MODULE.JSON    publishes:[ nichos.criterio.viabilidad.declarado, .declarado.failed,
                               nichos.criterio.viabilidad.leer.response, .declarar.response ]
                   subscribes:[ { nichos.criterio.viabilidad.leer.request, onLeerRequest },
                                 { nichos.criterio.viabilidad.declarar.request, onDeclararRequest },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO. Store /nichos/criterio-viabilidad.json {version, umbral_viabilidad}.
D. PROYECCIONES   _leer() · _declarar(cambio,por_autor)
E. HANDLERS RPC   onLeerRequest · onDeclararRequest
F. EVENTOS        PULSO .declarado + .failed
VERIFICACIÓN      smoke: declarar nuevo umbral → leer refleja el cambio y versión avanzada.
```

#### nichos-veredicto-viabilidad  —  micro-agente

```
A. DEPENDENCIAS   nichos-criterio-viabilidad (leer) · ai-gateway (fallback)
B. MODULE.JSON    publishes:[ nichos.veredicto.emitido, nichos.veredicto.emitir.response,
                               nichos.criterio.viabilidad.leer.request ]
                   subscribes:[ { nichos.veredicto.emitir.request, onEmitirRequest } ]
C. INDEX.JS       MICRO-AGENTE puro. Sin store.
D. PROYECCIONES   _emitir({informe}) → {veredicto:{decision,razon}}
                   · _aplicarCriterio(umbral,informe)
E. HANDLERS RPC   onEmitirRequest → _atender('emitir',...)
F. EVENTOS        PULSO nichos.veredicto.emitido {id_nicho,decision,razon}
VERIFICACIÓN      smoke: informe-fuerte → VIABLE; informe-débil → NO_VIABLE con razón.
```

#### nichos-camino-encontrar-construir  —  micro-agente

```
A. DEPENDENCIAS   nichos-catalogo-capacidades (leer disponibles) · ai-gateway
B. MODULE.JSON    publishes:[ nichos.camino.decidido, nichos.camino.decidir.response,
                               nichos.catalogo.capacidad.disponibles.request,
                               nichos.decision.solicitud.abierta ]
                   subscribes:[ { nichos.camino.decidir.request, onDecidirRequest } ]
C. INDEX.JS       MICRO-AGENTE. Sin store.
D. PROYECCIONES   _decidir({informe,veredicto}) → {camino:ENCONTRAR|CONSTRUIR|solicitud_decision}
E. HANDLERS RPC   onDecidirRequest → _atender('decidir',...)
F. EVENTOS        PULSO nichos.camino.decidido {id_nicho,tipo}
VERIFICACIÓN      smoke: catálogo cubre → ENCONTRAR; catálogo falta → CONSTRUIR o solicitud.
```

#### nichos-batch-validacion  —  reflejo

```
A. DEPENDENCIAS   nichos-cola-candidatos · nichos-sondeador · nichos-estudio-demanda ·
                   nichos-veredicto-viabilidad · nichos-camino-encontrar-construir ·
                   nichos-cortador-temprano · scheduler (opcional)
B. MODULE.JSON    publishes:[ nichos.validacion.lote.iniciado, .completado,
                               nichos.validacion.lote.correr.response,
                               nichos.cola.candidatos.sacar.request,
                               nichos.demanda.estudiar.request,
                               nichos.veredicto.emitir.request,
                               nichos.camino.decidir.request,
                               nichos.cortar.temprano.request ]
                   subscribes:[ { nichos.validacion.lote.correr.request, onCorrerRequest } ]
C. INDEX.JS       REFLEJO orquestador puro. Lote N candidatos → N micro-flujos secuenciales.
D. PROYECCIONES   _correr({tamano}) → {lote_id, procesados:{viables,no_viables,puentes}}
E. HANDLERS RPC   onCorrerRequest → _atender('correr',...)
F. EVENTOS        PULSO nichos.validacion.lote.iniciado · .completado
VERIFICACIÓN      smoke: lote de 3 candidatos ficticios → 3 veredictos emitidos + .completado.
```

#### nichos-cortador-temprano  —  reflejo

```
A. DEPENDENCIAS   nichos-pipeline (transitar) · nichos-historial (registrar)
B. MODULE.JSON    publishes:[ nichos.cortado.pre.construccion, nichos.cortar.temprano.response,
                               nichos.pipeline.transitar.request,
                               nichos.historial.registrar.request ]
                   subscribes:[ { nichos.cortar.temprano.request, onCortarRequest } ]
C. INDEX.JS       REFLEJO. Decisión determinista: NO_VIABLE → transitar a CORTADO.
D. PROYECCIONES   _cortar({id_nicho,veredicto}) → {transicion}
E. HANDLERS RPC   onCortarRequest → _atender('cortar',...)
F. EVENTOS        PULSO nichos.cortado.pre.construccion {id_nicho,razon}
VERIFICACIÓN      smoke: cortar(NO_VIABLE) → pipeline avanza a CORTADO + historial registrado.
```

#### nichos-reglas-aprendidas-validacion  —  micro-agente

```
A. DEPENDENCIAS   PosPersistencia · ai-gateway · nichos-cola-decisiones (abrir solicitud)
B. MODULE.JSON    publishes:[ nichos.regla.aprendida.propuesta, nichos.aprendizaje.proponer.response,
                               nichos.decision.solicitud.abierta ]
                   subscribes:[ { nichos.aprendizaje.proponer.request, onProponerRequest },
                                 { nichos.validacion.lote.completado, onLoteCompletado } ]
C. INDEX.JS       MICRO-AGENTE + CUSTODIO ligero.
                   Store /nichos/aprendizaje/propuestas.json (patrones observados).
D. PROYECCIONES   _proponer() → {solicitud_decision | vacio}
                   · _destilarPatrones (minería del historial)
E. HANDLERS RPC   onProponerRequest → _atender('proponer',...)
F. EVENTOS        PULSO nichos.regla.aprendida.propuesta {patron,umbral_actual,umbral_sugerido}
VERIFICACIÓN      smoke: tras 10 lotes → al menos una propuesta de ajuste de umbral.
```

### 4.D · Bloque D — CONSTRUCCIÓN (CONSTRUCTOR F3)

#### nichos-ensamblador-solucion  —  micro-agente

```
A. DEPENDENCIAS   nichos-catalogo-capacidades · ai-gateway · nichos-puente-humano
B. MODULE.JSON    publishes:[ nichos.construccion.iniciada, .completada, .failed,
                               nichos.solucion.ensamblar.response,
                               nichos.catalogo.capacidad.disponibles.request,
                               nichos.catalogo.capacidad.encargar.request,
                               nichos.puente.humano.alzar.request ]
                   subscribes:[ { nichos.solucion.ensamblar.request, onEnsamblarRequest } ]
C. INDEX.JS       MICRO-AGENTE. Sin store (solución viaja en response).
D. PROYECCIONES   _ensamblar({id_nicho,veredicto,camino}) → {solucion|puente_humano_aviso|solicitud}
                   · _detectarCapacidadesFaltantes
E. HANDLERS RPC   onEnsamblarRequest → _atender('ensamblar',...)
F. EVENTOS        PULSO nichos.construccion.iniciada · .completada · .failed
VERIFICACIÓN      smoke: ENCONTRAR+catálogo-ok → .completada; falta cap → encargar+puente humano.
```

#### nichos-puente-humano  —  puente

```
A. DEPENDENCIAS   nichos-cola-decisiones (abrir) · nichos-puerto-canal (notificar)
B. MODULE.JSON    publishes:[ nichos.puente.humano.alzado, nichos.puente.humano.alzar.response,
                               nichos.cola.decisiones.encolar.request,
                               nichos.canal.enviar.request ]
                   subscribes:[ { nichos.puente.humano.alzar.request, onAlzarRequest } ]
C. INDEX.JS       PUENTE puro. Sin estado.
D. PROYECCIONES   _alzar({id_nicho,bloqueo}) → {solicitud_decision}
E. HANDLERS RPC   onAlzarRequest → _atender('alzar',...)
F. EVENTOS        PULSO nichos.puente.humano.alzado {id_nicho,bloqueo,paquete}
VERIFICACIÓN      smoke: alzar(bloqueo) → cola decisión encolada + mensaje al canal.
```

#### nichos-catalogo-capacidades  —  custodio

```
A. DEPENDENCIAS   PosPersistencia · project.activated
B. MODULE.JSON    publishes:[ nichos.catalogo.capacidad.encargada, .disponible,
                               nichos.catalogo.capacidad.disponibles.response, .encargar.response,
                               .promover.response ]
                   subscribes:[ { nichos.catalogo.capacidad.disponibles.request, onDisponiblesRequest },
                                 { nichos.catalogo.capacidad.encargar.request,    onEncargarRequest },
                                 { nichos.catalogo.capacidad.promover.request,    onPromoverRequest },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO. Store /nichos/catalogo-capacidades.json {capacidades:[{id,estado}]}.
D. PROYECCIONES   _disponibles() · _encargar(cap) · _promover(cap) → {estado_catalogo}
E. HANDLERS RPC   on<Op>Request × 3
F. EVENTOS        PULSO .encargada · .disponible
VERIFICACIÓN      smoke: encargar(X) → estado ENCARGADA; promover(X) → .disponible emitido.
```

#### nichos-proponedor-modelo-cobro  —  micro-agente

```
A. DEPENDENCIAS   nichos-perfil-cobro-entrega (leer) · ai-gateway
B. MODULE.JSON    publishes:[ nichos.modelo.cobro.propuesto, nichos.modelo.cobro.proponer.response,
                               nichos.perfil.cobro.plantilla.request ]
                   subscribes:[ { nichos.modelo.cobro.proponer.request, onProponerRequest } ]
C. INDEX.JS       MICRO-AGENTE. Sin estado.
D. PROYECCIONES   _proponer({id_nicho,solucion}) → {modelo_cobro}
E. HANDLERS RPC   onProponerRequest → _atender('proponer',...)
F. EVENTOS        PULSO nichos.modelo.cobro.propuesto {id_proyecto,modelo}
VERIFICACIÓN      smoke: tipo_nicho SERVICIO → plantilla aplicada + ajuste LLM al dominio.
```

### 4.E · Bloque E — OPERACIÓN (OPERADOR-COBRO F4)

#### nichos-estudio-competencia  —  micro-agente

```
A. DEPENDENCIAS   crawl4rs · ai-gateway · nichos-puerto-fuente-datos · nichos-gestion-limites-fuente
B. MODULE.JSON    publishes:[ nichos.competencia.estudiada, nichos.competencia.estudiar.response,
                               nichos.fuente.consumir.request,
                               nichos.fuente.limites.puede.consumir.request ]
                   subscribes:[ { nichos.competencia.estudiar.request, onEstudiarRequest } ]
C. INDEX.JS       MICRO-AGENTE. Sin estado.
D. PROYECCIONES   _estudiar({solucion}) → {informe_competencia:{panorama,diferencial,fuentes_usadas[]}}
E. HANDLERS RPC   onEstudiarRequest → _atender('estudiar',...)
F. EVENTOS        PULSO nichos.competencia.estudiada
VERIFICACIÓN      smoke: solución → informe con panorama + diferencial no vacíos.
```

#### nichos-gate-decision-operar  —  puente

```
A. DEPENDENCIAS   nichos-cola-decisiones · nichos-paquetador-decision · nichos-perfil-supervision
B. MODULE.JSON    publishes:[ nichos.gate.operar.abierto, nichos.gate.operar.abrir.response,
                               nichos.cola.decisiones.encolar.request,
                               nichos.paquete.decision.empaquetar.request,
                               nichos.perfil.supervision.leer.request ]
                   subscribes:[ { nichos.gate.operar.abrir.request, onAbrirRequest } ]
C. INDEX.JS       PUENTE. Sin estado (el gate es decisión humana).
D. PROYECCIONES   _abrir({solucion,competencia,modelo}) → {solicitud_decision}
E. HANDLERS RPC   onAbrirRequest → _atender('abrir',...)
F. EVENTOS        PULSO nichos.gate.operar.abierto {id_proyecto,solicitud_id,paquete}
VERIFICACIÓN      smoke: abrir → paquete empaquetado + solicitud encolada bajo perfil.
```

#### nichos-motor-cobro  —  reflejo

```
A. DEPENDENCIAS   nichos-registro-cobros (registrar) · credential-manager (gateways)
B. MODULE.JSON    publishes:[ nichos.cobro.registrado, nichos.cobro.failed,
                               nichos.cobro.ejecutar.response,
                               nichos.registro.cobros.registrar.request ]
                   subscribes:[ { nichos.cobro.ejecutar.request, onEjecutarRequest } ]
C. INDEX.JS       REFLEJO. Sin estado propio (lo delega a registro).
D. PROYECCIONES   _ejecutar({id_proyecto,modelo,venta}) → {cobro|promesa_cobro}
E. HANDLERS RPC   onEjecutarRequest → _atender('ejecutar',...)
F. EVENTOS        PULSO nichos.cobro.registrado · nichos.cobro.failed
VERIFICACIÓN      smoke: ejecutar(efectivo) → .registrado; ejecutar(falla) → .failed con razón.
```

#### nichos-canal-distribucion  —  puente

```
A. DEPENDENCIAS   nichos-puerto-canal · credential-manager
B. MODULE.JSON    publishes:[ nichos.distribucion.realizada, nichos.distribucion.failed,
                               nichos.distribucion.llevar.response,
                               nichos.canal.enviar.request ]
                   subscribes:[ { nichos.distribucion.llevar.request, onLlevarRequest } ]
C. INDEX.JS       PUENTE. Sin estado.
D. PROYECCIONES   _llevar({solucion,modelo}) → {envio:{canal,envio_ref}}
E. HANDLERS RPC   onLlevarRequest → _atender('llevar',...)
F. EVENTOS        PULSO nichos.distribucion.realizada · .failed
VERIFICACIÓN      smoke: llevar(telegram) → mensaje enviado + envio_ref retornado.
```

### 4.F · Bloque F — MONITOR SALUD FINANCIERA

#### nichos-registro-cobros  —  custodio

```
A. DEPENDENCIAS   PosPersistencia · project.activated
B. MODULE.JSON    publishes:[ nichos.cobro.registrado, nichos.registro.cobros.registrar.response,
                               nichos.registro.cobros.consultar.response ]
                   subscribes:[ { nichos.registro.cobros.registrar.request, onRegistrarRequest },
                                 { nichos.registro.cobros.consultar.request, onConsultarRequest },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO append-only. Store /nichos/cobros/{id_proyecto}.json
                   {entradas:[{ts,tipo,importe,ref,por_autor}]}.
D. PROYECCIONES   _registrar(entrada) → {ref_cobro} · _consultar(filtro) → {entradas[]}
E. HANDLERS RPC   onRegistrarRequest · onConsultarRequest
F. EVENTOS        PULSO nichos.cobro.registrado (eco canónico tras persistir)
VERIFICACIÓN      smoke: registrar → ref devuelta + fichero crece; consultar → la lee.
```

#### nichos-imputacion-costes  —  reflejo

```
A. DEPENDENCIAS   nichos-imputacion-coste-fuente · nichos-registro-cobros (consultar)
B. MODULE.JSON    publishes:[ nichos.costes.imputar.response,
                               nichos.fuente.coste.consultar.request,
                               nichos.registro.cobros.consultar.request ]
                   subscribes:[ { nichos.costes.imputar.request, onImputarRequest } ]
C. INDEX.JS       REFLEJO. Sin estado (agrega al vuelo).
D. PROYECCIONES   _imputar({id_proyecto,hasta}) → {coste_total:{fuentes,llm,humano,infra}}
E. HANDLERS RPC   onImputarRequest → _atender('imputar',...)
F. EVENTOS        (sin pulso propio — alimenta a nichos-cuadro-salud)
VERIFICACIÓN      smoke: imputar(hasta ahora) → coste_total con desglose por categoría.
```

#### nichos-cuadro-salud  —  custodio

```
A. DEPENDENCIAS   PosPersistencia · nichos-imputacion-costes · nichos-registro-cobros ·
                   project.activated
B. MODULE.JSON    publishes:[ nichos.salud.recalculada, nichos.cuadro.salud.estado.response,
                               nichos.cuadro.salud.recalcular.response,
                               nichos.costes.imputar.request,
                               nichos.registro.cobros.consultar.request ]
                   subscribes:[ { nichos.cuadro.salud.estado.request, onEstadoRequest },
                                 { nichos.cuadro.salud.recalcular.request, onRecalcularRequest },
                                 { nichos.cobro.registrado, onCobroRegistrado },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO + REFLEJO. Store /nichos/salud/{id_proyecto}.json
                   {estado,flujo,ultimo_recalculo}.
D. PROYECCIONES   _estado(id) · _recalcular(id,hasta) → {vista_proyecto}
E. HANDLERS RPC   onEstadoRequest · onRecalcularRequest
F. EVENTOS        PULSO nichos.salud.recalculada {id_proyecto,estado,flujo}
VERIFICACIÓN      smoke: recalcular con cobros>costes → GENERA; con costes>cobros → SANGRA.
```

#### nichos-alerta-sangria  —  puente

```
A. DEPENDENCIAS   nichos-cuadro-salud (estado) · nichos-cola-decisiones · scheduler (barrido)
B. MODULE.JSON    publishes:[ nichos.sangria.alerta.emitida, nichos.sangria.barrer.response,
                               nichos.cola.decisiones.encolar.request,
                               nichos.cuadro.salud.estado.request ]
                   subscribes:[ { nichos.sangria.barrer.request, onBarrerRequest },
                                 { nichos.salud.recalculada, onSaludRecalculada },
                                 { scheduler.job.triggered, onSchedulerTick } ]
C. INDEX.JS       PUENTE. Sin estado (consulta cuadro-salud).
D. PROYECCIONES   _barrer({ahora}) → {solicitudes_emitidas[]}
E. HANDLERS RPC   onBarrerRequest → _atender('barrer',...)
F. EVENTOS        PULSO nichos.sangria.alerta.emitida {id_proyecto,solicitud_id,vista}
VERIFICACIÓN      smoke: proyecto en SANGRA → alerta emitida + decisión encolada al dueño.
```

### 4.G · Bloque G — CANAL SUPERVISIÓN

#### nichos-puerto-canal  —  puente

```
A. DEPENDENCIAS   channel-manager (registry) · telegram-bridge · credential-manager
B. MODULE.JSON    publishes:[ nichos.canal.mensaje.recibido, .enviado, .registrado,
                               nichos.canal.enviar.response,
                               nichos.canal.registrar.response ]
                   subscribes:[ { nichos.canal.enviar.request, onEnviarRequest },
                                 { nichos.canal.registrar.request, onRegistrarRequest },
                                 { telegram.text.received, onTelegramText } ]
C. INDEX.JS       PUENTE (fachada de nichos sobre canales reales).
                   Store opcional /nichos/canales.json (atajos por propósito).
D. PROYECCIONES   _enviar({canal?,destino,mensaje}) → {confirmacion}
                   · _registrar({canal,external_id,project_id,purpose}) → {registrado}
E. HANDLERS RPC   onEnviarRequest · onRegistrarRequest
F. EVENTOS        PULSO .recibido · .enviado · .registrado
VERIFICACIÓN      smoke: enviar(telegram,chat_x,"hola") → confirmación + .enviado pulso.
```

#### nichos-escalones-mensaje  —  reflejo

```
A. DEPENDENCIAS   nichos-perfil-supervision (leer umbrales)
B. MODULE.JSON    publishes:[ nichos.escalon.clasificado, nichos.escalon.clasificar.response,
                               nichos.perfil.supervision.leer.request ]
                   subscribes:[ { nichos.escalon.clasificar.request, onClasificarRequest } ]
C. INDEX.JS       REFLEJO puro.
D. PROYECCIONES   _clasificar({evento_dominio}) → {escalon:PULSO|ALERTA|DECISION|SILENCIO}
E. HANDLERS RPC   onClasificarRequest → _atender('clasificar',...)
F. EVENTOS        PULSO nichos.escalon.clasificado
VERIFICACIÓN      smoke: alerta_sangria → DECISION; pulso_avance → PULSO (bajo perfil normal).
```

#### nichos-clasificador-intencion  —  micro-agente

```
A. DEPENDENCIAS   ai-gateway · nichos-cola-decisiones (contexto)
B. MODULE.JSON    publishes:[ nichos.intencion.clasificada, nichos.intencion.clasificar.response ]
                   subscribes:[ { nichos.intencion.clasificar.request, onClasificarRequest },
                                 { nichos.canal.mensaje.recibido, onMensajeRecibido } ]
C. INDEX.JS       MICRO-AGENTE. Sin estado.
D. PROYECCIONES   _clasificar({mensaje_entrante}) → {intencion_entrante:{tipo}}
E. HANDLERS RPC   onClasificarRequest → _atender('clasificar',...)
F. EVENTOS        PULSO nichos.intencion.clasificada
VERIFICACIÓN      smoke: "cobra el gasto" → AJUSTE_CONFIG; "nueva idea X" → SEMILLA.
```

### 4.H · Bloque H — INTERLOCUTOR DUEÑO

#### nichos-paquetador-decision  —  micro-agente

```
A. DEPENDENCIAS   ai-gateway · nichos-historial · nichos-cuadro-salud
B. MODULE.JSON    publishes:[ nichos.paquete.decision.redactado,
                               nichos.paquete.decision.empaquetar.response,
                               nichos.historial.cronologia.request,
                               nichos.cuadro.salud.estado.request ]
                   subscribes:[ { nichos.paquete.decision.empaquetar.request, onEmpaquetarRequest } ]
C. INDEX.JS       MICRO-AGENTE. Sin estado.
D. PROYECCIONES   _empaquetar({nicho_id,evidencia,riesgo,alternativa}) → {paquete_contexto}
E. HANDLERS RPC   onEmpaquetarRequest → _atender('empaquetar',...)
F. EVENTOS        PULSO nichos.paquete.decision.redactado
VERIFICACIÓN      smoke: nicho con historial → paquete con narrativa + riesgo + alternativa.
```

#### nichos-perfil-supervision  —  custodio

```
A. DEPENDENCIAS   PosPersistencia · project.activated
B. MODULE.JSON    publishes:[ nichos.perfil.supervision.declarado,
                               nichos.perfil.supervision.leer.response, .declarar.response ]
                   subscribes:[ { nichos.perfil.supervision.leer.request, onLeerRequest },
                                 { nichos.perfil.supervision.declarar.request, onDeclararRequest },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO. Store /nichos/perfil-supervision.json {version,umbrales,escalones,modo}.
D. PROYECCIONES   _leer() · _declarar(cambio,por_autor)
E. HANDLERS RPC   onLeerRequest · onDeclararRequest
F. EVENTOS        PULSO nichos.perfil.supervision.declarado
VERIFICACIÓN      smoke: declarar modo="silencioso" → .leer refleja + versión++ en disco.
```

### 4.I · Bloque I — INTERLOCUTOR CLIENTE (M1·M2·M3)

#### nichos-perfil-cobro-entrega  —  custodio

```
A. DEPENDENCIAS   PosPersistencia · project.activated
B. MODULE.JSON    publishes:[ nichos.perfil.cobro.declarado,
                               nichos.perfil.cobro.plantilla.response, .declarar.response ]
                   subscribes:[ { nichos.perfil.cobro.plantilla.request, onPlantillaRequest },
                                 { nichos.perfil.cobro.declarar.request, onDeclararRequest },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO. Store /nichos/perfiles-cobro/{tipo_nicho}.json.
D. PROYECCIONES   _plantilla(tipo_nicho) → {perfil_cobro_entrega}
                   · _declarar(cambio,por_autor)
E. HANDLERS RPC   onPlantillaRequest · onDeclararRequest
F. EVENTOS        PULSO nichos.perfil.cobro.declarado
VERIFICACIÓN      smoke: plantilla(SERVICIO) → esqueleto por defecto; declarar cambio → persistido.
```

#### nichos-propuesta-valor-canal  —  micro-agente

```
A. DEPENDENCIAS   ai-gateway · carta-marketing (si vive: perfil marca; opcional)
B. MODULE.JSON    publishes:[ nichos.propuesta.valor.redactada,
                               nichos.propuesta.valor.redactar.response ]
                   subscribes:[ { nichos.propuesta.valor.redactar.request, onRedactarRequest } ]
C. INDEX.JS       MICRO-AGENTE. Sin estado.
D. PROYECCIONES   _redactar({nicho,panorama,canal}) → {propuesta_valor:{tono,gancho,cuerpo}}
E. HANDLERS RPC   onRedactarRequest → _atender('redactar',...)
F. EVENTOS        PULSO nichos.propuesta.valor.redactada
VERIFICACIÓN      smoke: canal="telegram" → mensaje corto; canal="web" → copy largo.
```

#### nichos-confirmacion-valor  —  custodio

```
A. DEPENDENCIAS   PosPersistencia · project.activated · nichos-canal (recibir feedback)
B. MODULE.JSON    publishes:[ nichos.feedback.ingerido, nichos.feedback.ingerir.response,
                               nichos.feedback.consultar.response ]
                   subscribes:[ { nichos.feedback.ingerir.request, onIngerirRequest },
                                 { nichos.feedback.consultar.request, onConsultarRequest },
                                 { nichos.canal.mensaje.recibido, onMensajeRecibido },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO append-only + REFLEJO. Store /nichos/feedback/{id_proyecto}.json.
D. PROYECCIONES   _ingerir({feedback_crudo}) → {entrada_feedback}
                   · _consultar({proyecto}) → {entradas[]}
E. HANDLERS RPC   onIngerirRequest · onConsultarRequest
F. EVENTOS        PULSO nichos.feedback.ingerido
VERIFICACIÓN      smoke: ingerir(cliente_x) → fichero crece; consultar → cronología de retornos.
```

### 4.J · Bloque J — INTERLOCUTOR PROVEEDOR (FUENTES)

#### nichos-puerto-fuente-datos  —  puente

```
A. DEPENDENCIAS   crawl4rs · credential-manager · nichos-gestion-limites-fuente ·
                   nichos-conversor-fuente · nichos-imputacion-coste-fuente
B. MODULE.JSON    publishes:[ nichos.fuente.consumir.response,
                               nichos.fuente.limites.puede.consumir.request,
                               nichos.conversor.normalizar.request,
                               nichos.fuente.coste.registrado,
                               crawl4rs.buscar.request, crawl4rs.leer.request ]
                   subscribes:[ { nichos.fuente.consumir.request, onConsumirRequest } ]
C. INDEX.JS       PUENTE. Sin estado propio.
D. PROYECCIONES   _consumir({fuente,peticion}) → {resultado_crudo}
                   · _preCheckLimites · _postImputarCoste
E. HANDLERS RPC   onConsumirRequest → _atender('consumir',...)
F. EVENTOS        PULSO nichos.fuente.consumida {fuente,importe,margen_restante}
VERIFICACIÓN      smoke: consumir(searx,"X") → crudo + coste imputado + margen descontado.
```

#### nichos-conversor-fuente  —  conversor

```
A. DEPENDENCIAS   (sin estado)
B. MODULE.JSON    publishes:[ nichos.conversor.normalizar.response ]
                   subscribes:[ { nichos.conversor.normalizar.request, onNormalizarRequest } ]
C. INDEX.JS       CONVERSOR puro.
D. PROYECCIONES   _normalizar({crudo,origen}) → {dato_homogeneo}
E. HANDLERS RPC   onNormalizarRequest → _atender('normalizar',...)
F. EVENTOS        (sin pulso propio — es RPC puro)
VERIFICACIÓN      smoke: crudo heterogéneo → dato con esquema estable para los consumidores.
```

#### nichos-gestion-limites-fuente  —  reflejo

```
A. DEPENDENCIAS   PosPersistencia · project.activated
B. MODULE.JSON    publishes:[ nichos.fuente.consumida,
                               nichos.fuente.limites.puede.consumir.response ]
                   subscribes:[ { nichos.fuente.limites.puede.consumir.request, onPuedeConsumirRequest },
                                 { nichos.fuente.coste.registrado, onCosteRegistrado },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       REFLEJO + CUSTODIO ligero. Store /nichos/limites-fuente.json
                   {por_fuente:{presupuesto,consumido,ventana}}.
D. PROYECCIONES   _puedeConsumir(fuente) → {puede,margen}
                   · _descontar(fuente,importe)
E. HANDLERS RPC   onPuedeConsumirRequest → _atender('puedeConsumir',...)
F. EVENTOS        PULSO nichos.fuente.consumida
VERIFICACIÓN      smoke: fuente sin presupuesto → puede=false; con presupuesto → puede=true+margen.
```

#### nichos-imputacion-coste-fuente  —  reflejo

```
A. DEPENDENCIAS   PosPersistencia · project.activated
B. MODULE.JSON    publishes:[ nichos.fuente.coste.registrado,
                               nichos.fuente.coste.consultar.response ]
                   subscribes:[ { nichos.fuente.coste.consultar.request, onConsultarRequest },
                                 { nichos.fuente.consumida, onFuenteConsumida },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       REFLEJO append-only. Store /nichos/costes-fuente/{id_proyecto}.json.
D. PROYECCIONES   _consultar({id_proyecto,hasta}) → {coste}
                   · _registrar(entrada)
E. HANDLERS RPC   onConsultarRequest → _atender('consultar',...)
F. EVENTOS        PULSO nichos.fuente.coste.registrado
VERIFICACIÓN      smoke: tras N consumidas → consultar devuelve agregado por fuente.
```

### 4.K · Bloque K — ROL JEFE

#### nichos-vista-portafolio  —  custodio

```
A. DEPENDENCIAS   PosPersistencia · nichos-cuadro-salud (iterar proyectos) · project.activated
B. MODULE.JSON    publishes:[ nichos.portafolio.recalculado, nichos.portafolio.vista.response,
                               nichos.cuadro.salud.estado.request ]
                   subscribes:[ { nichos.portafolio.vista.request, onVistaRequest },
                                 { nichos.salud.recalculada, onSaludRecalculada },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO + REFLEJO. Store /nichos/portafolio.json {snapshot,ts}.
D. PROYECCIONES   _vista({ahora}) → {vista_portafolio:{generan,sangran,flujo_total}}
E. HANDLERS RPC   onVistaRequest → _atender('vista',...)
F. EVENTOS        PULSO nichos.portafolio.recalculado
VERIFICACIÓN      smoke: 3 proyectos (2 GENERA + 1 SANGRA) → vista agrega flujo neto correcto.
```

#### nichos-cola-decisiones  —  custodio

```
A. DEPENDENCIAS   PosPersistencia · project.activated · scheduler (caducidades)
B. MODULE.JSON    publishes:[ nichos.decision.solicitud.abierta, .respondida, .caducada,
                               nichos.cola.decisiones.encolar.response, .siguientes.response,
                               .cerrar.response ]
                   subscribes:[ { nichos.cola.decisiones.encolar.request, onEncolarRequest },
                                 { nichos.cola.decisiones.siguientes.request, onSiguientesRequest },
                                 { nichos.cola.decisiones.cerrar.request, onCerrarRequest },
                                 { scheduler.job.triggered, onCaducidadBarrer },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO. Store /nichos/decisiones.json {solicitudes:[{id,tipo,contexto,
                   opciones[],caducidad,estado}]}.
D. PROYECCIONES   _encolar(sol) · _siguientes(dueno) · _cerrar(id,respuesta) · _barrerCaducadas
E. HANDLERS RPC   on<Op>Request × 3
F. EVENTOS        PULSO .abierta · .respondida · .caducada
VERIFICACIÓN      smoke: encolar → .abierta; cerrar → .respondida; dejar vencer → .caducada.
```

#### nichos-ajustador-umbrales  —  reflejo

```
A. DEPENDENCIAS   nichos-criterio-viabilidad · nichos-perfil-limite-busqueda ·
                   nichos-perfil-supervision (todos via .declarar)
B. MODULE.JSON    publishes:[ nichos.umbral.ajustado, nichos.umbrales.ajustar.response,
                               nichos.criterio.viabilidad.declarar.request,
                               nichos.perfil.limite.declarar.request,
                               nichos.perfil.supervision.declarar.request ]
                   subscribes:[ { nichos.umbrales.ajustar.request, onAjustarRequest },
                                 { nichos.decision.solicitud.respondida, onDecisionRespondida } ]
C. INDEX.JS       REFLEJO + CUSTODIO ligero (bitácora de ajustes).
                   Store /nichos/ajustes.json (log).
D. PROYECCIONES   _ajustar({respuesta_decision,por_autor}) → {aplicados[]}
E. HANDLERS RPC   onAjustarRequest → _atender('ajustar',...)
F. EVENTOS        PULSO nichos.umbral.ajustado
VERIFICACIÓN      smoke: respuesta "subir viabilidad a 0.7" → declarar enviado al custodio.
```

### 4.L · Bloque L — ROL TRABAJADOR (PIPELINE)

#### nichos-pipeline  —  custodio (state machine)

```
A. DEPENDENCIAS   PosPersistencia · project.activated · nichos-historial (registrar)
B. MODULE.JSON    publishes:[ nichos.pipeline.transicion.aplicada, .transicion.ilegal,
                               nichos.pipeline.transitar.response, nichos.pipeline.estado.response,
                               nichos.historial.registrar.request ]
                   subscribes:[ { nichos.pipeline.transitar.request, onTransitarRequest },
                                 { nichos.pipeline.estado.request, onEstadoRequest },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO state machine. Store /nichos/pipeline/{id_nicho}.json
                   {estado_actual,ultima_transicion}.
D. PROYECCIONES   _transitar({id,transicion}) → {estado_nuevo} (guard de legalidad)
                   · _estado(id)
E. HANDLERS RPC   onTransitarRequest · onEstadoRequest
F. EVENTOS        PULSO .aplicada · .ilegal (TRANSICION_ILEGAL = par .failed canónico)
VERIFICACIÓN      smoke: transición legal → .aplicada; transición ilegal → .ilegal con razón.
```

#### nichos-cola-candidatos  —  custodio

```
A. DEPENDENCIAS   PosPersistencia · project.activated
B. MODULE.JSON    publishes:[ nichos.candidato.encolado,
                               nichos.cola.candidatos.encolar.response, .sacar.response ]
                   subscribes:[ { nichos.cola.candidatos.encolar.request, onEncolarRequest },
                                 { nichos.cola.candidatos.sacar.request, onSacarRequest },
                                 { nichos.candidato.detectado, onCandidatoDetectado },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO FIFO. Store /nichos/cola-candidatos.json {items:[]}.
D. PROYECCIONES   _encolar(candidato) → {encolado,posicion}
                   · _sacar(n) → {lote[]}
E. HANDLERS RPC   onEncolarRequest · onSacarRequest
F. EVENTOS        PULSO nichos.candidato.encolado
VERIFICACIÓN      smoke: encolar 5 + sacar 3 → quedan 2 en cola; FIFO respetado.
```

#### nichos-manejo-fallo  —  reflejo

```
A. DEPENDENCIAS   scheduler (reintentos diferidos) · nichos-cola-decisiones (escalada)
B. MODULE.JSON    publishes:[ nichos.fallo.reintentado, nichos.fallo.manejar.response,
                               nichos.cola.decisiones.encolar.request,
                               scheduler.job.triggered.request ]
                   subscribes:[ { nichos.fallo.manejar.request, onManejarRequest },
                                 { ".*\\.failed", onFalloGenerico } ]
C. INDEX.JS       REFLEJO + PUENTE. Store ligero /nichos/fallos.json (bitácora).
D. PROYECCIONES   _manejar({fallo}) → {accion_tomada:REINTENTAR|ESCALAR|DESCARTAR}
                   · _calcularBackoff(intento)
E. HANDLERS RPC   onManejarRequest → _atender('manejar',...)
F. EVENTOS        PULSO nichos.fallo.reintentado
VERIFICACIÓN      smoke: fallo transitorio → reintento con delay; permanente → escalada a decisión.
```

#### nichos-historial  —  custodio (append-only)

```
A. DEPENDENCIAS   PosPersistencia · project.activated
B. MODULE.JSON    publishes:[ nichos.historial.registrado,
                               nichos.historial.registrar.response, .cronologia.response ]
                   subscribes:[ { nichos.historial.registrar.request, onRegistrarRequest },
                                 { nichos.historial.cronologia.request, onCronologiaRequest },
                                 { project.activated, onProjectActivated } ]
C. INDEX.JS       CUSTODIO append-only. Store /nichos/historial/{id_nicho}.json {eventos:[]}.
D. PROYECCIONES   _registrar(id,evento) → {registrado}
                   · _cronologia(id) → {eventos[]}
E. HANDLERS RPC   onRegistrarRequest · onCronologiaRequest
F. EVENTOS        PULSO nichos.historial.registrado
VERIFICACIÓN      smoke: registrar N eventos → cronologia los devuelve en orden; fichero crece.
```

#### nichos-pulso-avance  —  reflejo

```
A. DEPENDENCIAS   nichos-pipeline (estado) · scheduler (barrido periódico)
B. MODULE.JSON    publishes:[ nichos.pulso.avance.emitido, nichos.pulso.avance.barrer.response,
                               nichos.pipeline.estado.request ]
                   subscribes:[ { nichos.pulso.avance.barrer.request, onBarrerRequest },
                                 { scheduler.job.triggered, onSchedulerTick } ]
C. INDEX.JS       REFLEJO. Sin estado (consulta pipeline).
D. PROYECCIONES   _barrer({ahora}) → {pulsos_emitidos}
E. HANDLERS RPC   onBarrerRequest → _atender('barrer',...)
F. EVENTOS        PULSO nichos.pulso.avance.emitido {id_proyecto,estado_actual,instante}
VERIFICACIÓN      smoke: barrer con 2 proyectos activos → 2 pulsos emitidos.
```

### 4.M · ESLABÓN — Orquestador

#### nichos-orquestador  —  micro-agente

```
A. DEPENDENCIAS   nichos-capturador-semilla · nichos-normalizador-semilla · nichos-cola-candidatos
                   · nichos-batch-validacion · nichos-ensamblador-solucion · nichos-gate-decision-operar
                   · nichos-canal-distribucion · nichos-pipeline · nichos-historial
                   · ai-gateway (narrativa opcional)
B. MODULE.JSON    publishes:[ nichos.pipeline.ciclo.iniciado, nichos.pipeline.ciclo.cerrado.exito,
                               nichos.ciclo.abrir.response, nichos.gate.cerrar.response,
                               nichos.semilla.capturar.request, nichos.semilla.normalizar.request,
                               nichos.cola.candidatos.encolar.request,
                               nichos.validacion.lote.correr.request,
                               nichos.solucion.ensamblar.request,
                               nichos.gate.operar.abrir.request,
                               nichos.distribucion.llevar.request,
                               nichos.pipeline.transitar.request,
                               nichos.historial.registrar.request ]
                   subscribes:[ { nichos.ciclo.abrir.request, onAbrirRequest },
                                 { nichos.gate.cerrar.request, onCerrarRequest },
                                 { nichos.decision.solicitud.respondida, onDecisionRespondida } ]
C. INDEX.JS       MICRO-AGENTE orquestador tolerante (RPC falla → ciclo marcado FALLIDO, no basura).
                   Sin store propio (todo delegado a los custodios).
D. PROYECCIONES   _abrir({mensaje}) → {id_nicho} · _cerrar({mensaje_respuesta}) → {solicitud_id,aplicado}
                   · _secuenciar: capturar → normalizar → encolar → (lote) validar → ensamblar →
                                   gate → (humano) → distribuir → cerrar.exito
E. HANDLERS RPC   onAbrirRequest · onCerrarRequest
F. EVENTOS        PULSO nichos.pipeline.ciclo.iniciado · .cerrado.exito
VERIFICACIÓN      smoke e2e: abrir(mensaje) → .ciclo.iniciado; respuesta humana → .cerrado.exito;
                   fallo en cualquier RPC → el orquestador marca el ciclo FALLIDO sin dejar basura.
```

---

## 5 · Hojas REUTILIZAR — módulos vivos del repo que la vertical consume tal cual

> Verificado contra el inventario real (`find modules -maxdepth 3 -name module.json` = 322
> manifests). Cada entrada da el `slug` del módulo del repo, su `forma` natural dentro de Enki,
> el evento o terna que `nichos` necesita, y la razón por la que REUTILIZAR gana a CONSTRUIR.
> F3b asume la grafía exacta del manifest vivo; F7b la cose si cambia.

| slug | forma | evento(s) que nichos usa | razón del REUTILIZAR |
|---|---|---|---|
| `scheduler` | custodio | `scheduler.job.triggered` + `scheduler.job.{created,failed}` | Cron/intervalo canónico del repo. Nichos lo usa para `pulso.avance.barrer`, `sangria.barrer`, caducidades de la cola de decisiones y reintentos de fallos. Reconstruir equivaldría a duplicar un state machine ya probado. |
| `filesystem` | reflejo | `fs.{read,write,edit}.{request,response}` + `project.activated` | Puerta única al disco. `PosPersistencia` ya habla con él; todas las hojas CUSTODIO de §4 persisten por aquí indirectamente. Cero sentido reinventarlo. |
| `project-manager` | custodio | `project.activated` / `project.deactivated` / `project.get.{request,response}` | Dueño del ciclo de proyecto. Nichos crea proyecto por nicho que llega a OPERANDO (`nichos.construccion.completada` → `project.create` futuro); hoy todas las hojas con estado se hidratan en `project.activated`. |
| `credential-manager` | custodio | `credential.resolve.{request,response}` | Resuelve API keys (crawl4rs, ai-gateway, telegram, pasarelas de cobro) sin que `nichos-motor-cobro` ni `nichos-puerto-fuente-datos` las toquen a pelo. |
| `ai-gateway` | puente | `llm.complete.{request,response,failed}` + `embedding.generate.*` | Único entry point al LLM del repo. Todos los MICRO-AGENTE de nichos (A2, B1, C1, C3, C4, C7, D1, D4, E1, G3, H1, I2) delegan aquí; reconstruir sería romper el gate de providers/credenciales. |
| `crawl4rs` | puente | `crawl4rs.{buscar,leer,rastrear}.{request,response}` | Nativo Rust, SearXNG + crawler sin Chromium. `nichos-puerto-fuente-datos` lo envuelve en RPC `nichos.fuente.consumir.*` para añadir límites y coste imputado. |
| `channel-manager` | custodio | `channel.{resolve,register}.{request,response}` | Registry SQLite externo→proyecto. `nichos-puerto-canal` apoya su registro ahí para no duplicar la verdad de "qué chat_id pertenece a qué proyecto". |
| `telegram-bridge` | puente | `telegram.text.received`, `telegram.callback.received`, `ai.chat.response` | Puente oficial Telegram↔proyecto. `nichos-puerto-canal` escucha `telegram.text.received` y publica por su mismo canal cuando corresponde. |
| `ejecutor` | puente | `ejecutor.ejecutar.{request,response}` | Puerta guardada del repo para cualquier comando con reja (hardline + aprobación). Si alguna hoja futura necesita ejecutar algo fuera del bus (ej. ejecutar un script generado por `nichos-ensamblador-solucion`), entra por aquí. |
| `prisma/calendario` | custodio | `calendario.{disponibilidad,reserva}.{request,response}` | Órgano agenda compartido de Prisma. Nichos lo consume cuando un `camino` genere un servicio con cita (base futura; hoy la dependencia es blanda y queda declarada por si el camino lo pide). |

> **No se añade `database-manager`** como REUTILIZAR explícito: lo usan los módulos que
> REUTILIZAMOS (p. ej. `channel-manager` persiste en SQLite via DBM). Nichos no habla
> directamente con él; sus CUSTODIO persisten vía `filesystem` + `PosPersistencia` siguiendo
> el patrón pizzepos.

---

## 6 · Hojas ADAPTAR

**Sin hojas ADAPTAR: todo lo externo encaja como REUTILIZAR o CONSTRUIR.**

Razón: los 10 módulos de §5 cumplen su contrato tal cual (nichos los consume por RPC canónico
sin pedirles un comportamiento nuevo), y las 45 hojas de §4 son dominio-específico de `nichos`
(nombres, estado, lógica), por lo que no hay un módulo del repo cuyo patrón sirva "casi":
ADAPTAR implicaría reescribir el 80 % y romper el proyecto del dueño original — mejor
CONSTRUIR nuevo y dejar al patrón del vecino en paz.

---

## 7 · Espina `enki-plan` embebida

```json enki-plan
{
  "hojas": [
    {
      "slug": "scheduler",
      "forma": "custodio",
      "accion": "REUTILIZAR",
      "reutiliza": ["modules/scheduler"],
      "subscribes": [],
      "publishes": ["scheduler.job.triggered"],
      "proyecciones_internas": []
    },
    {
      "slug": "filesystem",
      "forma": "reflejo",
      "accion": "REUTILIZAR",
      "reutiliza": ["modules/filesystem"],
      "subscribes": ["fs.read.request", "fs.write.request", "fs.edit.request"],
      "publishes": ["fs.read.response", "fs.write.response", "fs.edit.response"],
      "proyecciones_internas": []
    },
    {
      "slug": "project-manager",
      "forma": "custodio",
      "accion": "REUTILIZAR",
      "reutiliza": ["modules/project-manager"],
      "subscribes": [],
      "publishes": ["project.activated", "project.deactivated"],
      "proyecciones_internas": []
    },
    {
      "slug": "credential-manager",
      "forma": "custodio",
      "accion": "REUTILIZAR",
      "reutiliza": ["modules/credential-manager"],
      "subscribes": ["credential.resolve.request"],
      "publishes": ["credential.resolve.response"],
      "proyecciones_internas": []
    },
    {
      "slug": "ai-gateway",
      "forma": "puente",
      "accion": "REUTILIZAR",
      "reutiliza": ["modules/conversacion/ai-gateway"],
      "subscribes": ["llm.complete.request"],
      "publishes": ["llm.complete.response", "llm.complete.failed"],
      "proyecciones_internas": []
    },
    {
      "slug": "crawl4rs",
      "forma": "puente",
      "accion": "REUTILIZAR",
      "reutiliza": ["modules/crawl4rs"],
      "subscribes": ["crawl4rs.buscar.request", "crawl4rs.leer.request"],
      "publishes": ["crawl4rs.buscar.response", "crawl4rs.leer.response"],
      "proyecciones_internas": []
    },
    {
      "slug": "channel-manager",
      "forma": "custodio",
      "accion": "REUTILIZAR",
      "reutiliza": ["modules/channel-manager"],
      "subscribes": [],
      "publishes": [],
      "proyecciones_internas": []
    },
    {
      "slug": "telegram-bridge",
      "forma": "puente",
      "accion": "REUTILIZAR",
      "reutiliza": ["modules/telegram-bridge"],
      "subscribes": [],
      "publishes": ["telegram.text.received"],
      "proyecciones_internas": []
    },
    {
      "slug": "ejecutor",
      "forma": "puente",
      "accion": "REUTILIZAR",
      "reutiliza": ["modules/ejecutor"],
      "subscribes": ["ejecutor.ejecutar.request"],
      "publishes": ["ejecutor.ejecutar.response"],
      "proyecciones_internas": []
    },
    {
      "slug": "calendario",
      "forma": "custodio",
      "accion": "REUTILIZAR",
      "reutiliza": ["modules/prisma/calendario"],
      "subscribes": [],
      "publishes": [],
      "proyecciones_internas": []
    },

    {
      "slug": "nichos-capturador-semilla",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo"],
      "subscribes": ["nichos.semilla.capturar.request"],
      "publishes": ["nichos.semilla.capturada", "nichos.semilla.capturar.response", "nichos.semilla.capturar.failed"],
      "proyecciones_internas": [
        { "nombre": "_capturar", "descripcion": "normaliza mensaje crudo en objeto semilla con id determinista" },
        { "nombre": "_mintId", "descripcion": "hash corto texto+ts para id_nicho" }
      ]
    },
    {
      "slug": "nichos-normalizador-semilla",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "ai-gateway"],
      "subscribes": ["nichos.semilla.normalizar.request"],
      "publishes": ["nichos.semilla.normalizada", "nichos.semilla.normalizada.failed", "nichos.semilla.normalizar.response", "llm.complete.request", "nichos.decision.solicitud.abierta"],
      "proyecciones_internas": [
        { "nombre": "_normalizar", "descripcion": "delega al LLM via ai-gateway; emite solicitud si nitidez baja" },
        { "nombre": "_nitidez", "descripcion": "heurística 0..1 sobre intenciones extraídas" }
      ]
    },
    {
      "slug": "nichos-sondeador-territorio",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "crawl4rs"],
      "subscribes": ["nichos.territorio.sondear.request"],
      "publishes": ["nichos.candidato.detectado", "nichos.sondeo.completado", "nichos.sondeo.failed", "nichos.territorio.sondear.response", "nichos.reglas.exclusion.consultar.request", "nichos.perfil.limite.leer.request", "nichos.fuente.consumir.request"],
      "proyecciones_internas": [
        { "nombre": "_sondear", "descripcion": "orquesta búsqueda externa + filtrado por reglas + límite" },
        { "nombre": "_dedupeContraExclusion", "descripcion": "aplica reglas aprendidas de exclusión" }
      ]
    },
    {
      "slug": "nichos-reglas-exclusion",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia", "ai-gateway"],
      "subscribes": ["nichos.reglas.exclusion.consultar.request", "nichos.sondeo.completado"],
      "publishes": ["nichos.reglas.exclusion.actualizadas", "nichos.reglas.exclusion.consultar.response"],
      "proyecciones_internas": [
        { "nombre": "_consultar", "descripcion": "lee conjunto por firma de semilla" },
        { "nombre": "_destilarPatrones", "descripcion": "minería offline tras lotes de sondeo" }
      ]
    },
    {
      "slug": "nichos-perfil-limite-busqueda",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.perfil.limite.leer.request", "nichos.perfil.limite.declarar.request", "project.activated"],
      "publishes": ["nichos.perfil.limite.declarado", "nichos.perfil.limite.declarado.failed", "nichos.perfil.limite.leer.response", "nichos.perfil.limite.declarar.response"],
      "proyecciones_internas": [
        { "nombre": "_leer", "descripcion": "lee perfil del store; esqueleto por defecto si no hay" },
        { "nombre": "_declarar", "descripcion": "muta perfil con autor + versión++" }
      ]
    },
    {
      "slug": "nichos-estudio-demanda",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "ai-gateway"],
      "subscribes": ["nichos.demanda.estudiar.request"],
      "publishes": ["nichos.estudio.demanda.completado", "nichos.estudio.demanda.failed", "nichos.demanda.estudiar.response", "nichos.fuente.consumir.request", "nichos.fuente.limites.puede.consumir.request"],
      "proyecciones_internas": [
        { "nombre": "_estudiar", "descripcion": "ensambla informe con demanda, disposicion_a_pagar, fuentes_usadas" },
        { "nombre": "_coste", "descripcion": "agrega coste imputable del estudio" }
      ]
    },
    {
      "slug": "nichos-criterio-viabilidad",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.criterio.viabilidad.leer.request", "nichos.criterio.viabilidad.declarar.request", "project.activated"],
      "publishes": ["nichos.criterio.viabilidad.declarado", "nichos.criterio.viabilidad.declarado.failed", "nichos.criterio.viabilidad.leer.response", "nichos.criterio.viabilidad.declarar.response"],
      "proyecciones_internas": [
        { "nombre": "_leer", "descripcion": "umbral vigente" },
        { "nombre": "_declarar", "descripcion": "muta umbral con autor" }
      ]
    },
    {
      "slug": "nichos-veredicto-viabilidad",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "ai-gateway"],
      "subscribes": ["nichos.veredicto.emitir.request"],
      "publishes": ["nichos.veredicto.emitido", "nichos.veredicto.emitir.response", "nichos.criterio.viabilidad.leer.request"],
      "proyecciones_internas": [
        { "nombre": "_emitir", "descripcion": "aplica criterio al informe; VIABLE|NO_VIABLE|PUENTE" }
      ]
    },
    {
      "slug": "nichos-camino-encontrar-construir",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "ai-gateway"],
      "subscribes": ["nichos.camino.decidir.request"],
      "publishes": ["nichos.camino.decidido", "nichos.camino.decidir.response", "nichos.catalogo.capacidad.disponibles.request", "nichos.decision.solicitud.abierta"],
      "proyecciones_internas": [
        { "nombre": "_decidir", "descripcion": "cruza informe/veredicto con catálogo; ENCONTRAR|CONSTRUIR|solicitud" }
      ]
    },
    {
      "slug": "nichos-batch-validacion",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo"],
      "subscribes": ["nichos.validacion.lote.correr.request"],
      "publishes": ["nichos.validacion.lote.iniciado", "nichos.validacion.lote.completado", "nichos.validacion.lote.correr.response", "nichos.cola.candidatos.sacar.request", "nichos.demanda.estudiar.request", "nichos.veredicto.emitir.request", "nichos.camino.decidir.request", "nichos.cortar.temprano.request"],
      "proyecciones_internas": [
        { "nombre": "_correr", "descripcion": "saca N de la cola y encadena micro-flujos de validación" }
      ]
    },
    {
      "slug": "nichos-cortador-temprano",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo"],
      "subscribes": ["nichos.cortar.temprano.request"],
      "publishes": ["nichos.cortado.pre.construccion", "nichos.cortar.temprano.response", "nichos.pipeline.transitar.request", "nichos.historial.registrar.request"],
      "proyecciones_internas": [
        { "nombre": "_cortar", "descripcion": "transita a CORTADO y registra en historial" }
      ]
    },
    {
      "slug": "nichos-reglas-aprendidas-validacion",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia", "ai-gateway"],
      "subscribes": ["nichos.aprendizaje.proponer.request", "nichos.validacion.lote.completado"],
      "publishes": ["nichos.regla.aprendida.propuesta", "nichos.aprendizaje.proponer.response", "nichos.decision.solicitud.abierta"],
      "proyecciones_internas": [
        { "nombre": "_proponer", "descripcion": "destila patrón sobre historial y propone ajuste de umbral" }
      ]
    },
    {
      "slug": "nichos-ensamblador-solucion",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "ai-gateway"],
      "subscribes": ["nichos.solucion.ensamblar.request"],
      "publishes": ["nichos.construccion.iniciada", "nichos.construccion.completada", "nichos.construccion.failed", "nichos.solucion.ensamblar.response", "nichos.catalogo.capacidad.disponibles.request", "nichos.catalogo.capacidad.encargar.request", "nichos.puente.humano.alzar.request"],
      "proyecciones_internas": [
        { "nombre": "_ensamblar", "descripcion": "monta solución desde catálogo + camino + llm (si fuzzy)" },
        { "nombre": "_detectarCapacidadesFaltantes", "descripcion": "cruza requisitos vs catálogo" }
      ]
    },
    {
      "slug": "nichos-puente-humano",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo"],
      "subscribes": ["nichos.puente.humano.alzar.request"],
      "publishes": ["nichos.puente.humano.alzado", "nichos.puente.humano.alzar.response", "nichos.cola.decisiones.encolar.request", "nichos.canal.enviar.request"],
      "proyecciones_internas": [
        { "nombre": "_alzar", "descripcion": "encola decisión + notifica por canal supervisión" }
      ]
    },
    {
      "slug": "nichos-catalogo-capacidades",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.catalogo.capacidad.disponibles.request", "nichos.catalogo.capacidad.encargar.request", "nichos.catalogo.capacidad.promover.request", "project.activated"],
      "publishes": ["nichos.catalogo.capacidad.encargada", "nichos.catalogo.capacidad.disponible", "nichos.catalogo.capacidad.disponibles.response", "nichos.catalogo.capacidad.encargar.response", "nichos.catalogo.capacidad.promover.response"],
      "proyecciones_internas": [
        { "nombre": "_disponibles", "descripcion": "lista capacidades listas" },
        { "nombre": "_encargar", "descripcion": "marca capacidad como ENCARGADA" },
        { "nombre": "_promover", "descripcion": "pasa capacidad a DISPONIBLE" }
      ]
    },
    {
      "slug": "nichos-proponedor-modelo-cobro",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "ai-gateway"],
      "subscribes": ["nichos.modelo.cobro.proponer.request"],
      "publishes": ["nichos.modelo.cobro.propuesto", "nichos.modelo.cobro.proponer.response", "nichos.perfil.cobro.plantilla.request"],
      "proyecciones_internas": [
        { "nombre": "_proponer", "descripcion": "aplica plantilla por tipo_nicho + ajuste LLM" }
      ]
    },
    {
      "slug": "nichos-estudio-competencia",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "ai-gateway", "crawl4rs"],
      "subscribes": ["nichos.competencia.estudiar.request"],
      "publishes": ["nichos.competencia.estudiada", "nichos.competencia.estudiar.response", "nichos.fuente.consumir.request", "nichos.fuente.limites.puede.consumir.request"],
      "proyecciones_internas": [
        { "nombre": "_estudiar", "descripcion": "mapea panorama + diferencial con fuentes verificables" }
      ]
    },
    {
      "slug": "nichos-gate-decision-operar",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo"],
      "subscribes": ["nichos.gate.operar.abrir.request"],
      "publishes": ["nichos.gate.operar.abierto", "nichos.gate.operar.abrir.response", "nichos.cola.decisiones.encolar.request", "nichos.paquete.decision.empaquetar.request", "nichos.perfil.supervision.leer.request"],
      "proyecciones_internas": [
        { "nombre": "_abrir", "descripcion": "empaqueta y encola solicitud de decisión antes de operar" }
      ]
    },
    {
      "slug": "nichos-motor-cobro",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "credential-manager"],
      "subscribes": ["nichos.cobro.ejecutar.request"],
      "publishes": ["nichos.cobro.registrado", "nichos.cobro.failed", "nichos.cobro.ejecutar.response", "nichos.registro.cobros.registrar.request"],
      "proyecciones_internas": [
        { "nombre": "_ejecutar", "descripcion": "ejecuta cobro según modelo; delega persistencia a registro" }
      ]
    },
    {
      "slug": "nichos-canal-distribucion",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo"],
      "subscribes": ["nichos.distribucion.llevar.request"],
      "publishes": ["nichos.distribucion.realizada", "nichos.distribucion.failed", "nichos.distribucion.llevar.response", "nichos.canal.enviar.request"],
      "proyecciones_internas": [
        { "nombre": "_llevar", "descripcion": "distribuye solución por canal operativo" }
      ]
    },
    {
      "slug": "nichos-registro-cobros",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.registro.cobros.registrar.request", "nichos.registro.cobros.consultar.request", "project.activated"],
      "publishes": ["nichos.cobro.registrado", "nichos.registro.cobros.registrar.response", "nichos.registro.cobros.consultar.response"],
      "proyecciones_internas": [
        { "nombre": "_registrar", "descripcion": "append-only entrada de cobro con ref" },
        { "nombre": "_consultar", "descripcion": "filtra entradas por rango/tipo" }
      ]
    },
    {
      "slug": "nichos-imputacion-costes",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo"],
      "subscribes": ["nichos.costes.imputar.request"],
      "publishes": ["nichos.costes.imputar.response", "nichos.fuente.coste.consultar.request", "nichos.registro.cobros.consultar.request"],
      "proyecciones_internas": [
        { "nombre": "_imputar", "descripcion": "agrega coste proyecto hasta instante por categoría" }
      ]
    },
    {
      "slug": "nichos-cuadro-salud",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.cuadro.salud.estado.request", "nichos.cuadro.salud.recalcular.request", "nichos.cobro.registrado", "project.activated"],
      "publishes": ["nichos.salud.recalculada", "nichos.cuadro.salud.estado.response", "nichos.cuadro.salud.recalcular.response", "nichos.costes.imputar.request", "nichos.registro.cobros.consultar.request"],
      "proyecciones_internas": [
        { "nombre": "_estado", "descripcion": "lee snapshot vigente del cuadro" },
        { "nombre": "_recalcular", "descripcion": "compone vista proyecto con flujo y estado" }
      ]
    },
    {
      "slug": "nichos-alerta-sangria",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "scheduler"],
      "subscribes": ["nichos.sangria.barrer.request", "nichos.salud.recalculada", "scheduler.job.triggered"],
      "publishes": ["nichos.sangria.alerta.emitida", "nichos.sangria.barrer.response", "nichos.cola.decisiones.encolar.request", "nichos.cuadro.salud.estado.request"],
      "proyecciones_internas": [
        { "nombre": "_barrer", "descripcion": "busca proyectos SANGRA y emite solicitud al dueño" }
      ]
    },
    {
      "slug": "nichos-puerto-canal",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "channel-manager", "telegram-bridge"],
      "subscribes": ["nichos.canal.enviar.request", "nichos.canal.registrar.request", "telegram.text.received"],
      "publishes": ["nichos.canal.mensaje.recibido", "nichos.canal.mensaje.enviado", "nichos.canal.registrado", "nichos.canal.enviar.response", "nichos.canal.registrar.response"],
      "proyecciones_internas": [
        { "nombre": "_enviar", "descripcion": "envía por canal resuelto por propósito/destino" },
        { "nombre": "_registrar", "descripcion": "da de alta canal↔proyecto↔propósito" }
      ]
    },
    {
      "slug": "nichos-escalones-mensaje",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo"],
      "subscribes": ["nichos.escalon.clasificar.request"],
      "publishes": ["nichos.escalon.clasificado", "nichos.escalon.clasificar.response", "nichos.perfil.supervision.leer.request"],
      "proyecciones_internas": [
        { "nombre": "_clasificar", "descripcion": "clasifica evento en PULSO|ALERTA|DECISION|SILENCIO" }
      ]
    },
    {
      "slug": "nichos-clasificador-intencion",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "ai-gateway"],
      "subscribes": ["nichos.intencion.clasificar.request", "nichos.canal.mensaje.recibido"],
      "publishes": ["nichos.intencion.clasificada", "nichos.intencion.clasificar.response"],
      "proyecciones_internas": [
        { "nombre": "_clasificar", "descripcion": "clasifica mensaje entrante en 5 intenciones canónicas" }
      ]
    },
    {
      "slug": "nichos-paquetador-decision",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "ai-gateway"],
      "subscribes": ["nichos.paquete.decision.empaquetar.request"],
      "publishes": ["nichos.paquete.decision.redactado", "nichos.paquete.decision.empaquetar.response", "nichos.historial.cronologia.request", "nichos.cuadro.salud.estado.request"],
      "proyecciones_internas": [
        { "nombre": "_empaquetar", "descripcion": "redacta narrativa + riesgo + alternativa para el dueño" }
      ]
    },
    {
      "slug": "nichos-perfil-supervision",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.perfil.supervision.leer.request", "nichos.perfil.supervision.declarar.request", "project.activated"],
      "publishes": ["nichos.perfil.supervision.declarado", "nichos.perfil.supervision.leer.response", "nichos.perfil.supervision.declarar.response"],
      "proyecciones_internas": [
        { "nombre": "_leer", "descripcion": "perfil vigente de supervisión" },
        { "nombre": "_declarar", "descripcion": "muta umbrales/escalones/modo con autor" }
      ]
    },
    {
      "slug": "nichos-perfil-cobro-entrega",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.perfil.cobro.plantilla.request", "nichos.perfil.cobro.declarar.request", "project.activated"],
      "publishes": ["nichos.perfil.cobro.declarado", "nichos.perfil.cobro.plantilla.response", "nichos.perfil.cobro.declarar.response"],
      "proyecciones_internas": [
        { "nombre": "_plantilla", "descripcion": "perfil por tipo_nicho (SERVICIO/PRODUCTO/...)" },
        { "nombre": "_declarar", "descripcion": "muta perfil con autor" }
      ]
    },
    {
      "slug": "nichos-propuesta-valor-canal",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "ai-gateway"],
      "subscribes": ["nichos.propuesta.valor.redactar.request"],
      "publishes": ["nichos.propuesta.valor.redactada", "nichos.propuesta.valor.redactar.response"],
      "proyecciones_internas": [
        { "nombre": "_redactar", "descripcion": "redacta tono/gancho adecuados al canal destino" }
      ]
    },
    {
      "slug": "nichos-confirmacion-valor",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.feedback.ingerir.request", "nichos.feedback.consultar.request", "nichos.canal.mensaje.recibido", "project.activated"],
      "publishes": ["nichos.feedback.ingerido", "nichos.feedback.ingerir.response", "nichos.feedback.consultar.response"],
      "proyecciones_internas": [
        { "nombre": "_ingerir", "descripcion": "append-only de feedback por proyecto" },
        { "nombre": "_consultar", "descripcion": "cronología por proyecto" }
      ]
    },
    {
      "slug": "nichos-puerto-fuente-datos",
      "forma": "puente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "crawl4rs", "credential-manager"],
      "subscribes": ["nichos.fuente.consumir.request"],
      "publishes": ["nichos.fuente.consumir.response", "nichos.fuente.limites.puede.consumir.request", "nichos.conversor.normalizar.request", "nichos.fuente.coste.registrado", "nichos.fuente.consumida", "crawl4rs.buscar.request", "crawl4rs.leer.request"],
      "proyecciones_internas": [
        { "nombre": "_consumir", "descripcion": "orquesta pre-check + llamada externa + imputación" }
      ]
    },
    {
      "slug": "nichos-conversor-fuente",
      "forma": "conversor",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo"],
      "subscribes": ["nichos.conversor.normalizar.request"],
      "publishes": ["nichos.conversor.normalizar.response"],
      "proyecciones_internas": [
        { "nombre": "_normalizar", "descripcion": "homogeneiza crudo heterogéneo según origen" }
      ]
    },
    {
      "slug": "nichos-gestion-limites-fuente",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.fuente.limites.puede.consumir.request", "nichos.fuente.coste.registrado", "project.activated"],
      "publishes": ["nichos.fuente.consumida", "nichos.fuente.limites.puede.consumir.response"],
      "proyecciones_internas": [
        { "nombre": "_puedeConsumir", "descripcion": "pre-check de presupuesto por fuente" },
        { "nombre": "_descontar", "descripcion": "aplica consumo al presupuesto vigente" }
      ]
    },
    {
      "slug": "nichos-imputacion-coste-fuente",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.fuente.coste.consultar.request", "nichos.fuente.consumida", "project.activated"],
      "publishes": ["nichos.fuente.coste.registrado", "nichos.fuente.coste.consultar.response"],
      "proyecciones_internas": [
        { "nombre": "_consultar", "descripcion": "agrega coste por proyecto/fuente hasta instante" },
        { "nombre": "_registrar", "descripcion": "append entrada de coste imputado" }
      ]
    },
    {
      "slug": "nichos-vista-portafolio",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.portafolio.vista.request", "nichos.salud.recalculada", "project.activated"],
      "publishes": ["nichos.portafolio.recalculado", "nichos.portafolio.vista.response", "nichos.cuadro.salud.estado.request"],
      "proyecciones_internas": [
        { "nombre": "_vista", "descripcion": "snapshot agregado de salud por portafolio" }
      ]
    },
    {
      "slug": "nichos-cola-decisiones",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia", "scheduler"],
      "subscribes": ["nichos.cola.decisiones.encolar.request", "nichos.cola.decisiones.siguientes.request", "nichos.cola.decisiones.cerrar.request", "scheduler.job.triggered", "project.activated"],
      "publishes": ["nichos.decision.solicitud.abierta", "nichos.decision.solicitud.respondida", "nichos.decision.solicitud.caducada", "nichos.cola.decisiones.encolar.response", "nichos.cola.decisiones.siguientes.response", "nichos.cola.decisiones.cerrar.response"],
      "proyecciones_internas": [
        { "nombre": "_encolar", "descripcion": "añade solicitud al store" },
        { "nombre": "_siguientes", "descripcion": "lista por dueño/vencimiento" },
        { "nombre": "_cerrar", "descripcion": "marca respondida y persiste la elección" },
        { "nombre": "_barrerCaducadas", "descripcion": "emite .caducada al vencer sin respuesta" }
      ]
    },
    {
      "slug": "nichos-ajustador-umbrales",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.umbrales.ajustar.request", "nichos.decision.solicitud.respondida"],
      "publishes": ["nichos.umbral.ajustado", "nichos.umbrales.ajustar.response", "nichos.criterio.viabilidad.declarar.request", "nichos.perfil.limite.declarar.request", "nichos.perfil.supervision.declarar.request"],
      "proyecciones_internas": [
        { "nombre": "_ajustar", "descripcion": "traduce respuesta de decisión en declaraciones a custodios" }
      ]
    },
    {
      "slug": "nichos-pipeline",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.pipeline.transitar.request", "nichos.pipeline.estado.request", "project.activated"],
      "publishes": ["nichos.pipeline.transicion.aplicada", "nichos.pipeline.transicion.ilegal", "nichos.pipeline.transitar.response", "nichos.pipeline.estado.response", "nichos.historial.registrar.request"],
      "proyecciones_internas": [
        { "nombre": "_transitar", "descripcion": "guarda legalidad de transición y persiste estado" },
        { "nombre": "_estado", "descripcion": "lee estado actual" }
      ]
    },
    {
      "slug": "nichos-cola-candidatos",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.cola.candidatos.encolar.request", "nichos.cola.candidatos.sacar.request", "nichos.candidato.detectado", "project.activated"],
      "publishes": ["nichos.candidato.encolado", "nichos.cola.candidatos.encolar.response", "nichos.cola.candidatos.sacar.response"],
      "proyecciones_internas": [
        { "nombre": "_encolar", "descripcion": "añade candidato al final" },
        { "nombre": "_sacar", "descripcion": "FIFO de N" }
      ]
    },
    {
      "slug": "nichos-manejo-fallo",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "scheduler"],
      "subscribes": ["nichos.fallo.manejar.request"],
      "publishes": ["nichos.fallo.reintentado", "nichos.fallo.manejar.response", "nichos.cola.decisiones.encolar.request"],
      "proyecciones_internas": [
        { "nombre": "_manejar", "descripcion": "decide REINTENTAR|ESCALAR|DESCARTAR según tipo de fallo" },
        { "nombre": "_calcularBackoff", "descripcion": "exponencial con tope y jitter" }
      ]
    },
    {
      "slug": "nichos-historial",
      "forma": "custodio",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "_shared/pos-persistencia"],
      "subscribes": ["nichos.historial.registrar.request", "nichos.historial.cronologia.request", "project.activated"],
      "publishes": ["nichos.historial.registrado", "nichos.historial.registrar.response", "nichos.historial.cronologia.response"],
      "proyecciones_internas": [
        { "nombre": "_registrar", "descripcion": "append-only del evento por nicho" },
        { "nombre": "_cronologia", "descripcion": "lee eventos del nicho en orden" }
      ]
    },
    {
      "slug": "nichos-pulso-avance",
      "forma": "reflejo",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "scheduler"],
      "subscribes": ["nichos.pulso.avance.barrer.request", "scheduler.job.triggered"],
      "publishes": ["nichos.pulso.avance.emitido", "nichos.pulso.avance.barrer.response", "nichos.pipeline.estado.request"],
      "proyecciones_internas": [
        { "nombre": "_barrer", "descripcion": "consulta pipeline de cada proyecto y emite pulso" }
      ]
    },
    {
      "slug": "nichos-orquestador",
      "forma": "micro-agente",
      "accion": "CONSTRUIR",
      "reutiliza": ["_shared/modulo-hibrido-reflejo", "ai-gateway"],
      "subscribes": ["nichos.ciclo.abrir.request", "nichos.gate.cerrar.request", "nichos.decision.solicitud.respondida"],
      "publishes": ["nichos.pipeline.ciclo.iniciado", "nichos.pipeline.ciclo.cerrado.exito", "nichos.ciclo.abrir.response", "nichos.gate.cerrar.response", "nichos.semilla.capturar.request", "nichos.semilla.normalizar.request", "nichos.cola.candidatos.encolar.request", "nichos.validacion.lote.correr.request", "nichos.solucion.ensamblar.request", "nichos.gate.operar.abrir.request", "nichos.distribucion.llevar.request", "nichos.pipeline.transitar.request", "nichos.historial.registrar.request"],
      "proyecciones_internas": [
        { "nombre": "_abrir", "descripcion": "capturar→normalizar→encolar; devuelve id_nicho" },
        { "nombre": "_cerrar", "descripcion": "aplica respuesta humana del gate; cierra ciclo" },
        { "nombre": "_secuenciar", "descripcion": "espinazo tolerante: RPC falla → ciclo FALLIDO, no basura" }
      ]
    }
  ],
  "orden": [
    "scheduler",
    "filesystem",
    "project-manager",
    "credential-manager",
    "ai-gateway",
    "crawl4rs",
    "channel-manager",
    "telegram-bridge",
    "ejecutor",
    "calendario",
    "nichos-perfil-limite-busqueda",
    "nichos-reglas-exclusion",
    "nichos-criterio-viabilidad",
    "nichos-perfil-supervision",
    "nichos-perfil-cobro-entrega",
    "nichos-catalogo-capacidades",
    "nichos-conversor-fuente",
    "nichos-gestion-limites-fuente",
    "nichos-imputacion-coste-fuente",
    "nichos-puerto-fuente-datos",
    "nichos-puerto-canal",
    "nichos-escalones-mensaje",
    "nichos-clasificador-intencion",
    "nichos-historial",
    "nichos-pipeline",
    "nichos-cola-candidatos",
    "nichos-registro-cobros",
    "nichos-cuadro-salud",
    "nichos-imputacion-costes",
    "nichos-vista-portafolio",
    "nichos-cola-decisiones",
    "nichos-ajustador-umbrales",
    "nichos-paquetador-decision",
    "nichos-propuesta-valor-canal",
    "nichos-confirmacion-valor",
    "nichos-estudio-demanda",
    "nichos-veredicto-viabilidad",
    "nichos-camino-encontrar-construir",
    "nichos-reglas-aprendidas-validacion",
    "nichos-cortador-temprano",
    "nichos-batch-validacion",
    "nichos-sondeador-territorio",
    "nichos-estudio-competencia",
    "nichos-proponedor-modelo-cobro",
    "nichos-ensamblador-solucion",
    "nichos-puente-humano",
    "nichos-gate-decision-operar",
    "nichos-motor-cobro",
    "nichos-canal-distribucion",
    "nichos-alerta-sangria",
    "nichos-manejo-fallo",
    "nichos-pulso-avance",
    "nichos-capturador-semilla",
    "nichos-normalizador-semilla",
    "nichos-orquestador"
  ]
}
```

> **Lectura del `orden`.** Primero los 10 REUTILIZAR (ya existen; se declaran para que F4 lea
> sus contratos). Luego los CUSTODIO sin dependencias de dominio (perfiles, catálogo). Luego los
> REFLEJO/CONVERSOR puros (fuentes, canal, intención, historial, pipeline). Luego los
> CUSTODIO transversales (cola decisiones, portafolio, cuadro salud). Luego los MICRO-AGENTE que
> dependen de otros ya nacidos (demanda, veredicto, camino, aprendizaje, batch). Luego los
> PUENTE operativos (ensamblador, puente-humano, gate-operar, canal-distribución, alerta-sangría,
> manejo-fallo). Finalmente los dos de entrada (capturador + normalizador) y el **orquestador**
> en último lugar — con contrato tolerante: cualquier RPC que falle cierra el ciclo como FALLIDO
> en el historial, nunca deja basura en el pipeline.

