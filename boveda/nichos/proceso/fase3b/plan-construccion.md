<!--
  ⚠ PARCIAL — F3b INCOMPLETA (bloqueada por rate limit del subagente, 2026-10-04).

  Secciones escritas:   §1 Canon · §2 Traducción 44 clases · §3 Tabla de eventos canónicos
  Secciones FALTANTES:  §4 Hojas CONSTRUIR (plantilla 7 etapas) · §5 Hojas REUTILIZAR
                        · §6 Hojas ADAPTAR · §7 Espina enki-plan (JSON embebido)

  NO USAR como entrada de F4. Cuando se reanude la cuota, un subagente nuevo
  continuará desde §4. Estado reflejado en boveda/nichos/proceso/estado.json
  como "en_curso_parcial".
-->

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

