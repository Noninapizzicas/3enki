# Diseño OOP — contabilidad (Fase 3 · PLASMA)

> **Fase 3 · planificar-construccion** · vertical **`contabilidad`** · entregable: este diseño.
> **Lente:** ingeniería de diseño orientada a objetos. **Sin plataforma:** pseudocódigo OOP tipado.
> **Fuente única:** `fase2/esquemas/esquema.md` (árbol maestro: 118 hojas atómicas, 23 `[ABIERTO]`,
> 3 SPAWN, 3 REF, 7 conflictos, partición §8b) + `pasada-diseccion.md` (FORMA de las 118 hojas) +
> las 16 pasadas del prisma (1 global · 13 por punto · 1 pasada-3 · 8 interlocutor · 3 rol).
> **Ley del plasma:** PROHIBIDO nombrar tecnología. TODO el entorno externo entra por **puerto abierto**.
> **Ley de la unidad:** **UNA clase por CADA hoja atómica → exactamente 118 clases de dominio.**
> Ninguna hoja sin clase. Ninguna clase que fusione dos hojas.
>
> **Sujeto (F0):** capacidad transversal **observadora vendible** — observa los hechos que cada negocio
> **ya emite** y, junto con el cierre, **reconstruye** su contabilidad. **No produce hechos de negocio:
> produce SUS documentos** (facturas, asientos, modelos) y **cálculos**.
> **Medida maestra:** que el **asesor la acepte y pueda presentarla** — cuadra sin una persona digitando,
> sin colapsar y sin entrar en bucle.
>
> **ENMIENDA DE ESTA VERSIÓN (intención del dueño):** el diseño anterior declaraba clases y métodos
> (**143 métodos, 0 eventos**). Esta versión añade, a CADA clase, **CÓMO HABLA**:
> `SUBE · PUBLICA · ESCUCHA`. La visión event-driven se canaliza **desde el principio**, no al final.
>
> **Decisión del dueño (2026-09-28), ya tomada, NO se reabre:** la vertical se PARTE en **cuatro**
> (`entrada` 32 · `libro` 32 · `fiscal` 22 · `analítica` 32). Es **UN** diseño; el reparto se declara abajo.

---

## Las 5 formas (vocabulario cerrado)

Toda clase del dominio **hereda su forma** (innegociable, de `pasada-diseccion.md`):

| Forma | Qué es | Contrato de herencia |
|---|---|---|
| `Reflejo` | cálculo puro, cero juicio — un test unitario lo AFIRMA | `calcular():Derivado` — no muta estado, no decide |
| `MicroAgente` | juicio con lenguaje/ambigüedad | `juzgar(entrada:Ambigua):Propuesta<Confianza>` — propone; nunca escribe |
| `Custodio` | dueño de su parcela — un solo escritor | `escribir(…):solo-si-es-el-escritor`; dos escritores = corrupción |
| `Conversor` | frontera única de formato/unidad/codificación | `entrar(x:Externo):Interno` · `salir(y:Interno):Externo` |
| `Puente` | conecta con el vecino por evento, sin pisar lo manual | `emitir(…)/recibir(…)` por canal declarable; no impone |

> **El corte maestro** ya está fijado en la disección: 60 `Reflejo` · 29 `Custodio` · 14 `Puente` ·
> 8 `MicroAgente` · 7 `Conversor`. **Este diseño no reclasifica ninguna hoja.**

---

## Objetivo del sistema

**Qué hace:** reconstruye la contabilidad completa (flujo de caja · ventas · consumo · stock · compras ·
resultado · fiscal · grupo · analítica) a partir de **hechos que ya ocurrieron** y del **cierre**.
Observa, normaliza, **anuncia lo que asienta**, deriva, cierra, declara y **avisa**. No digita; no firma;
no decide por el dueño ni por el asesor.

**Cómo habla:** el sistema es una **red de hechos y peticiones**. Cada clase declara qué **pide**
(`SUBE`), qué **hecho anuncia** cuando escribe (`PUBLICA`) y de qué **depende** (`ESCUCHA`). El asiento
asentado, la factura emitida, el ejercicio cerrado, la regla declarada, la firma del asesor y el aviso
entregado son **hechos** que el resto del sistema escucha; el saldo, el balance, la liquidación y el
informe son **derivaciones** que nadie necesita escuchar porque **no cambian estado**.

**Cuándo interrumpe al dueño / al asesor:** **sólo cuando un dato falta, un documento no cuadra, una
regla es nueva, una obligación vence o el negocio se desvía.** Todo lo demás corre sin operador.
El sistema **no bloquea el flujo** por lo dudoso: lo **encola** y **avisa**.

---

## Tipos de soporte del dominio (value objects — NO son hojas)

Estos **no** son clases-hoja: son los **tipos** que las 118 clases de dominio usan. Por qué existen:
porque su lógica se repite en muchas hojas y **fusionarlas en una sola clase rompería la unidad**.
Se nombran aparte, con su porqué.

| Tipo | Porqué (es TIPO, no pieza) |
|---|---|
| `Hecho` | la unidad que el sistema observa y asienta: `tercero · fecha_operacion · fecha_valor · importe · impuestos · forma_pago · clave_natural` |
| `HechoCrudo` | lo que llega de la fuente **antes** de normalizar (forma libre de la vertical) |
| `Asiento` | cabecera equilibrada: `apuntes`, `clave_natural`, `fecha`, `sociedad`, `traza` |
| `Apunte` | línea del asiento: `cuenta`, `cuantia`, `lado∈{debe,haber}`, `dimension` |
| `Cuenta` | nodo del plan: `codigo`, `nombre`, `naturaleza`, `padre` |
| `Tercero` | identidad fiscal única: `nif`, `nombre`, `roles:Set<Rol>`, `condiciones` |
| `Rol` | `cliente` · `proveedor` · `ambos` (resuelve el conflicto ①: **un solo maestro**) |
| `Ejercicio` | periodo anual con `apertura`/`cierre` |
| `Periodo` | subdivisión según `unidad_de_cierre` (jornada/día/mes) — **dato declarado** |
| `Cuantía` | `importe:Decimal + moneda` (moneda base declarada) |
| `Impuesto` | `base · tipo · cuota · retencion` |
| `ClaveNatural` | identidad idempotente de un hecho/cierre (\"un cierre = un asiento\") |
| `ParametroDeclarable` | **TODA ley como dato**: tipos, plazos, coeficientes, calendario, formatos |
| `Cobertura` | **la métrica ÚNICA** de completitud — las demás señales la **LEEN** (conflicto ②) |
| `Excepcion` | elemento dudoso en cola: `origen`, `motivo`, `estado∈{pendiente,resuelta,descartada}` |
| `Documento` | documento origen (digitalizado/recibido): `referencia`, `lineas`, `tercero`, `fechas` |
| `LineaDocumento` | línea del documento: `descripcion`, `importe`, `impuesto` |
| `ReglaAprendida` | regla propuesta, **pendiente de ratificación** antes de actuar sobre el volumen |
| `MarcaEstado` | `en_curso` · `revisado` · `firmado` — el dato que se ve, y en qué punto está |
| `Firma` | marca del asesor — **el sistema NO firma** |
| `SolicitudDecision` | petición de decisión humana (dueño/asesor): `asunto`, `opciones`, `a_quien`, `vence` |
| `Aviso` | `senal`, `destinatario`, `motivo`, `entregado:bool` |
| `Informe` | composición rica: cifra + contexto + comparativa + «qué hacer» |
| `Vencimiento` | `tercero`, `documento`, `fecha`, `estado` — un solo tipo de \"vencimiento\" con dos lados (N6/N8) |
| `Dimension` | centro de coste / línea / familia / sociedad — **declarada, nunca estimada** |
| `Delta` | diferencia entre dos puntos (revisión↔revisión, periodo↔periodo) |
| `Umbral` | umbral declarado (alto importe, caja mínima, desviación) — señal, no decisión |

**Total de tipos de soporte: 26.** Ninguno es una hoja; ninguno sustituye a una clase de dominio.

---

## El habla del sistema — CÓMO HABLA CADA CLASE

> Esta sección es la **enmienda**. Antes, el diseño declaraba clases y métodos. Ahora **cada clase declara
> también su habla**: qué **pide** (`SUBE`), qué **hecho anuncia** (`PUBLICA`) y de qué **depende** (`ESCUCHA`).

### La regla de oro (innegociable)

```
PREGUNTA / DERIVACIÓN  (calcular · listar · saldos · estado · traducir · proponer)
    → NO cambia estado  → NO anuncia nada      (no hay hecho: es una pregunta)
ESCRITURA              (asentar · declarar · cerrar · emitir · firmar · ajustar · encolar · archivar)
    → SÍ cambia estado  → SÍ anuncia el hecho
```

### Los tres verbos

| Verbo | Qué es | A quién va |
|---|---|---|
| `SUBE` | las **peticiones** que la clase emite: qué pide a otras clases (una derivación, una escritura, un servicio) | a otra clase / al sistema |
| `PUBLICA` | los **HECHOS** que la clase anuncia: lo que ha pasado y el resto puede escuchar | al sistema (red de hechos) |
| `ESCUCHA` | los **hechos y peticiones** de los que depende: lo que la despierta o la nutre | desde el sistema |

> **Convención de nombres.** Un `*_` en minúsculas con guion bajo es un **hecho** (`asiento_asentado`).
> Un `peticion.*` es una **petición** (SUBE). Una clase que **no pide nada** escribe `SUBE: —`.

### El reparto del habla (verificado por forma)

| Forma | Clases | ¿PUBLICA hecho? | Por qué |
|---|---|---|---|
| `Custodio` | 29 | **SÍ (29)** | escribe su parcela: su escritura **es** el hecho |
| `Puente` | 14 | **SÍ (13)** | emite hacia el vecino: el envío/el enlace **es** el hecho |
| `MicroAgente` | 8 | **SÍ (1)** — sólo `P3` | `P3` **ACTÚA** (desatasca una excepción); los otros 7 sólo **PROPONEN** |
| `Conversor` | 7 | **NO (0)** | cruza un **formato**: es transformación, no hecho |
| `Reflejo` | 60 | **NO (0)** | **deriva**: pregunta, no escribe |

- **`Q1 consulta-cuentas-bajo-demanda` (Puente) NO publica hecho:** su acto de conectar **es una
  pregunta** (`SUBE: peticion.derivacion_leer`), no una escritura. Es el único Puente que sólo pregunta.
- **Los 7 `Conversor` NO publican:** una frontera de formato **transforma una representación en otra**
  sin decidir ni dejar estado propio. Lo que cruza se anuncia donde **entra a una parcela** o donde
  **sale un artefacto** (custodios y puentes), no en la frontera.
- **Los 7 `MicroAgente` que sólo proponen NO publican:** una `Propuesta<Confianza>` es una pregunta,
  no un hecho. Sólo `P3` publica porque **resuelve** (actúa sobre la cola).

### Los números

- **118 / 118 clases declaran eventos** (`SUBE` y/o `ESCUCHA`; las 75 que no publican siguen pidiendo y
  escuchando).
- **43 clases publican hechos** (29 Custodio + 13 Puente + 1 MicroAgente) → **43 hechos**.
- **75 clases no publican** (60 Reflejo + 7 Conversor + 7 MicroAgente + `Q1`) → sólo preguntan/escuchan.

### Glosario de HECHOS (los 43 que el sistema anuncia)

| # | Hecho | Lo anuncia | Qué dice |
|---|---|---|---|
| 1 | `hecho_recibido` | `A1 PuertoEventoVertical` | un hecho crudo entró desde una fuente |
| 2 | `documento_recibido` | `A5 PuertoDocumentoDigital` | un documento entró por el canal digital |
| 3 | `excepcion_encolada` | `A8.1 EncoladoExcepcion` | algo dudoso espera (el flujo NO se bloqueó) |
| 4 | `revision_solicitada` | `A8.2 AvisoRevision` | se pidió revisión de una excepción |
| 5 | `contrapartida_regla_declarada` | `A6.2 ReglaContrapartida` | una regla de contrapartida quedó declarada |
| 6 | `contrato_hecho_declarado` | `A11 ContratoHechoMinimo` | el mínimo exigible por fuente quedó fijado |
| 7 | `anclaje_cierre_declarado` | `A14 AnclajeCierreVertical` | por fuente, qué es \"un cierre\" |
| 8 | `fuente_faltante_declarada` | `A15 DeclaracionFuenteFaltante` | una fuente no publica un hecho necesario |
| 9 | `hecho_rectificado` | `A13 HechoRectificativo` | un hecho posterior corrigió a su original |
| 10 | `plan_cuentas_declarado` | `B1 CatalogoCuentas` | el plan contable quedó declarado |
| 11 | `asiento_asentado` | `B2 EscritorDiario` | **el hecho central**: un asiento entró al libro |
| 12 | `traza_registrada` | `B4 TrazaAsiento` | quedó la marca inmutable de quién/cuándo |
| 13 | `ajuste_entrado` | `B5 AsientoAjuste` | la corrección del asesor entró **sumando** |
| 14 | `ejercicio_cerrado` | `C4 CierreEjercicio` | el ejercicio quedó cerrado (irreversible salvo ajuste) |
| 15 | `cuadre_no_cuadra` | `C6 AvisoCuadre` | falta cobertura: el sistema NO finge el cuadre |
| 16 | `plazo_declarado` | `D6 CalendarioFiscal` | un plazo fiscal quedó declarado (ley = dato) |
| 17 | `modelo_exportado` | `D7 GeneradorModelo` | un modelo salió hacia el programa del asesor |
| 18 | `factura_encadenada` | `D8 RegistroVerifactu` | una factura quedó encadenada (huella inalterable) |
| 19 | `obligacion_avanzada` | `D12 EstadoPresentacionFiscal` | una obligación cambió de estado |
| 20 | `declaracion_justificada` | `D13 AcusePresentacion` | volvió el acuse y quedó ligado |
| 21 | `declaracion_rectificada` | `D14 RectificacionDeclaracion` | se corrigió una declaración ya presentada |
| 22 | `perfil_administrativo_declarado` | `D15 PerfilAdministrativo` | qué administraciones/obligaciones aplican |
| 23 | `movimiento_regla_declarada` | `E8 ReglaMovimientoBancario` | una regla de movimiento bancario quedó declarada |
| 24 | `cuenta_bancaria_declarada` | `E11 MaestroCuentasBancarias` | una cuenta bancaria y su moneda quedaron declaradas |
| 25 | `activo_alta` | `F1 AltaActivo` | un bien duradero entró al inmovilizado |
| 26 | `cuota_amortizacion_generada` | `F2 PlanAmortizacion` | se generó la cuota del periodo |
| 27 | `nomina_recibida` | `G4 PuertoNomina` | un hecho de nómina entró |
| 28 | `acceso_nomina_declarado` | `G7 AccesoNomina` | quién ve qué nómina quedó fijado |
| 29 | `negocio_parcela_creada` | `I4 AislamientoNegocio` | se creó la parcela aislada de un negocio |
| 30 | `presupuesto_fijado` | `J3 Presupuesto` | un objetivo por dimensión quedó fijado |
| 31 | `negocio_registrado` | `K1 OnboardingNegocio` | un negocio entró al producto con sus datos |
| 32 | `aviso_producido` | `K2 MotorAvisos` | se **produjo** un aviso (su entrega es `R1`) |
| 33 | `criterio_fijado` | `K9 ColaDeclaracionesCriterio` | un criterio quedó fijado/ratificado |
| 34 | `revision_firmada` | `L3 FlujoFirma` | el asesor revisó/firmó (el sistema NO firma) |
| 35 | `documento_archivado` | `L7 ExpedienteDocumental` | la prueba de la firma quedó conservada |
| 36 | `regla_ratificada` | `L10 RatificacionReglaAprendida` | el asesor ratificó o bloqueó una regla |
| 37 | `parcela_reclamada` | `M2 SingleWriter` | un escritor reclamó su parcela (la ley) |
| 38 | `tercero_actualizado` | `N1 MaestroTerceros` | la ficha única del tercero cambió |
| 39 | `tercero_unificado` | `N2 PadronTerceros` | dos formas del mismo NIF se unificaron |
| 40 | `factura_emitida` | `O1 EmisionFacturaVenta` | **contabilidad emitió su factura** (serie/numeración) |
| 41 | `proceso_anotado` | `P2 HistorialProcesoContable` | lo procesado/fallado quedó anotado |
| 42 | `excepcion_desatascada` | `P3 DesatascoEntrada` | una excepción se resolvió/reencoló/descartó con motivo |
| 43 | `aviso_entregado` | `R1 AvisoAlNegocio` | el aviso se **entregó y confirmó** al negocio |

### Glosario de PETICIONES (`SUBE` — las que más se repiten)

| Petición | Va a | Qué pide |
|---|---|---|
| `peticion.hecho_normalizar` | `A2` | dar forma asentable a un hecho crudo |
| `peticion.documento_extraer` | `A4.1` | abrir un documento y volverlo dato (**propone**) |
| `peticion.contrapartida_resolver` | `A6.1` | proponer cuenta/tercero/periodo (**propone**) |
| `peticion.regla_contrapartida_aplicar` | `A6.2` | aplicar la regla vigente (corte duro) |
| `peticion.deduplicar` | `A7` | decir si el hecho ya se vio (idempotencia) |
| `peticion.excepcion_encolar` | `A8.1` | poner lo dudoso en cola sin bloquear |
| `peticion.aviso_producir` | `K2` | producir un aviso desde una señal real |
| `peticion.asiento_asentar` | `B2` | **escribir el asiento** (la petición central del sistema) |
| `peticion.traza_registrar` | `B4` | dejar la marca inmutable |
| `peticion.saldos_derivar` | `B3` | derivar saldos por cuenta del diario |
| `peticion.balance_calcular` / `peticion.resultado_calcular` | `C1` / `C2` | derivar los estados |
| `peticion.decision_solicitar` | `SolicitudDecision` | pedir una decisión humana y **esperar** |
| `peticion.criterio_fijar` | `K9` | fijar/ratificar un criterio declarable |
| `peticion.regla_ratificar` | `L10` | ratificar o bloquear una regla aprendida |
| `peticion.derivacion_leer` | la clase que deriva | leer un cálculo **sin** escribir nada |

---

## Entidades y clases — LAS 118 (una por hoja atómica)

> Formato: `ATRIBUTOS · METODOS · REGLA` + `SUBE · PUBLICA · ESCUCHA` + `FORMA` + `HOJA` + vertical.
> Cada clase **extiende su forma**. `[ABIERTO]` = su dato lo declara el dueño; **la clase existe,
> su contenido no se estima**.
> **Las que ESCRIBEN anuncian el hecho; las que sólo CALCULAN no anuncian nada.**

### GRUPO A · ENTRADA-HECHOS — LA PUERTA (eslabón limitante) · `contabilidad-entrada`

```
CLASE PuertoEventoVertical : Puente {                     FORMA: PUENTE   · HOJA: A1   · entrada
  ATRIBUTOS: contrato:ContratoHechoMinimo, fuentes:Set<FuenteVertical>
  METODOS:  abrir(fuente:FuenteVertical):Flujo<HechoCrudo>
            recibir(crudo:HechoCrudo):Hecho
  REGLA:     la vertical manda; contabilidad se adapta. NO impone formato ni obliga a emitir.
  SUBE:      peticion.hecho_normalizar (A2) · peticion.deduplicar (A7) · peticion.aviso_producir (K2)
  PUBLICA:   hecho_recibido { fuente, clave_natural, traza }
  ESCUCHA:   (es la puerta: no depende de nadie; la despierta la fuente)
}
CLASE NormalizadorHecho : Conversor {                     FORMA: CONVERSOR · HOJA: A2   · entrada
  ATRIBUTOS: regla_forma:ParametroDeclarable
  METODOS:  entrar(crudo:HechoCrudo):Hecho
  REGLA:     ÚNICA puerta de formato: homogeneiza el hecho de cada vertical a forma asentable.
  SUBE:      peticion.criterio_fijar (K9, si la forma no está declarada)
  PUBLICA:   —   (CONVERSOR: cruza un formato; eso es transformación, no hecho)
  ESCUCHA:   hecho_recibido (A1) · documento_recibido (A5)
}
CLASE CapturaDocumento : Reflejo {                        FORMA: REFLEJO  · HOJA: A3   · entrada
  ATRIBUTOS: documento:Documento
  METODOS:  admitir(doc:Documento):Validacion<Documento>
  REGLA:     admite el documento (digitalizado o recibido) y valida campos; mecánico, cero juicio.
  SUBE:      peticion.documento_extraer (A4.1) · peticion.documento_extraer_forma (A4.2)
  PUBLICA:   —   (REFLEJO: valida, no escribe)
  ESCUCHA:   documento_recibido (A5)
}
CLASE ExtraccionDato : MicroAgente {                      FORMA: MICRO-AGENTE · HOJA: A4.1 · entrada
  ATRIBUTOS: documento:Documento
  METODOS:  juzgar(doc:Documento):Propuesta<Hecho>
  REGLA:     abre un documento NO estructurado y lo vuelve dato. Interpretar lo ilegible es juicio;
             no asienta: PROPONE. La contrapartida se resuelve después.
  SUBE:      peticion.cuadre_documento_controlar (A4.3) · peticion.excepcion_encolar (A8.1)
  PUBLICA:   —   (MICRO-AGENTE que PROPONE: una propuesta es pregunta, no hecho)
  ESCUCHA:   (recibe el documento de A3/A4.2)
}
CLASE PuertoDocumento : Conversor {                       FORMA: CONVERSOR · HOJA: A4.2 · entrada
  ATRIBUTOS: formas_declarables:Set<FormaDocumento>
  METODOS:  entrar(externo:Externo):Documento
  REGLA:     frontera de las formas declarables del documento; el adaptador lo pone el sitio.
  SUBE:      peticion.documento_extraer (A4.1)
  PUBLICA:   —   (CONVERSOR: frontera de forma)
  ESCUCHA:   (la despierta el canal declarado)
}
CLASE ControlCuadreDocumento : Reflejo {                  FORMA: REFLEJO  · HOJA: A4.3 · entrada
  ATRIBUTOS: tolerancia:ParametroDeclarable
  METODOS:  cuadra(doc:Documento):bool
  REGLA:     si importe+impuestos no cuadran → cola, NO se asienta mal. Cálculo determinista.
  SUBE:      peticion.excepcion_encolar (A8.1, si descuadra)
  PUBLICA:   —   (REFLEJO: comprueba, no escribe)
  ESCUCHA:   (recibe el dato propuesto por A4.1)
}
CLASE PuertoDocumentoDigital : Puente {                   FORMA: PUENTE   · HOJA: A5   · entrada
  ATRIBUTOS: canal:ParametroDeclarable
  METODOS:  recibir():Flujo<Documento>
  REGLA:     recepción digital declarable; conecta con el canal emisor; si no existe, se crea.
  SUBE:      peticion.hecho_normalizar (A2) · peticion.documento_extraer (A4.1)
  PUBLICA:   documento_recibido { canal, referencia, traza }
  ESCUCHA:   (la despierta el canal declarable)
}
CLASE ContrapartidaAsistida : MicroAgente {               FORMA: MICRO-AGENTE · HOJA: A6.1 · entrada
  ATRIBUTOS: plan:CatalogoCuentas, terceros:MaestroTerceros
  METODOS:  juzgar(h:Hecho):Propuesta<Apunte>
  REGLA:     propone cuenta/tercero/periodo contra el plan declarado. PROPONE; el corte duro lo fija
             la regla (A6.2). No escribe. Si el hecho está incompleto → `[ABIERTO]` A6.3.
  SUBE:      peticion.regla_contrapartida_aplicar (A6.2) · peticion.decision_solicitar (hecho incompleto)
  PUBLICA:   —   (MICRO-AGENTE que PROPONE)
  ESCUCHA:   hecho_recibido (A1) · plan_cuentas_declarado (B1) · tercero_actualizado (N1)
}
CLASE ReglaContrapartida : Custodio {                     FORMA: CUSTODIO · HOJA: A6.2 · entrada
  ATRIBUTOS: reglas:Set<ReglaAprendida>, plan:CatalogoCuentas
  METODOS:  aplicar(h:Hecho):Opcion<Apunte>, proponer(r:ReglaAprendida)
  REGLA:     parcela de reglas declarables/aprendidas ("este proveedor → esta cuenta"). UN escritor.
             El aprendizaje entra hidratado (desatasco/ratificación); NO actúa sobre el volumen
             sin ratificación (L10).
  SUBE:      peticion.regla_ratificar (L10) · peticion.decision_solicitar
  PUBLICA:   contrapartida_regla_declarada { regla, alcance, traza }
  ESCUCHA:   regla_ratificada (L10) · excepcion_desatascada (P3)
}
CLASE DeduplicacionHecho : Reflejo {                      FORMA: REFLEJO  · HOJA: A7   · entrada
  ATRIBUTOS: vistas:Set<ClaveNatural>
  METODOS:  es_nuevo(h:Hecho):bool
  REGLA:     aplica la clave natural del hecho/documento → no duplica. Idempotencia determinista.
  SUBE:      peticion.clave_natural_calcular (M3)
  PUBLICA:   —   (REFLEJO: pregunta si es nuevo, no escribe)
  ESCUCHA:   (la despierta la petición de admisión)
}
CLASE EncoladoExcepcion : Custodio {                      FORMA: CUSTODIO · HOJA: A8.1 · entrada
  ATRIBUTOS: cola:List<Excepcion>
  METODOS:  encolar(e:Excepcion), tomar(id):Excepcion
  REGLA:     parcela de lo dudoso. UN escritor. El flujo CONTINÚA; lo dudoso espera.
             ¿Quién la resuelve (asesor/dueño/trabajador)? `[ABIERTO]` A8.3.
  SUBE:      peticion.aviso_producir (A8.2)
  PUBLICA:   excepcion_encolada { origen, motivo, traza }
  ESCUCHA:   (la despierta A4.3 · A6.1 · P3)
}
CLASE AvisoRevision : Puente {                            FORMA: PUENTE   · HOJA: A8.2 · entrada
  ATRIBUTOS: destino:ParametroDeclarable
  METODOS:  empujar(e:Excepcion):Aviso
  REGLA:     empujón al canal de avisos ("esto necesita revisión"). Conecta por evento.
             Una excepción SIEMPRE genera aviso: no pantalla muda.
  SUBE:      peticion.aviso_producir (K2)
  PUBLICA:   revision_solicitada { excepcion, destinatario }
  ESCUCHA:   excepcion_encolada (A8.1)
}
CLASE LoteAdmision : Reflejo {                            FORMA: REFLEJO  · HOJA: A9   · entrada
  ATRIBUTOS: tamano_lote:ParametroDeclarable
  METODOS:  admitir(entrada:Flujo<Hecho>):Flujo<Hecho>
  REGLA:     desacople del cuello: N hechos en paralelo (la admisión no se serializa).
             El paralelismo es de ADMISIÓN; la escritura sigue siendo única (M2).
  SUBE:      peticion.hecho_normalizar (A2) · peticion.asiento_asentar (B2)
  PUBLICA:   —   (REFLEJO: programa la admisión, no escribe)
  ESCUCHA:   (la despierta el flujo de entrada)
}
CLASE ContratoHechoMinimo : Custodio {                    FORMA: CUSTODIO · HOJA: A11  · entrada
  ATRIBUTOS: campos_por_vertical:Map<FuenteVertical,Campos>
  METODOS:  exigir(f:FuenteVertical):Contrato, declarar(f,c:Campos)
  REGLA:     parcela declarable del MÍNIMO exigible. Es la cara vista desde la fuente:
             no un formato impuesto, un mínimo declarado. UN escritor. `[ABIERTO]` A10 (qué fuentes).
  SUBE:      peticion.criterio_fijar (K9)
  PUBLICA:   contrato_hecho_declarado { fuente, campos }
  ESCUCHA:   (lo declara el dueño/asesor)
}
CLASE CompletitudCobertura : Reflejo {                    FORMA: REFLEJO  · HOJA: A12  · entrada
  ATRIBUTOS: esperados:Set<Hecho>, llegados:Set<Hecho>
  METODOS:  medir():Cobertura
  REGLA:     mide qué hechos publicó una vertical y cuáles NO llegaron. Produce **la métrica única**;
             Q3/C6/P4 la LEEN (no la recalculan) — conflicto ② resuelto.
  SUBE:      peticion.aviso_producir (K2, si falta cobertura)
  PUBLICA:   —   (REFLEJO: mide, no escribe)
  ESCUCHA:   hecho_recibido (A1)
}
CLASE HechoRectificativo : Puente {                       FORMA: PUENTE   · HOJA: A13  · entrada
  ATRIBUTOS: original:Hecho
  METODOS:  emparejar(rect:Hecho):Enlace<Hecho,Hecho>
  REGLA:     conecta el hecho posterior que corrige/anula uno anterior por clave natural.
             NO borra, añade. ≠ ajuste interno B5 ≠ rectificativa comercial O2 ≠ fiscal D14.
  SUBE:      peticion.clave_natural_calcular (M3) · peticion.asiento_asentar (B2)
  PUBLICA:   hecho_rectificado { original, rectificativo, clave_natural }
  ESCUCHA:   hecho_recibido (A1)
}
CLASE AnclajeCierreVertical : Custodio {                  FORMA: CUSTODIO · HOJA: A14  · entrada
  ATRIBUTOS: por_vertical:Map<FuenteVertical,DefinicionCierre>
  METODOS:  anclar(f:FuenteVertical):DefinicionCierre, declarar(f,d)
  REGLA:     parcela declarable de POR VERTICAL qué es "un cierre" y cómo se identifica. Su puerto es
             construible; su contenido pende de `unidad_de_cierre` (`[ABIERTO]` M4). UN escritor.
  SUBE:      peticion.criterio_fijar (K9) · peticion.clave_natural_calcular (M3)
  PUBLICA:   anclaje_cierre_declarado { fuente, definicion }
  ESCUCHA:   criterio_fijado (K9)
}
CLASE DeclaracionFuenteFaltante : Puente {                FORMA: PUENTE   · HOJA: A15  · entrada
  ATRIBUTOS: cobertura:Cobertura
  METODOS:  declarar(faltante:Hueco):Aviso
  REGLA:     detecta que una vertical NO publica un hecho necesario y lo DECLARA (abierto + aviso).
             NO obliga a la vertical a producirlo.
  SUBE:      peticion.aviso_producir (K2) · peticion.decision_solicitar
  PUBLICA:   fuente_faltante_declarada { fuente, hecho_faltante, traza }
  ESCUCHA:   hecho_recibido (A1)
}
```

### GRUPO B · LIBRO-NÚCLEO — partida doble · `contabilidad-libro`

```
CLASE CatalogoCuentas : Custodio {                        FORMA: CUSTODIO · HOJA: B1   · libro
  ATRIBUTOS: cuentas:Set<Cuenta>
  METODOS:  anadir(c:Cuenta), buscar(codigo):Opcion<Cuenta>
  REGLA:     plan contable declarable/importable del asesor. UN escritor.
  SUBE:      peticion.plan_contable_entrar (B6) · peticion.decision_solicitar / peticion.criterio_fijar (K9)
  PUBLICA:   plan_cuentas_declarado { cuentas, origen }
  ESCUCHA:   (lo declara el asesor / el negocio)
}
CLASE EscritorDiario : Custodio {                         FORMA: CUSTODIO · HOJA: B2   · libro
  ATRIBUTOS: asientos:List<Asiento>, escritor_id
  METODOS:  asentar(a:Asiento):Resultado
  REGLA:     ES EL custodio del libro. Single-writer por parcela: dos escritores corrompen.
             Rechaza si Σ debe ≠ Σ haber (invariante 1).
  SUBE:      peticion.traza_registrar (B4) · peticion.frontera_planos_verificar (M1) ·
             peticion.periodo_imputar (C3) · peticion.deduplicar (A7)
  PUBLICA:   asiento_asentado { asiento, clave_natural, sociedad, traza }
  ESCUCHA:   ajuste_entrado (B5) · hecho_recibido (A1) · hecho_rectificado (A13) · ejercicio_cerrado (C4)
}
CLASE MayorBalanza : Reflejo {                            FORMA: REFLEJO  · HOJA: B3   · libro
  ATRIBUTOS: diario:EscritorDiario
  METODOS:  saldos(ejercicio):Map<Cuenta,Cuantía>, balanza():EstadoDerivado
  REGLA:     saldos por cuenta DERIVADOS del diario. Cálculo determinista; un test lo afirma.
  SUBE:      peticion.derivacion_leer (B2: lee el diario; no escribe)
  PUBLICA:   —   (REFLEJO: deriva saldos, no escribe)
  ESCUCHA:   asiento_asentado (B2) (invalida su caché de derivación)
}
CLASE TrazaAsiento : Custodio {                           FORMA: CUSTODIO · HOJA: B4   · libro
  ATRIBUTOS: marcas:List<MarcaTraza>
  METODOS:  registrar(a:Asiento, quien, cuando)
  REGLA:     registro inmutable (quién/cuándo creó cada asiento), append-only. UN escritor.
  SUBE:      (ninguna: sólo recibe la marca; un append-only no pide nada)
  PUBLICA:   traza_registrada { asiento, quien, cuando }
  ESCUCHA:   asiento_asentado (B2) · ajuste_entrado (B5)
}
CLASE AsientoAjuste : Puente {                            FORMA: PUENTE   · HOJA: B5   · libro
  ATRIBUTOS: origen:SolicitudDecision
  METODOS:  entrar(ajuste:Asiento)
  REGLA:     camino por el que la corrección del asesor ENTRA al libro sin borrar. Conecta por evento,
             traza intacta. El almacén es B2/B4, no este camino. ¿Suma o reemplaza? `[ABIERTO]` L4/B5.
  SUBE:      peticion.asiento_asentar (B2) · peticion.traza_registrar (B4)
  PUBLICA:   ajuste_entrado { ajuste, origen, clave_natural }
  ESCUCHA:   (lo despierta la corrección del asesor por el puerto de exportación L1)
}
CLASE PuertoPlanContable : Conversor {                    FORMA: CONVERSOR · HOJA: B6   · libro
  ATRIBUTOS: formato:ParametroDeclarable
  METODOS:  entrar(externo):Set<Cuenta>, salir(plan):Externo
  REGLA:     frontera de codificación del plan (import/export). Cruce de formatos.
  SUBE:      peticion.plan_cuentas_declarar (B1)
  PUBLICA:   —   (CONVERSOR: frontera de formato)
  ESCUCHA:   (la despierta el canal declarado del asesor)
}
```

### GRUPO C · ESTADOS-CIERRE — balance · resultado · cierre · periodificación · `contabilidad-libro`

```
CLASE BalanceSituacion : Reflejo {                        FORMA: REFLEJO  · HOJA: C1   · libro
  ATRIBUTOS: mayor:MayorBalanza
  METODOS:  calcular(ejercicio):EstadoDerivado
  REGLA:     activo/pasivo/patrimonio derivado del mayor. Determinista.
             Invariante: ACTIVO = PASIVO + PATRIMONIO; descuadre = ERROR, no estado.
  SUBE:      peticion.derivacion_leer (B3)
  PUBLICA:   —   (REFLEJO: deriva el estado, no escribe)
  ESCUCHA:   asiento_asentado (B2) · ejercicio_cerrado (C4)
}
CLASE CuentaResultados : Reflejo {                        FORMA: REFLEJO  · HOJA: C2   · libro
  ATRIBUTOS: mayor:MayorBalanza
  METODOS:  calcular(ejercicio):EstadoDerivado
  REGLA:     ingresos/gastos/resultado derivado. Determinista.
  SUBE:      peticion.derivacion_leer (B3)
  PUBLICA:   —   (REFLEJO: deriva, no escribe)
  ESCUCHA:   asiento_asentado (B2) · ejercicio_cerrado (C4)
}
CLASE Periodificacion : Reflejo {                         FORMA: REFLEJO  · HOJA: C3   · libro
  ATRIBUTOS: criterio:Periodo
  METODOS:  imputar(a:Asiento):Periodo
  REGLA:     imputa cada hecho a su periodo con el criterio declarado; CONSERVA fecha operación y
             fecha valor, NO elige. Determinista. Criterio `[ABIERTO]` C7.
  SUBE:      peticion.criterio_fijar (K9, si falta `momento_de_uso`/`unidad_de_cierre`)
  PUBLICA:   —   (REFLEJO: imputa, no escribe)
  ESCUCHA:   (la despierta la petición de asentar)
}
CLASE CierreEjercicio : Custodio {                        FORMA: CUSTODIO · HOJA: C4   · libro
  ATRIBUTOS: ejercicio:Ejercicio, cerrado:bool
  METODOS:  cerrar(ajustes:List<Asiento>):Resultado, reabrir(solo_con:AsientoAjuste)
  REGLA:     cierra el periodo con ajustes. IRREVERSIBLE salvo ajuste (invariante 12). UN escritor.
             El DÍA cierra la caja (operación); el MES cierra la contabilidad (decisión del dueño).
  SUBE:      peticion.amortizacion_cuota_generar (F2) · peticion.asiento_asentar (B2) ·
             peticion.aviso_producir (C6, si falta cobertura)
  PUBLICA:   ejercicio_cerrado { ejercicio, ajustes, clave_natural }
  ESCUCHA:   (lo despierta el cierre por el puerto de anclaje A14 / la cadencia declarada)
}
CLASE AperturaEjercicio : Reflejo {                       FORMA: REFLEJO  · HOJA: C5   · libro
  ATRIBUTOS: cierre_anterior:CierreEjercicio
  METODOS:  generar():List<Asiento>
  REGLA:     asientos de apertura DERIVADOS del cierre anterior. Determinista.
  SUBE:      peticion.asiento_asentar (B2)  — los asientos de apertura que genera SÍ se escriben
  PUBLICA:   —   (REFLEJO: DERIVA los asientos; quien los ESCRIBE y anuncia es B2, no esta clase)
  ESCUCHA:   ejercicio_cerrado (C4)
}
CLASE AvisoCuadre : Puente {                              FORMA: PUENTE   · HOJA: C6   · libro
  ATRIBUTOS: cobertura:Cobertura, destino:ParametroDeclarable
  METODOS:  avisar(ejercicio):Aviso
  REGLA:     NO finge el cuadre: si falta cobertura, avisa. LEE la métrica única; no la recalcula.
  SUBE:      peticion.aviso_producir (K2) · peticion.decision_solicitar (quién actúa: `[ABIERTO]` Q70)
  PUBLICA:   cuadre_no_cuadra { ejercicio, cobertura, destinatario }
  ESCUCHA:   (lo despierta el cierre C4 / el vencimiento del cuadre)
}
```

### GRUPO D · CAPA-FISCAL — IVA · IS/IRPF · retenciones · modelos · Verifactu · e-factura · `contabilidad-fiscal`

```
CLASE LiquidacionIva : Reflejo {                          FORMA: REFLEJO  · HOJA: D1   · fiscal
  ATRIBUTOS: mayor:MayorBalanza, params:ParametroDeclarable
  METODOS:  calcular(periodo):Liquidacion
  REGLA:     IVA devengado/soportado DERIVADO del libro. Determinista. Tipos = dato, no constante.
             El IVA va por DEVENGO, pero el hecho observado es el cobro/pago: `periodificacion` C3 separa.
  SUBE:      peticion.derivacion_leer (B3) · peticion.criterio_fijar (D15/K9 si falta régimen)
  PUBLICA:   —   (REFLEJO: deriva la liquidación, no escribe)
  ESCUCHA:   asiento_asentado (B2) · ejercicio_cerrado (C4)
}
CLASE Modelo303 : Reflejo {                               FORMA: REFLEJO  · HOJA: D2   · fiscal
  ATRIBUTOS: liquidacion:LiquidacionIva, formato:ParametroDeclarable
  METODOS:  construir(periodo):Modelo
  REGLA:     construye el modelo desde la liquidación. Determinista.
  SUBE:      peticion.derivacion_leer (D1)
  PUBLICA:   —   (REFLEJO: construye el modelo, no escribe)
  ESCUCHA:   asiento_asentado (B2) · ejercicio_cerrado (C4)
}
CLASE Modelo390 : Reflejo {                               FORMA: REFLEJO  · HOJA: D3   · fiscal
  ATRIBUTOS: liquidaciones:List<LiquidacionIva>
  METODOS:  construir(ejercicio):Modelo
  REGLA:     ídem anual; construcción determinista desde el libro.
  SUBE:      peticion.derivacion_leer (D1)
  PUBLICA:   —   (REFLEJO: construye, no escribe)
  ESCUCHA:   ejercicio_cerrado (C4)
}
CLASE Retenciones : Reflejo {                             FORMA: REFLEJO  · HOJA: D4   · fiscal
  ATRIBUTOS: mayor:MayorBalanza, params:ParametroDeclarable
  METODOS:  calcular(periodo):Liquidacion
  REGLA:     retenciones practicadas/soportadas calculadas desde los asientos. Determinista.
  SUBE:      peticion.derivacion_leer (B3)
  PUBLICA:   —   (REFLEJO: deriva, no escribe)
  ESCUCHA:   asiento_asentado (B2) · ejercicio_cerrado (C4)
}
CLASE EstimacionIsIrpf : Reflejo {                        FORMA: REFLEJO  · HOJA: D5   · fiscal
  ATRIBUTOS: resultados:CuentaResultados, base:ParametroDeclarable
  METODOS:  estimar(ejercicio):Estimacion
  REGLA:     estimación del resultado fiscal con base DECLARADA. Determinista. Nada se estima sin base.
  SUBE:      peticion.derivacion_leer (C2) · peticion.criterio_fijar (D15, si falta sujeto IS/IRPF)
  PUBLICA:   —   (REFLEJO: estima, no escribe)
  ESCUCHA:   ejercicio_cerrado (C4)
}
CLASE CalendarioFiscal : Custodio {                       FORMA: CUSTODIO · HOJA: D6   · fiscal
  ATRIBUTOS: plazos:Set<ParametroDeclarable>
  METODOS:  proximos(hoy):List<Vencimiento>, declarar(p)
  REGLA:     parcela de plazos declarables → dispara aviso proactivo. UN escritor. La ley entra como dato.
  SUBE:      peticion.aviso_producir (K2) · peticion.decision_solicitar (plazo perdido: sanción)
  PUBLICA:   plazo_declarado { obligacion, fecha, administracion }
  ESCUCHA:   (lo declara el perfil administrativo D15 / el asesor)
}
CLASE GeneradorModelo : Puente {                          FORMA: PUENTE   · HOJA: D7   · fiscal
  ATRIBUTOS: destino:ParametroDeclarable
  METODOS:  exportar(m:Modelo):Fichero<Externo>
  REGLA:     salida al programa del asesor. Conecta por puerto. Formato ABIERTO (`[ABIERTO]` L6).
             ¿El sistema presenta o sólo prepara? `[ABIERTO]` Q34 — aquí PREPARA.
  SUBE:      peticion.obligacion_avanzar (D12: generada) · peticion.decision_solicitar (Q34)
  PUBLICA:   modelo_exportado { modelo, destino, periodo }
  ESCUCHA:   (lo despierta la generación de un modelo D2/D3/D5)
}
CLASE RegistroVerifactu : Custodio {                      FORMA: CUSTODIO · HOJA: D8   · fiscal
  ATRIBUTOS: cadena:List<Huella>
  METODOS:  encadenar(f:FacturaEmitida):Huella
  REGLA:     huella/cadena INALTERABLE de la facturación, registro encadenado. UN escritor.
             Exigencia de la administración: el registro no se borra, se encadena.
  SUBE:      (ninguna: un registro encadenado sólo recibe y encadena)
  PUBLICA:   factura_encadenada { factura, huella, anterior }
  ESCUCHA:   factura_emitida (O1)
}
CLASE FacturaElectronica : Conversor {                    FORMA: CONVERSOR · HOJA: D9   · fiscal
  ATRIBUTOS: formato:ParametroDeclarable
  METODOS:  entrar(externo):FacturaEmitida, salir(f):Externo
  REGLA:     frontera de formato estructurado de la factura.
  SUBE:      peticion.factura_encadenar (D8) · peticion.factura_emitir (O1)
  PUBLICA:   —   (CONVERSOR: frontera de formato)
  ESCUCHA:   (la despierta el canal declarado de e-factura)
}
CLASE EstadoPresentacionFiscal : Custodio {               FORMA: CUSTODIO · HOJA: D12  · fiscal
  ATRIBUTOS: ciclo:Map<Obligacion,EstadoObligacion>
  METODOS:  avanzar(o:Obligacion, e:EstadoObligacion)
  REGLA:     ciclo de vida de cada obligación (pendiente→generada→presentada→justificada→atrasada).
             UN escritor. Sin él, el calendario avisa pero nadie sabe en qué punto está cada modelo.
  SUBE:      peticion.aviso_producir (K2, si se atrasa)
  PUBLICA:   obligacion_avanzada { obligacion, estado_nuevo, fecha }
  ESCUCHA:   modelo_exportado (D7) · declaracion_justificada (D13) · declaracion_rectificada (D14)
}
CLASE AcusePresentacion : Puente {                        FORMA: PUENTE   · HOJA: D13  · fiscal
  ATRIBUTOS: modelo:Modelo, asiento:Asiento
  METODOS:  ligar(acus:Justificante)
  REGLA:     recoge y liga el justificante/acuse que devuelve la administración a su modelo y a su
             asiento. Cierra el bucle hacia fuera, por evento.
  SUBE:      peticion.obligacion_avanzar (D12: justificada) · peticion.asiento_asentar (B2) ·
             peticion.documento_archivar (L7)
  PUBLICA:   declaracion_justificada { obligacion, justificante, traza }
  ESCUCHA:   (lo despierta el canal de acuse de la administración)
}
CLASE RectificacionDeclaracion : Custodio {               FORMA: CUSTODIO · HOJA: D14  · fiscal
  ATRIBUTOS: presentadas:Set<Obligacion>
  METODOS:  rectificar(o, tipo∈{complementaria,sustitutiva}):Obligacion
  REGLA:     camino de corrección POSTERIOR a la presentación. UN escritor. ≠ `asiento-ajuste` B5.
             Tres actos, no uno: comercial O2 puede provocar B5 y, si ya se declaró, D14.
  SUBE:      peticion.obligacion_avanzar (D12) · peticion.decision_solicitar
  PUBLICA:   declaracion_rectificada { obligacion, tipo, traza }
  ESCUCHA:   (la despierta el hallazgo de un error ya presentado)
}
CLASE PerfilAdministrativo : Custodio {                   FORMA: CUSTODIO · HOJA: D15  · fiscal
  ATRIBUTOS: administraciones:Set<Administracion>, regimen:ParametroDeclarable
  METODOS:  obligaciones():Set<Obligacion>, declarar(...)
  REGLA:     parcela declarable de qué administraciones y obligaciones aplican (territorio y régimen).
             ≠ `parametros-fiscales` D11, que son tipos y bases. UN escritor. `[ABIERTO]` D10/D11.
  SUBE:      peticion.plazo_declarar (D6) · peticion.criterio_fijar (K9)
  PUBLICA:   perfil_administrativo_declarado { administraciones, obligaciones }
  ESCUCHA:   (lo declara el dueño/asesor)
}
```

### GRUPO E · TESORERÍA — bancos · conciliación · previsión · `contabilidad-libro`

```
CLASE ConciliacionBancaria : Reflejo {                    FORMA: REFLEJO  · HOJA: E1   · libro
  ATRIBUTOS: extracto:Flujo<Movimiento>, diario:EscritorDiario, reglas:ReglaMovimientoBancario
  METODOS:  cruzar(periodo):ResultadoConciliacion
  REGLA:     cruce extracto ↔ libro por clave natural y reglas. Determinista (un test lo afirma).
             El JUICIO de lo que no casa vive en E7 (fuzzy) / E8 (custodio): no se duplica aquí.
  SUBE:      peticion.derivacion_leer (B2) · peticion.partida_identificar (E7) ·
             peticion.partida_conciliatoria_leer (E9)
  PUBLICA:   —   (REFLEJO: cruza, no escribe)
  ESCUCHA:   asiento_asentado (B2) · movimiento_regla_declarada (E8)
}
CLASE PuertoExtracto : Conversor {                        FORMA: CONVERSOR · HOJA: E2   · libro
  ATRIBUTOS: adaptadores:Map<Banco,FormaExtracto>
  METODOS:  entrar(externo):Flujo<Movimiento>
  REGLA:     frontera de canal/formato del extracto; un adaptador por banco; si falta, se crea.
  SUBE:      peticion.conciliacion_cruzar (E1)
  PUBLICA:   —   (CONVERSOR: frontera de canal/formato)
  ESCUCHA:   (la despierta el canal declarado de cada banco)
}
CLASE CuadreCobroPago : Reflejo {                         FORMA: REFLEJO  · HOJA: E3   · libro
  ATRIBUTOS: movimientos:Flujo<Movimiento>, diario:EscritorDiario
  METODOS:  cuadrar(m:Movimiento):Opcion<Asiento>
  REGLA:     clave natural compartida: un movimiento bancario = un cobro/pago. Determinista.
             La clave natural compartida evita que el mismo cobro/pago viva dos veces.
  SUBE:      peticion.asiento_asentar (B2, cuando cuadra) · peticion.partida_identificar (E7, cuando no)
  PUBLICA:   —   (REFLEJO: cuadra, no escribe; la escritura la hace B2)
  ESCUCHA:   asiento_asentado (B2)
}
CLASE SaldoTesoreria : Reflejo {                          FORMA: REFLEJO  · HOJA: E4   · libro
  ATRIBUTOS: cuentas:MaestroCuentasBancarias, mayor:MayorBalanza
  METODOS:  calcular(cuenta, fecha):Cuantía
  REGLA:     posición real de dinero por cuenta. Derivación determinista.
  SUBE:      peticion.derivacion_leer (B3)
  PUBLICA:   —   (REFLEJO: deriva la posición, no escribe)
  ESCUCHA:   asiento_asentado (B2) · cuenta_bancaria_declarada (E11)
}
CLASE PrevisionCaja : Reflejo {                           FORMA: REFLEJO  · HOJA: E5   · libro
  ATRIBUTOS: vencimientos:Set<Vencimiento>, politica:PoliticaCobroPago, saldo:SaldoTesoreria
  METODOS:  proyectar(hasta):Serie<Cuantía>
  REGLA:     proyecta entradas/salidas desde los compromisos con la política declarada. Determinista.
             Política `[ABIERTO]` E6. Alimentada por N6 (pago) y N8 (cobro).
  SUBE:      peticion.derivacion_leer (E4) · peticion.aviso_producir (K2, si la caja aprieta)
  PUBLICA:   —   (REFLEJO: proyecta, no escribe)
  ESCUCHA:   asiento_asentado (B2) · criterio_fijado (K9, política de cobro/pago)
}
CLASE PartidaNoIdentificada : MicroAgente {               FORMA: MICRO-AGENTE · HOJA: E7 · libro
  ATRIBUTOS: movimiento:Movimiento, reglas:ReglaMovimientoBancario
  METODOS:  juzgar(m:Movimiento):Propuesta<Apunte>
  REGLA:     reconoce y clasifica el movimiento sin contrapartida (comisión/interés/devolución).
             La descripción del banco llega ambigua → interpretar. Una vez existe la regla (E8),
             pasa a automático. PROPONE; no escribe.
  SUBE:      peticion.regla_movimiento_aplicar (E8) · peticion.excepcion_encolar (A8.1)
  PUBLICA:   —   (MICRO-AGENTE que PROPONE)
  ESCUCHA:   movimiento_regla_declarada (E8)
}
CLASE ReglaMovimientoBancario : Custodio {                FORMA: CUSTODIO · HOJA: E8   · libro
  ATRIBUTOS: reglas:Set<ReglaAprendida>
  METODOS:  aplicar(m:Movimiento):Opcion<Apunte>, proponer(r:ReglaAprendida)
  REGLA:     parcela de reglas declarables/aprendidas ("esta comisión → esta cuenta"). UN escritor.
             Ratificación ÚNICA por L10, no por tres puertas distintas.
  SUBE:      peticion.regla_ratificar (L10) · peticion.asiento_asentar (B2, cuando ya es automático)
  PUBLICA:   movimiento_regla_declarada { regla, alcance }
  ESCUCHA:   regla_ratificada (L10)
}
CLASE PartidaConciliatoria : Reflejo {                    FORMA: REFLEJO  · HOJA: E9   · libro
  ATRIBUTOS: transito:Set<Partida>
  METODOS:  desfase():Cuantía
  REGLA:     partidas en tránsito que explican el desfase (cheque no cobrado, cobro no apuntado).
             Determinista. El desfase se EXPLICA, no se esconde.
  SUBE:      peticion.derivacion_leer (E4)
  PUBLICA:   —   (REFLEJO: calcula el desfase, no escribe)
  ESCUCHA:   asiento_asentado (B2)
}
CLASE InformeConciliacion : Reflejo {                     FORMA: REFLEJO  · HOJA: E10  · libro
  ATRIBUTOS: conciliacion:ConciliacionBancaria
  METODOS:  componer(periodo):Informe
  REGLA:     documento de cuadre saldo banco ↔ saldo contable ajustado. La PRUEBA de que cuadra.
  SUBE:      peticion.derivacion_leer (E1/E9)
  PUBLICA:   —   (REFLEJO: compone el informe, no escribe)
  ESCUCHA:   asiento_asentado (B2)
}
CLASE MaestroCuentasBancarias : Custodio {                FORMA: CUSTODIO · HOJA: E11  · libro
  ATRIBUTOS: cuentas:Map<IdCuenta,Moneda>
  METODOS:  declarar(c), listar():Set<IdCuenta>
  REGLA:     parcela declarable de cuentas y su moneda. UN escritor. Sin él, "el banco" es un número falso.
             `diferencia-cambio` E12 `[ABIERTO]`: se activa SÓLO si el dueño declara multi-moneda.
  SUBE:      peticion.criterio_fijar (K9) · peticion.decision_solicitar (multi-moneda: Q20)
  PUBLICA:   cuenta_bancaria_declarada { cuenta, moneda }
  ESCUCHA:   (lo declara el negocio)
}
```

### GRUPO F · INMOVILIZADO — altas · amortizaciones · bajas · `contabilidad-analítica`

```
CLASE AltaActivo : Custodio {                             FORMA: CUSTODIO · HOJA: F1   · analítica
  ATRIBUTOS: activos:Set<Activo>
  METODOS:  registrar(a:Activo):Resultado
  REGLA:     parcela del inmovilizado. UN escritor. La valoración del alta es reflejo hidratador.
  SUBE:      peticion.asiento_asentar (B2) · peticion.plan_amortizacion_generar (F2) ·
             peticion.documento_archivar (L7)
  PUBLICA:   activo_alta { activo, coste, fecha }
  ESCUCHA:   (lo despierta el alta de un bien duradero / una factura de inversión)
}
CLASE PlanAmortizacion : Custodio {                       FORMA: CUSTODIO · HOJA: F2   · analítica
  ATRIBUTOS: planes:Map<Activo,Cuotas>, params:ParametroDeclarable
  METODOS:  cuota_del_periodo(a:Activo, p:Periodo):Opcion<Cuantía>
  REGLA:     genera la cuota cuando toca (dispara en el CIERRE). UN escritor. Método/coeficiente = dato
             (`[ABIERTO]` F5). No existe operador para el tiempo: la cuota la produce el calendario.
  SUBE:      peticion.asiento_asentar (B2) · peticion.criterio_fijar (K9: método/coeficiente)
  PUBLICA:   cuota_amortizacion_generada { activo, periodo, cuota }
  ESCUCHA:   (lo despierta el cierre C4 / el periodo declarado)
}
CLASE BajaActivo : Reflejo {                              FORMA: REFLEJO  · HOJA: F3   · analítica
  ATRIBUTOS: activo:Activo, vnc:ValorNetoContable
  METODOS:  calcular(activo):Resultado<Perdida|Beneficio>
  REGLA:     retira el bien y calcula el resultado (pérdida/beneficio) y lo imputa. Determinista.
             El asiento de baja lo escribe B2 (esta clase lo DERIVA).
  SUBE:      peticion.derivacion_leer (F4) · peticion.asiento_asentar (B2)
  PUBLICA:   —   (REFLEJO: calcula el resultado; la escritura y su hecho son de B2)
  ESCUCHA:   activo_alta (F1) · cuota_amortizacion_generada (F2)
}
CLASE ValorNetoContable : Reflejo {                       FORMA: REFLEJO  · HOJA: F4   · analítica
  ATRIBUTOS: coste:ParametroDeclarable, amort_acumulada:PlanAmortizacion
  METODOS:  calcular(a:Activo, fecha):Cuantía
  REGLA:     coste − amortización acumulada. Determinista, al balance.
  SUBE:      peticion.derivacion_leer (F2)
  PUBLICA:   —   (REFLEJO: deriva el valor, no escribe)
  ESCUCHA:   cuota_amortizacion_generada (F2)
}
```

### GRUPO G · PERSONAL — nóminas · seguros sociales · `contabilidad-fiscal`

```
CLASE ReciboNomina : Reflejo {                            FORMA: REFLEJO  · HOJA: G1   · fiscal
  ATRIBUTOS: hecho_o_documento:Hecho
  METODOS:  dar_forma(entrada):HechoNomina
  REGLA:     admite y da forma asentable al hecho de nómina (hecho hecho o documento). Mecánico, cero juicio.
             `calculo-nomina` G5 `[ABIERTO]`: ¿el sistema calcula la nómina o sólo recibe el hecho?
  SUBE:      peticion.nomina_lineas_desglosar (G6) · peticion.asiento_personal_construir (G3)
  PUBLICA:   —   (REFLEJO: da forma, no escribe; el asiento lo escribe B2)
  ESCUCHA:   nomina_recibida (G4)
}
CLASE ObligacionSeguridadSocial : Reflejo {               FORMA: REFLEJO  · HOJA: G2   · fiscal
  ATRIBUTOS: nomina:ReciboNomina, tipos:ParametroDeclarable
  METODOS:  calcular(n:ReciboNomina):Obligacion
  REGLA:     gasto de empresa + obligación con la TGSS desde el recibo. Determinista. Tipos = dato
             (`[ABIERTO]` Q51: convenio/tipos de cotización).
  SUBE:      peticion.derivacion_leer (G1) · peticion.plazo_declarar (D6)
  PUBLICA:   —   (REFLEJO: calcula la obligación, no escribe)
  ESCUCHA:   nomina_recibida (G4)
}
CLASE AsientoPersonal : Reflejo {                         FORMA: REFLEJO  · HOJA: G3   · fiscal
  ATRIBUTOS: nomina:ReciboNomina, ss:ObligacionSeguridadSocial
  METODOS:  construir(...):Asiento
  REGLA:     gasto de personal, retención y pago → asiento EQUILIBRADO. Determinista.
             ¿Quién paga el neto: emite orden o sólo observa? `[ABIERTO]` Q53.
  SUBE:      peticion.derivacion_leer (G1/G2) · peticion.asiento_asentar (B2)
  PUBLICA:   —   (REFLEJO: construye el asiento; quien lo escribe y anuncia es B2)
  ESCUCHA:   nomina_recibida (G4)
}
CLASE PuertoNomina : Puente {                             FORMA: PUENTE   · HOJA: G4   · fiscal
  ATRIBUTOS: origen:ParametroDeclarable
  METODOS:  recibir():Flujo<HechoNomina>
  REGLA:     origen declarable del dato de nómina: conecta con el sistema de personal por evento;
             si no existe, se crea.
  SUBE:      peticion.nomina_forma_dar (G1)
  PUBLICA:   nomina_recibida { periodo, origen, traza }
  ESCUCHA:   (la despierta el canal declarable de personal)
}
CLASE LineasNomina : Reflejo {                            FORMA: REFLEJO  · HOJA: G6   · fiscal
  ATRIBUTOS: nomina:ReciboNomina
  METODOS:  desglosar(n):Set<Linea>
  REGLA:     desglose bruto / retención / cotización del trabajador / neto. Hace la nómina EXPLICABLE,
             no un número pelado. Determinista.
  SUBE:      peticion.derivacion_leer (G1)
  PUBLICA:   —   (REFLEJO: desglosa, no escribe)
  ESCUCHA:   nomina_recibida (G4)
}
CLASE AccesoNomina : Custodio {                           FORMA: CUSTODIO · HOJA: G7   · fiscal
  ATRIBUTOS: permisos:Map<Empleado,Alcance>
  METODOS:  autorizar(quien, nomina):bool, declarar(p)
  REGLA:     gobernanza de quién ve qué nómina (dato personal): cada uno ve la suya. UN escritor.
             Aislamiento dentro del negocio (eje persona) — complementa I4 (eje negocio).
  SUBE:      peticion.criterio_fijar (K9) · peticion.decision_solicitar (quién puede ver: Q54)
  PUBLICA:   acceso_nomina_declarado { empleado, alcance }
  ESCUCHA:   (lo declara el negocio)
}
CLASE PagosACuentaEmpleado : Reflejo {                    FORMA: REFLEJO  · HOJA: G8   · fiscal
  ATRIBUTOS: anticipos:Set<Anticipo>
  METODOS:  impacto(n:ReciboNomina):Cuantía
  REGLA:     anticipos/adelantos y su impacto en el neto y el IRPF. Determinista. No todo es sueldo fijo.
  SUBE:      peticion.derivacion_leer (G1)
  PUBLICA:   —   (REFLEJO: calcula el impacto, no escribe)
  ESCUCHA:   nomina_recibida (G4)
}
CLASE ConceptosExtraNomina : Reflejo {                    FORMA: REFLEJO  · HOJA: G9   · fiscal
  ATRIBUTOS: conceptos:Set<Concepto>
  METODOS:  imputar(c:Concepto):Set<Apunte>
  REGLA:     dietas, especie, finiquito, paga extra: cálculo de su imputación. Determinista.
  SUBE:      peticion.derivacion_leer (G1) · peticion.asiento_asentar (B2)
  PUBLICA:   —   (REFLEJO: imputa, no escribe)
  ESCUCHA:   nomina_recibida (G4)
}
CLASE LiquidacionBajaEmpleado : Reflejo {                 FORMA: REFLEJO  · HOJA: G10  · fiscal
  ATRIBUTOS: empleado:Empleado
  METODOS:  liquidar(...):Asiento
  REGLA:     cierre de la cuenta del trabajador (finiquito/indemnización), para que NO quede un
             acreedor abierto. Determinista.
  SUBE:      peticion.asiento_asentar (B2) · peticion.derivacion_leer (N3: auxiliar del tercero-empleado)
  PUBLICA:   —   (REFLEJO: liquida, no escribe)
  ESCUCHA:   nomina_recibida (G4)
}
```

### GRUPO H · EXISTENCIAS — inventario valorado · `contabilidad-analítica`

```
CLASE ValoracionExistencia : Reflejo {                    FORMA: REFLEJO  · HOJA: H1   · analítica
  ATRIBUTOS: stock:InventarioExistente, metodo:ParametroDeclarable
  METODOS:  valorar(item, fecha):Cuantía
  REGLA:     capa de valor SOBRE el inventario existente (no lo duplica). Método = dato (`[ABIERTO]` Q15:
             FIFO/medio). `coste-consumo` H5 `[ABIERTO]`: de dónde sale el coste del consumo.
  SUBE:      peticion.ficha_producto_entrar (H2)
  PUBLICA:   —   (REFLEJO: valora, no escribe)
  ESCUCHA:   (la despierta la variación de stock H4)
}
CLASE FronteraFichaProducto : Conversor {                 FORMA: CONVERSOR · HOJA: H2   · analítica
  ATRIBUTOS: forma:ParametroDeclarable
  METODOS:  entrar(ficha):CosteInterno
  REGLA:     puerto declarable del coste de cada negocio: frontera donde cruza el coste de la ficha al
             dato interno; si falta, se crea. `solape-custodia-contable` H6 `[ABIERTO]`.
  SUBE:      peticion.valoracion_aplicar (H1)
  PUBLICA:   —   (CONVERSOR: frontera de formato del coste)
  ESCUCHA:   (la despierta el canal declarable de la ficha de producto)
}
CLASE AjusteInventario : Reflejo {                        FORMA: REFLEJO  · HOJA: H3   · analítica
  ATRIBUTOS: teorico:Cuantía, real:Cuantía
  METODOS:  diferencia():Asiento
  REGLA:     regulariza merma/rotura con asiento Y aviso. Cálculo de la diferencia. Determinista.
  SUBE:      peticion.asiento_asentar (B2) · peticion.aviso_producir (K2)
  PUBLICA:   —   (REFLEJO: calcula el asiento de regularización; la escritura y su hecho son de B2)
  ESCUCHA:   hecho_recibido (A1, movimiento de stock)
}
CLASE VariacionStockValorada : Reflejo {                  FORMA: REFLEJO  · HOJA: H4   · analítica
  ATRIBUTOS: entradas, salidas:Flujo<MovimientoStock>, valoracion:ValoracionExistencia
  METODOS:  variacion(periodo):Cuantía
  REGLA:     entrada por compra / salida por consumo, VALORADAS. Determinista.
  SUBE:      peticion.derivacion_leer (H1) · peticion.asiento_asentar (B2)
  PUBLICA:   —   (REFLEJO: calcula la variación, no escribe)
  ESCUCHA:   hecho_recibido (A1)
}
```

### GRUPO I · GRUPO — multi-sociedad · consolidación · `contabilidad-analítica`

```
CLASE MarcaSociedad : Reflejo {                           FORMA: REFLEJO  · HOJA: I1   · analítica
  ATRIBUTOS: sociedad:Sociedad
  METODOS:  marcar(a:Asiento):Asiento
  REGLA:     etiqueta cada asiento con su sociedad. Mecánico, cero juicio.
  SUBE:      —   (etiqueta en el camino de escritura; la escritura es de B2)
  PUBLICA:   —   (REFLEJO: etiqueta, no escribe)
  ESCUCHA:   (la invoca el camino de escritura)
}
CLASE EliminacionIntercompany : Reflejo {                 FORMA: REFLEJO  · HOJA: I2   · analítica
  ATRIBUTOS: asientos:Flujo<Asiento>
  METODOS:  eliminar():Set<Partida>
  REGLA:     detecta y elimina el cruce interno en la consolidación. Determinista. La traza de lo
             eliminado queda visible en el consolidado.
  SUBE:      peticion.derivacion_leer (B3) · peticion.consolidacion_estados (I3)
  PUBLICA:   —   (REFLEJO: elimina en el cálculo de consolidación, no escribe)
  ESCUCHA:   asiento_asentado (B2) · ejercicio_cerrado (C4)
}
CLASE Consolidacion : Reflejo {                           FORMA: REFLEJO  · HOJA: I3   · analítica
  ATRIBUTOS: sociedades:Set<Sociedad>, criterio:ParametroDeclarable
  METODOS:  estados(criterio):EstadoDerivado
  REGLA:     estados del conjunto con criterio DECLARADO. Agregación determinista. Grupo COMPLETO
             (multi-sociedad). Criterio `[ABIERTO]` I5/I6/I7. La consolidación es AL CIERRE.
  SUBE:      peticion.derivacion_leer (B3/C1/C2/I2) · peticion.criterio_fijar (K9)
  PUBLICA:   —   (REFLEJO: agrega, no escribe)
  ESCUCHA:   ejercicio_cerrado (C4)
}
CLASE AislamientoNegocio : Custodio {                     FORMA: CUSTODIO · HOJA: I4   · analítica
  ATRIBUTOS: parcelas:Map<Negocio,Parcela>
  METODOS:  parcela(negocio):Parcela, escritor(negocio):Id
  REGLA:     multi-negocio sin fuga. UN dueño por parcela. Los negocios NO se fugan.
             (Espejo de G7: eje negocio ↔ eje persona.)
  SUBE:      peticion.parcela_reclamar (M2)
  PUBLICA:   negocio_parcela_creada { negocio, parcela }
  ESCUCHA:   negocio_registrado (K1)
}
```

### GRUPO J · ANALÍTICA / MANDO — centros de coste · márgenes · desviaciones · `contabilidad-analítica`

```
CLASE EtiquetadoAnalitico : MicroAgente {                 FORMA: MICRO-AGENTE · HOJA: J1 · analítica
  ATRIBUTOS: reglas:ParametroDeclarable, dimensiones:Set<Dimension>
  METODOS:  juzgar(h:Hecho):Propuesta<Dimension>
  REGLA:     asigna centro/línea/producto a cada hecho con regla declarable; cuando la regla no cubre,
             clasificar es juicio → lo dudoso va a cola. PROPONE; no escribe. `dimensiones-analiticas`
             J6 `[ABIERTO]`.
  SUBE:      peticion.excepcion_encolar (A8.1) · peticion.criterio_fijar (K9: dimensiones)
  PUBLICA:   —   (MICRO-AGENTE que PROPONE)
  ESCUCHA:   hecho_recibido (A1) · criterio_fijado (K9)
}
CLASE MargenAnalitico : Reflejo {                         FORMA: REFLEJO  · HOJA: J2   · analítica
  ATRIBUTOS: ingresos, costes:Flujo<Cuantía>
  METODOS:  calcular(dimension, periodo):Cuantía
  REGLA:     ingreso − coste imputado por dimensión. Determinista.
  SUBE:      peticion.derivacion_leer (B3/H1/J5)
  PUBLICA:   —   (REFLEJO: deriva el margen, no escribe)
  ESCUCHA:   asiento_asentado (B2) · ejercicio_cerrado (C4)
}
CLASE Presupuesto : Custodio {                            FORMA: CUSTODIO · HOJA: J3   · analítica
  ATRIBUTOS: objetivos:Map<Dimension,Cuantía>
  METODOS:  fijar(d,v), objetivo(d, periodo):Cuantía
  REGLA:     cifra objetivo por dimensión declarable. UN escritor.
  SUBE:      peticion.criterio_fijar (K9)
  PUBLICA:   presupuesto_fijado { dimension, periodo, objetivo }
  ESCUCHA:   (lo declara el jefe)
}
CLASE Desviacion : Reflejo {                              FORMA: REFLEJO  · HOJA: J4   · analítica
  ATRIBUTOS: real, presupuesto:Presupuesto, umbral:Umbral
  METODOS:  calcular(d, periodo):Delta
  REGLA:     real vs presupuesto → dispara aviso SI se sale del umbral declarado. Determinista.
             El umbral (sangría/desviación) lo fija el jefe (`[ABIERTO]` Q61).
  SUBE:      peticion.derivacion_leer (J2/J3) · peticion.aviso_producir (K2, si se sale del umbral)
  PUBLICA:   —   (REFLEJO: calcula la desviación, no escribe; el AVISO es de K2)
  ESCUCHA:   presupuesto_fijado (J3) · asiento_asentado (B2)
}
CLASE CosteIndirecto : Reflejo {                          FORMA: REFLEJO  · HOJA: J5   · analítica
  ATRIBUTOS: reparto:ParametroDeclarable
  METODOS:  repartir(coste, dimensiones):Map<Dimension,Cuantía>
  REGLA:     aplica el reparto DECLARADO de gastos no directos. Determinista. Cubre lo que la pieza
             existente no cubre para grupo. Criterio `[ABIERTO]` J7.
  SUBE:      peticion.derivacion_leer (B3) · peticion.criterio_fijar (K9)
  PUBLICA:   —   (REFLEJO: reparte, no escribe)
  ESCUCHA:   asiento_asentado (B2) · criterio_fijado (K9)
}
CLASE CuadroMandoContable : Reflejo {                     FORMA: REFLEJO  · HOJA: J8   · analítica
  ATRIBUTOS: caja:SaldoTesoreria, resultado:CuentaResultados, margen, desviacion, ejercicio
  METODOS:  componer(periodo):Informe
  REGLA:     agregación de conjunto (caja·resultado·margen·desviación·ejercicio) SIN bajar al asiento.
             Lente del jefe. Determinista.
  SUBE:      peticion.derivacion_leer (E4/C2/J2/J4)
  PUBLICA:   —   (REFLEJO: compone el cuadro, no escribe)
  ESCUCHA:   asiento_asentado (B2) · ejercicio_cerrado (C4)
}
CLASE ComparadorPeriodos : Reflejo {                      FORMA: REFLEJO  · HOJA: J9   · analítica
  ATRIBUTOS: presupuesto:Presupuesto, desviacion:Desviacion
  METODOS:  comparar(a,b):Delta
  REGLA:     ejercicio vs ejercicio, mes vs mes, real vs presupuesto. REUTILIZA J3/J4, no los duplica.
  SUBE:      peticion.derivacion_leer (J3/J4)
  PUBLICA:   —   (REFLEJO: compara, no escribe)
  ESCUCHA:   presupuesto_fijado (J3) · ejercicio_cerrado (C4)
}
CLASE TableroMargenDimension : Reflejo {                  FORMA: REFLEJO  · HOJA: J10  · analítica
  ATRIBUTOS: margen:MargenAnalitico, dimensiones:Set<Dimension>
  METODOS:  cruzar():Tabla
  REGLA:     cruce margen × dimensión bajo lente de conjunto: por centro, familia o sociedad.
  SUBE:      peticion.derivacion_leer (J2/J6)
  PUBLICA:   —   (REFLEJO: cruza, no escribe)
  ESCUCHA:   asiento_asentado (B2) · criterio_fijado (K9)
}
```

### GRUPO K · PRODUCTO-SERVICIO — multi-tenant · avisos · informes · `contabilidad-analítica`

```
CLASE OnboardingNegocio : Custodio {                      FORMA: CUSTODIO · HOJA: K1   · analítica
  ATRIBUTOS: config:Map<Clave,Valor>
  METODOS:  recoger(negocio, datos), leer(clave):Opcion<Valor>
  REGLA:     recoge los datos declarables del negocio nuevo (plan, fuentes, parámetros). UN escritor.
             `modelo-licencia` K8 `[ABIERTO]`: cómo se vende (licencia/uso/paquete).
  SUBE:      peticion.parcela_crear (I4) · peticion.vertical_activar (K4) ·
             peticion.plan_cuentas_declarar (B1)
  PUBLICA:   negocio_registrado { negocio, config }
  ESCUCHA:   (lo despierta el alta de un negocio nuevo)
}
CLASE MotorAvisos : Puente {                              FORMA: PUENTE   · HOJA: K2   · analítica
  ATRIBUTOS: destino:ParametroDeclarable, catalogo:Set<Senal>
  METODOS:  producir(senal):Aviso
  REGLA:     PRODUCE el aviso (requisito 4 del dueño). Conecta por evento. La ENTREGA es R1.
             `catalogo-avisos` K6 `[ABIERTO]`: qué avisos, a quién, por qué canal.
  SUBE:      peticion.aviso_entregar (R1) · peticion.decision_solicitar (canal/catálogo: K6)
  PUBLICA:   aviso_producido { senal, destinatario, motivo }
  ESCUCHA:   revision_solicitada (A8.2) · cuadre_no_cuadra (C6) · plazo_declarado (D6) ·
             presupuesto_fijado (J3) · hecho_recibido (A1)
}
CLASE InformeRico : Reflejo {                             FORMA: REFLEJO  · HOJA: K3   · analítica
  ATRIBUTOS: cifra:Derivado, contexto:ParametroDeclarable
  METODOS:  componer(cifra, contexto):Informe
  REGLA:     COMPONE la cifra ya calculada con el contexto declarado (periodo, origen, comparativas).
             Mecánico. La NARRACIÓN fuzzy vive en R3; el «qué hacer» en R2.
  SUBE:      peticion.derivacion_leer (la que corresponde al informe)
  PUBLICA:   —   (REFLEJO: compone, no escribe)
  ESCUCHA:   asiento_asentado (B2) · ejercicio_cerrado (C4)
}
CLASE ActivacionVertical : Reflejo {                      FORMA: REFLEJO  · HOJA: K4   · analítica
  ATRIBUTOS: config:OnboardingNegocio
  METODOS:  activar(vertical):bool
  REGLA:     enciende la vertical por la configuración declarada. Mecánico, cero juicio.
             Si contabilidad no está activada, la vertical productora funciona igual.
  SUBE:      peticion.derivacion_leer (K1)
  PUBLICA:   —   (REFLEJO: enciende por config, no escribe)
  ESCUCHA:   negocio_registrado (K1)
}
CLASE ColaDeclaracionesCriterio : Custodio {              FORMA: CUSTODIO · HOJA: K9   · analítica
  ATRIBUTOS: criterios:Map<Clave,ParametroDeclarable>
  METODOS:  fijar(clave, valor), ratificar(clave):ParametroDeclarable
  REGLA:     UNA sola cola donde el jefe fija/ratifica TODOS los criterios. UN escritor.
             Cierra declarativamente B1/B7·C7·E6·F5·J6·D11·I5 — un único punto de declaración.
  SUBE:      peticion.decision_solicitar (quién declara y en qué orden: `[ABIERTO]` Q25)
  PUBLICA:   criterio_fijado { clave, valor }
  ESCUCHA:   (lo despierta el jefe / el asesor)
}
```

### GRUPO L · REVISIÓN-ASESOR — exportación · diálogo · ajuste · firma (medida maestra) · `contabilidad-libro`

```
CLASE PuertoExportacion : Conversor {                     FORMA: CONVERSOR · HOJA: L1   · libro
  ATRIBUTOS: formato:ParametroDeclarable
  METODOS:  salir(libro):Externo, entrar(ajustes):Set<Asiento>
  REGLA:     frontera de formatos contables estándar hacia el programa del asesor; si falta, se crea.
             `formato-exportacion` L6 `[ABIERTO]`: qué formato exige su programa.
  SUBE:      peticion.ajuste_entrar (B5)
  PUBLICA:   —   (CONVERSOR: frontera de formato)
  ESCUCHA:   (la despierta el canal declarado del asesor)
}
CLASE VistaRevisable : Reflejo {                          FORMA: REFLEJO  · HOJA: L2   · libro
  ATRIBUTOS: asiento:Asiento, traza:TrazaAsiento
  METODOS:  explicar(a:Asiento):Informe
  REGLA:     muestra cada asiento/cálculo CON su origen: composición determinista de la traza.
             NO caja negra. L2 EXPLICA; el expediente CONSERVA la prueba.
  SUBE:      peticion.derivacion_leer (B4/B3)
  PUBLICA:   —   (REFLEJO: explica, no escribe)
  ESCUCHA:   asiento_asentado (B2)
}
CLASE FlujoFirma : Custodio {                             FORMA: CUSTODIO · HOJA: L3   · libro
  ATRIBUTOS: firmas:Map<Ambito,Firma>
  METODOS:  firmar(asesor, ambito, marca), estado(ambito):MarcaEstado
  REGLA:     parcela de estado revisado/firmado del asesor. UN escritor. **El sistema NO firma**:
             vence → expira y RE-PREGUNTA, jamás asume. Nivel (periodo/estado/documento) `[ABIERTO]` Q28.
  SUBE:      peticion.decision_solicitar (firma: nivel y alcance) · peticion.traza_registrar (B4)
  PUBLICA:   revision_firmada { ambito, asesor, marca }
  ESCUCHA:   (lo despierta el acto de firma del asesor)
}
CLASE ExpedienteDocumental : Custodio {                   FORMA: CUSTODIO · HOJA: L7   · libro
  ATRIBUTOS: referencias:Map<Cifra,Documento>
  METODOS:  archivar(cifra, doc), recuperar(cifra):Documento
  REGLA:     cada cifra con el documento origen ARCHIVADO y ENLAZADO. Registro inmutable, UN escritor.
             L2 EXPLICA; el expediente CONSERVA la prueba para la inspección.
  SUBE:      (ninguna: un archivo inmutable sólo recibe y guarda)
  PUBLICA:   documento_archivado { cifra, documento, traza }
  ESCUCHA:   asiento_asentado (B2) · documento_recibido (A5) · declaracion_justificada (D13)
}
CLASE ControlCalidadMuestreo : Reflejo {                  FORMA: REFLEJO  · HOJA: L8   · libro
  ATRIBUTOS: umbrales:Set<Umbral>, reglas:ReglaContrapartida
  METODOS:  seleccionar(periodo):Set<Asiento>
  REGLA:     selecciona lo que exige ojo humano por señales DURAS (alto importe, sin regla,
             contrapartida nueva, cuadre dudoso). Determinista: excepción + muestra, NO revisar todo.
  SUBE:      peticion.derivacion_leer (B2/A6.2)
  PUBLICA:   —   (REFLEJO: selecciona, no escribe)
  ESCUCHA:   asiento_asentado (B2) · contrapartida_regla_declarada (A6.2)
}
CLASE CambioDesdeUltimaRevision : Reflejo {               FORMA: REFLEJO  · HOJA: L9   · libro
  ATRIBUTOS: firma:FlujoFirma
  METODOS:  delta():Delta
  REGLA:     asientos nuevos, ajustes y reglas cambiadas desde el último visto bueno. Cálculo de diferencia.
  SUBE:      peticion.derivacion_leer (B2/B5/L3)
  PUBLICA:   —   (REFLEJO: calcula el delta, no escribe)
  ESCUCHA:   asiento_asentado (B2) · ajuste_entrado (B5) · revision_firmada (L3)
}
CLASE RatificacionReglaAprendida : Puente {               FORMA: PUENTE   · HOJA: L10  · libro
  ATRIBUTOS: propuestas:Set<ReglaAprendida>
  METODOS:  ratificar(r, decision∈{ratifica,bloquea})
  REGLA:     el asesor ratifica o bloquea la regla ANTES de que actúe sobre el volumen. Gate humano
             ÚNICO para A6.2 y E8 — no tres puertas distintas.
  SUBE:      peticion.decision_solicitar (asesor ratifica/bloquea) · peticion.regla_contrapartida_declarar (A6.2) ·
             peticion.regla_movimiento_declarar (E8)
  PUBLICA:   regla_ratificada { regla, decision, asesor }
  ESCUCHA:   (lo despierta la propuesta de una regla aprendida)
}
```

### GRUPO M · ANTI-BUCLE — los 3 cerrojos transversales · `contabilidad-libro`

```
CLASE FronteraPlanos : Reflejo {                          FORMA: REFLEJO  · HOJA: M1   · libro
  ATRIBUTOS: permitido:PatronDeCalculo
  METODOS:  verificar(salida):bool
  REGLA:     guarda verificable de que SÓLO se emiten cálculos, NUNCA hechos de negocio.
             Un test lo afirma. Contabilidad observa; no realimenta la operación.
  SUBE:      —   (verifica en el camino de salida)
  PUBLICA:   —   (REFLEJO: verifica, no escribe)
  ESCUCHA:   (la invoca el camino de escritura/salida)
}
CLASE SingleWriter : Custodio {                           FORMA: CUSTODIO · HOJA: M2   · libro
  ATRIBUTOS: duenos:Map<Parcela,Id>
  METODOS:  reclamar(parcela, id):bool, es_escritor(parcela, id):bool
  REGLA:     la LEY que gobierna cada custodio: un solo escritor por parcela. Segundo escritor = corrupción.
             Si la silla del trabajador es humana y concurrente, esto se rompe (`[ABIERTO]` Q71).
  SUBE:      —   (concede o rechaza; no pide a nadie)
  PUBLICA:   parcela_reclamada { parcela, escritor }
  ESCUCHA:   (la invoca cada Custodio al escribir)
}
CLASE ClaveNatural : Reflejo {                            FORMA: REFLEJO  · HOJA: M3   · libro
  ATRIBUTOS: composicion:ParametroDeclarable
  METODOS:  calcular(hecho):ClaveNatural, coincide(a,b):bool
  REGLA:     idempotencia determinista: reprocesar NO duplica ("un cierre = un asiento"). Un test lo afirma.
             La composición cuelga de `unidad_de_cierre` (`[ABIERTO]` M4 / B7).
  SUBE:      peticion.criterio_fijar (K9, si falta `unidad_de_cierre`)
  PUBLICA:   —   (REFLEJO: calcula la clave, no escribe)
  ESCUCHA:   anclaje_cierre_declarado (A14)
}
```

### GRUPO N · TERCEROS — maestro fiscal único de clientes y proveedores · `contabilidad-entrada`

```
CLASE MaestroTerceros : Custodio {                        FORMA: CUSTODIO · HOJA: N1   · entrada
  ATRIBUTOS: terceros:Map<ClaveNatural,Tercero>
  METODOS:  ficha(id):Tercero, upsert(t:Tercero)
  REGLA:     ficha única de cliente/proveedor (identificación fiscal, condiciones de pago/cobro,
             historial). **UN solo maestro con roles** (conflicto ① resuelto): un tercero que es
             cliente Y proveedor sigue siendo UNO. UN escritor.
  SUBE:      peticion.tercero_unificar (N2) · peticion.documento_archivar (L7)
  PUBLICA:   tercero_actualizado { nif, roles, traza }
  ESCUCHA:   tercero_unificado (N2)
}
CLASE PadronTerceros : Custodio {                         FORMA: CUSTODIO · HOJA: N2   · entrada
  ATRIBUTOS: identidades:Map<Nif,Tercero>
  METODOS:  unificar(t:Tercero):Tercero
  REGLA:     identidad única por número fiscal: un proveedor escrito de tres formas sigue siendo uno.
             Faceta de identidad del MISMO maestro N1. UN escritor.
  SUBE:      peticion.tercero_actualizar (N1)
  PUBLICA:   tercero_unificado { nif, formas_unificadas }
  ESCUCHA:   (lo despierta la admisión de un tercero nuevo)
}
CLASE CuentaProveedor : Reflejo {                         FORMA: REFLEJO  · HOJA: N3   · entrada
  ATRIBUTOS: diario:EscritorDiario, tercero:Tercero
  METODOS:  saldo(t:Tercero):Cuantía, facturas_vivas(t):Set<Factura>
  REGLA:     mayor auxiliar del tercero (cada factura de compra viva y su saldo), DERIVADO del diario.
  SUBE:      peticion.derivacion_leer (B3)
  PUBLICA:   —   (REFLEJO: deriva el auxiliar, no escribe)
  ESCUCHA:   asiento_asentado (B2) · tercero_actualizado (N1)
}
CLASE EstadoCuentaProveedor : Reflejo {                   FORMA: REFLEJO  · HOJA: N4   · entrada
  ATRIBUTOS: auxiliar:CuentaProveedor
  METODOS:  extracto(t:Tercero, hasta):Informe
  REGLA:     extracto CONFRONTABLE con el proveedor (conciliación de saldos). Derivación determinista.
             ¿Quién confirma el saldo (dueño/asesor)? `[ABIERTO]` Q43.
  SUBE:      peticion.derivacion_leer (N3) · peticion.decision_solicitar (quién confronta: Q43)
  PUBLICA:   —   (REFLEJO: compone el extracto, no escribe)
  ESCUCHA:   asiento_asentado (B2)
}
CLASE CruceFacturaRecepcion : Reflejo {                   FORMA: REFLEJO  · HOJA: N5   · entrada
  ATRIBUTOS: pedido, recepcion, factura
  METODOS:  cotejar():Resultado
  REGLA:     coteja pedido ↔ recepción ↔ factura ANTES de asentar; lo que no cuadra → cola. Determinista.
  SUBE:      peticion.excepcion_encolar (A8.1, si no cuadra) · peticion.asiento_asentar (B2, si cuadra)
  PUBLICA:   —   (REFLEJO: coteja, no escribe)
  ESCUCHA:   hecho_recibido (A1)
}
CLASE VencimientoPago : Reflejo {                         FORMA: REFLEJO  · HOJA: N6   · entrada
  ATRIBUTOS: factura:Factura, politica:PoliticaCobroPago
  METODOS:  calcular(f:Factura):Vencimiento
  REGLA:     fecha de vencimiento por factura desde la política declarada → alimenta E5 y K2.
             Determinista. Un solo tipo `Vencimiento` con dos lados (pago/cobro).
  SUBE:      peticion.derivacion_leer (N1) · peticion.aviso_producir (K2, vencimiento próximo)
  PUBLICA:   —   (REFLEJO: calcula el vencimiento, no escribe)
  ESCUCHA:   asiento_asentado (B2) · criterio_fijado (K9, política de cobro/pago)
}
CLASE RappelProntoPago : Reflejo {                        FORMA: REFLEJO  · HOJA: N7   · entrada
  ATRIBUTOS: compra:Factura, condiciones:ParametroDeclarable
  METODOS:  ajustar(f:Factura):Cuantía
  REGLA:     descuentos/rappels/anticipos que ajustan el coste REAL de la compra a lo realmente pagado.
             Determinista.
  SUBE:      peticion.derivacion_leer (N3) · peticion.asiento_asentar (B2, el ajuste del coste)
  PUBLICA:   —   (REFLEJO: ajusta el coste, no escribe)
  ESCUCHA:   asiento_asentado (B2)
}
CLASE AntiguedadSaldos : Reflejo {                        FORMA: REFLEJO  · HOJA: N8   · entrada
  ATRIBUTOS: vencimientos:Set<Vencimiento>
  METODOS:  clasificar():Tabla
  REGLA:     lo pendiente clasificado por vencimiento — quién y cuánto está vencido. Espejo de N6 del
             lado del cobro; alimenta reclamación y E6. Determinista.
  SUBE:      peticion.derivacion_leer (N6) · peticion.aviso_producir (K2, vencido)
  PUBLICA:   —   (REFLEJO: clasifica, no escribe)
  ESCUCHA:   asiento_asentado (B2)
}
```

### GRUPO O · FACTURACIÓN EMITIDA (venta) · `contabilidad-entrada`

```
CLASE EmisionFacturaVenta : Custodio {                    FORMA: CUSTODIO · HOJA: O1   · entrada
  ATRIBUTOS: serie:Serie, secuencia, emisor:PerfilFiscal
  METODOS:  emitir(datos):FacturaEmitida
  REGLA:     cara emitida con serie/numeración. Gobierna la secuencia: **número duplicado = corrupción**
             → UN escritor. El desglose de impuestos se COMPONE (reflejo). ≠ D8 (registro interno) y
             ≠ D9 (formato estructurado). **Contabilidad SÍ emite su factura (decisión del dueño)**:
             es SU documento; no un hecho de negocio observado. `[ABIERTO]` Q36/Q37/Q38 (pagador, series, ticket).
  SUBE:      peticion.factura_encadenar (D8) · peticion.factura_formato (D9) ·
             peticion.asiento_asentar (B2) · peticion.tercero_actualizar (N1) · peticion.documento_archivar (L7)
  PUBLICA:   factura_emitida { serie, numero, tercero, importes, traza }
  ESCUCHA:   (lo despierta la venta observada / la orden de emisión)
}
CLASE FacturaRectificativa : Reflejo {                    FORMA: REFLEJO  · HOJA: O2   · entrada
  ATRIBUTOS: original:FacturaEmitida, motivo:ParametroDeclarable
  METODOS:  calcular(original, motivo):FacturaEmitida
  REGLA:     corrección comercial POSTERIOR a la emisión (abono/devolución/descuento) que NO borra nada.
             ≠ ajuste interno B5. Determinista. Puede provocar B5 y, si ya se declaró, D14 — TRES actos.
  SUBE:      peticion.factura_emitir (O1) · peticion.asiento_asentar (B2)
  PUBLICA:   —   (REFLEJO: calcula la rectificativa; quien la EMITE y anuncia es O1)
  ESCUCHA:   factura_emitida (O1)
}
```

### GRUPO P · CONTROL DEL PROCESO (entrada) · `contabilidad-entrada`

```
CLASE PanelProcesoContable : Reflejo {                    FORMA: REFLEJO  · HOJA: P1   · entrada
  ATRIBUTOS: cola:EncoladoExcepcion, historial:HistorialProcesoContable
  METODOS:  latido():Panel
  REGLA:     qué entra, qué se procesa, qué está en cola, qué falla. Agregación determinista.
             El "display de cocina" de la contabilidad.
  SUBE:      peticion.derivacion_leer (A8.1/P2/P4)
  PUBLICA:   —   (REFLEJO: muestra el latido, no escribe)
  ESCUCHA:   hecho_recibido (A1) · excepcion_encolada (A8.1) · excepcion_desatascada (P3)
}
CLASE HistorialProcesoContable : Custodio {               FORMA: CUSTODIO · HOJA: P2   · entrada
  ATRIBUTOS: eventos:List<Registro>
  METODOS:  anotar(r:Registro)
  REGLA:     registro append-only de lo procesado y lo fallado con su rastro. UN escritor.
             ≠ `traza-asiento` B4 (que es del ASIENTO, no del PROCESO de entrada).
  SUBE:      (ninguna: un append-only sólo recibe y anota)
  PUBLICA:   proceso_anotado { etapa, resultado, traza }
  ESCUCHA:   hecho_recibido (A1) · excepcion_encolada (A8.1) · excepcion_desatascada (P3) ·
             asiento_asentado (B2)
}
CLASE DesatascoEntrada : MicroAgente {                    FORMA: MICRO-AGENTE · HOJA: P3 · entrada
  ATRIBUTOS: cola:EncoladoExcepcion
  METODOS:  juzgar(e:Excepcion):Decision<resolver|reencolar|descartar>
  REGLA:     resolver/reencolar/descartar una excepción CON motivo. Decidir la resolución
             (contrapartida, importe) es juicio. Es la ACCIÓN que completa A8 (que sólo encola).
             Si la silla la ocupa un humano, esto pasa a CAPTURA de su decisión (`[ABIERTO]` Q66).
  SUBE:      peticion.asiento_asentar (B2) · peticion.excepcion_encolar (A8.1, si reencola) ·
             peticion.regla_contrapartida_declarar (A6.2, la regla aprendida) · peticion.historial_anotar (P2)
  PUBLICA:   excepcion_desatascada { excepcion, decision, motivo }   ← el ÚNICO MicroAgente que publica
  ESCUCHA:   excepcion_encolada (A8.1)
}
CLASE TasaCoberturaEntrada : Reflejo {                    FORMA: REFLEJO  · HOJA: P4   · entrada
  ATRIBUTOS: cobertura:Cobertura
  METODOS:  calcular():Ratio
  REGLA:     proporción de hechos que entran SIN intervención vs caen a cola. LEE la métrica única.
             La métrica que PRUEBA la promesa "sin una persona digitando".
  SUBE:      peticion.derivacion_leer (A12)
  PUBLICA:   —   (REFLEJO: calcula el ratio, no escribe)
  ESCUCHA:   hecho_recibido (A1) · excepcion_encolada (A8.1)
}
```

### GRUPO Q · CONSULTA DEL DUEÑO (puerta *pull*) · `contabilidad-analítica`

```
CLASE ConsultaCuentasBajoDemanda : Puente {               FORMA: PUENTE   · HOJA: Q1   · analítica
  ATRIBUTOS: fuente:ParametroDeclarable
  METODOS:  preguntar(q:Consulta):Respuesta
  REGLA:     puerta *pull*: conecta la pregunta del dueño con el cálculo por petición. NO impone cadencia
             (≠ cuadro del jefe J8, que sí la impone). Canal y forma `[ABIERTO]` Q22.
  SUBE:      peticion.lenguaje_a_consulta (Q2) · peticion.derivacion_leer (B3/E4/C2) ·
             peticion.marca_cobertura_sellar (Q3) · peticion.marca_estado_sellar (Q4)
  PUBLICA:   —   (PUENTE que sólo PREGUNTA: conectar aquí es una consulta, no una escritura)
  ESCUCHA:   asiento_asentado (B2) · ejercicio_cerrado (C4)
}
CLASE PuenteLenguajeDueno : MicroAgente {                 FORMA: MICRO-AGENTE · HOJA: Q2 · analítica
  ATRIBUTOS: mapa_lenguaje:ParametroDeclarable
  METODOS:  a_consulta(pregunta:Lenguaje):Consulta
            a_cifra(d:Derivado):Lenguaje
  REGLA:     traductor BIDIRECCIONAL: su pregunta → consulta contable; cálculo → cifra en su idioma
             (caja, deuda, resultado, "¿puedo pagar X?"). Lenguaje → juicio.
  SUBE:      peticion.derivacion_leer (Q1) · peticion.decision_solicitar (umbrales: Q24)
  PUBLICA:   —   (MICRO-AGENTE que TRADUCE: una traducción es pregunta, no hecho)
  ESCUCHA:   asiento_asentado (B2)
}
CLASE SelloCobertura : Reflejo {                          FORMA: REFLEJO  · HOJA: Q3   · analítica
  ATRIBUTOS: cobertura:Cobertura
  METODOS:  sellar(respuesta):Respuesta
  REGLA:     marca de completitud de lo consultado, FUERA de ciclo: si falta cobertura lo dice ANTES
             de que decida. LEE la métrica única. ≠ `aviso-cuadre` C6 (sólo avisa al cierre).
  SUBE:      peticion.derivacion_leer (A12)
  PUBLICA:   —   (REFLEJO: sella, no escribe)
  ESCUCHA:   hecho_recibido (A1)
}
CLASE MarcaBorradorValidado : Reflejo {                   FORMA: REFLEJO  · HOJA: Q4   · analítica
  ATRIBUTOS: traza:TrazaAsiento, firma:FlujoFirma
  METODOS:  estado(dato):MarcaEstado
  REGLA:     sello del punto en que está lo que ve (en curso / revisado / firmado), para no decidir
             sobre un borrador vivo como si fuera definitivo. Deriva el estado de la traza y la firma.
  SUBE:      peticion.derivacion_leer (B4/L3)
  PUBLICA:   —   (REFLEJO: deriva el estado, no escribe)
  ESCUCHA:   traza_registrada (B4) · revision_firmada (L3)
}
```

### GRUPO R · ENTREGA AL NEGOCIO (rol cliente) · `contabilidad-analítica`

```
CLASE AvisoAlNegocio : Puente {                           FORMA: PUENTE   · HOJA: R1   · analítica
  ATRIBUTOS: canal:ParametroDeclarable
  METODOS:  entregar(a:Aviso):Confirmacion
  REGLA:     el aviso ENTREGADO y CONFIRMADO al negocio cliente. Cara de entrega: COMPLETA
             `motor-avisos` K2, que sólo PRODUCE. `frontera-entrega` K7 `[ABIERTO]`: qué entra.
  SUBE:      peticion.informe_accionable_componer (R2) · peticion.estados_narrar (R3) ·
             peticion.decision_solicitar (el cliente ¿elige avisos? Q64)
  PUBLICA:   aviso_entregado { aviso, canal, confirmacion }
  ESCUCHA:   aviso_producido (K2)
}
CLASE InformeAccionable : MicroAgente {                   FORMA: MICRO-AGENTE · HOJA: R2 · analítica
  ATRIBUTOS: informe:Informe
  METODOS:  juzgar(i:Informe):Recomendacion
  REGLA:     todo informe que recibe el cliente lleva QUÉ HACER con él. La recomendación es juicio.
             Refuerza K3 y lo quita de adorno.
  SUBE:      peticion.derivacion_leer (K3)
  PUBLICA:   —   (MICRO-AGENTE que RECOMIENDA: una recomendación es propuesta, no hecho)
  ESCUCHA:   aviso_producido (K2) · asiento_asentado (B2)
}
CLASE NarradorEstados : MicroAgente {                     FORMA: MICRO-AGENTE · HOJA: R3 · analítica
  ATRIBUTOS: balance:EstadoDerivado, resultado:EstadoDerivado
  METODOS:  narrar(estados):Lenguaje
  REGLA:     traduce balance/resultado al LENGUAJE del negocio cliente ("esto es lo que te ha pasado
             y lo que viene"). Lenguaje → juicio.
  SUBE:      peticion.derivacion_leer (C1/C2)
  PUBLICA:   —   (MICRO-AGENTE que NARRA: una narración es traducción, no hecho)
  ESCUCHA:   ejercicio_cerrado (C4)
}
```

**Recuento verificado: 118 clases de dominio.** Grupo A 18 · B 6 · C 6 · D 13 · E 10 · F 4 · G 9 ·
H 4 · I 4 · J 8 · K 5 · L 7 · M 3 · N 8 · O 2 · P 4 · Q 4 · R 3 = **118**.

---

## Puertos abiertos (el entorno externo — cableado en el sitio, no aquí)

> Ningún acoplamiento tecnológico. Cada puerto declara **qué** cruza y **quién** lo aporta en el sitio.
> Los puertos se materializan como `Conversor` (frontera de formato) o `Puente` (canal con el vecino).

| # | Puerto | Clase que lo expone | Qué cruza | Quién lo aporta |
|---|---|---|---|---|
| 1 | **Hechos de las verticales** | `PuertoEventoVertical` A1 + `ContratoHechoMinimo` A11 | hechos ya emitidos por cada negocio | la fuente (contabilidad se adapta) |
| 2 | **Documentos** | `PuertoDocumento` A4.2 + `CapturaDocumento` A3 | facturas compra/venta, recibos | sitio: forma declarable por negocio |
| 3 | **Recepción digital de documentos** | `PuertoDocumentoDigital` A5 | documentos digitales | canal declarable; si no existe, se crea |
| 4 | **Extractos bancarios** | `PuertoExtracto` E2 | movimientos bancarios | un adaptador por banco |
| 5 | **Cuentas bancarias y su moneda** | `MaestroCuentasBancarias` E11 | catálogo declarable | el negocio |
| 6 | **Plan contable** | `PuertoPlanContable` B6 + `CatalogoCuentas` B1 | codificación import/export | el asesor / el negocio |
| 7 | **Modelos fiscales (salida)** | `GeneradorModelo` D7 | modelo hacia el programa del asesor | formato ABIERTO (no declarado) |
| 8 | **Acuse / justificante de presentación** | `AcusePresentacion` D13 | retorno de la administración | la administración |
| 9 | **Maestro de terceros** | `MaestroTerceros` N1 + `PadronTerceros` N2 | identidad fiscal (clientes/proveedores) | el negocio |
| 10 | **Facturación emitida** | `EmisionFacturaVenta` O1 | documento que ve el cliente | el negocio (serie, datos fiscales, desglose) |
| 11 | **Proceso de la entrada (cara de control)** | `PanelProcesoContable` P1 | latido observable | canal declarable |
| 12 | **Consulta del dueño (pull)** | `ConsultaCuentasBajoDemanda` Q1 | pregunta/respuesta | canal declarable (forma no declarada) |
| 13 | **Entrega al negocio (avisos/informes)** | `AvisoAlNegocio` R1 + `MotorAvisos` K2 | aviso/informe entregado | canal declarable |
| 14 | **Declaración de criterios** | `ColaDeclaracionesCriterio` K9 | criterios del jefe | el jefe (una sola cola) |
| 15 | **Ficha de producto / coste** | `FronteraFichaProducto` H2 | coste de cada negocio | el negocio; si falta, se crea |
| 16 | **Origen de nómina** | `PuertoNomina` G4 | datos de nómina | sistema de personal; si no existe, se crea |
| 17 | **Firma del asesor** | `FlujoFirma` L3 | marca revisado/firmado | el asesor (el sistema no firma) |
| 18 | **Decisión humana (dueño/asesor)** | `SolicitudDecision` (tipo) | decisiones declaradas | dueño / asesor |
| 19 | **Cruce pedido↔recepción** | `CruceFacturaRecepcion` N5 | pedidos y albaranes | el negocio (si no existe, se asume directo `[ABIERTO]`) |
| 20 | **Proveedor (confrontación de saldo)** | `EstadoCuentaProveedor` N4 | extracto confrontable | proveedor / dueño / asesor (`[ABIERTO]` Q43) |
| 21 | **Formato estructurado de la factura** | `FacturaElectronica` D9 | factura e-formato | canal declarable; si falta, se crea |
| 22 | **Verifactu (registro encadenado)** | `RegistroVerifactu` D8 | huella/cadena inalterable | exigencia de la administración |
| 23 | **Ratificación de reglas** | `RatificacionReglaAprendida` L10 | ratifica/bloquea una regla | el asesor (gate humano único) |
| 24 | **Registro del proceso** | `HistorialProcesoContable` P2 | lo procesado/fallado | canal declarable (append-only) |

**24 puertos abiertos.** Cada uno es una frontera declarada: **ninguno nombra transporte, protocolo
ni motor.** Donde el dato no está declarado, el puerto queda `[ABIERTO]` y **se crea la pieza que falte**.

---

## Flujos del negocio (los 7)

```
FLUJO 1 · HECHO → ASIENTO → LIBRO (el camino continuo, sin operador)
  [FUENTE] ─Puerto A1→ HechoCrudo ─A2→ Hecho ─A7 dedup→ A12 cobertura
      ├─ ContrapartidaAsistida A6.1 (propone) ─→ ReglaContrapartida A6.2 (fija) ─→ Asiento
      └─ dudoso → EncoladoExcepcion A8.1 → AvisoRevision A8.2 (el flujo NO se bloquea)
  Asiento ─B2 escritor-diario→ Libro ─B4 traza→ ─B3 mayor/balanza
  HECHOS:  hecho_recibido → excepcion_encolada / revision_solicitada → asiento_asentado → traza_registrada

FLUJO 2 · DOCUMENTO → DATO → ASIENTO (la entrada dura)
  [Doc externo] ─A4.2 puerto-documento→ CapturaDocumento A3
      → ExtraccionDato A4.1 (interpreta lo ilegible) → ControlCuadreDocumento A4.3
      → si descuadra → Cola A8.1 (NO se asienta mal); si cuadra → FLUJO 1
  HECHOS:  documento_recibido → excepcion_encolada (o asiento_asentado)

FLUJO 3 · CIERRE (dos niveles) → ESTADOS → FISCAL
  [jornada] cierra la CAJA (operación) · [mes] cierra la CONTABILIDAD (CierreEjercicio C4) → Apertura C5
      → Balance C1 · Resultados C2 → LiquidacionIva D1 → Modelo D2/D3 → GeneradorModelo D7 → Acuse D13
      Si falta cobertura → AvisoCuadre C6 (no finge el cuadre)
  HECHOS:  cuota_amortizacion_generada (F2) → asiento_asentado → ejercicio_cerrado → balance derivado →
           modelo_exportado (D7) → obligacion_avanzada (D12) → declaracion_justificada (D13)

FLUJO 4 · TESORERÍA (observa el dinero)
  [Extracto] ─E2→ ConciliacionBancaria E1 ─→ CuadreCobroPago E3
      ├─ no identificado → PartidaNoIdentificada E7 (juicio) → ReglaMovimientoBancario E8 (fija)
      └─ desfase → PartidaConciliatoria E9 → InformeConciliacion E10
  SaldoTesoreria E4 → PrevisionCaja E5 → MotorAvisos K2
  HECHOS:  movimiento_regla_declarada (E8) · cuenta_bancaria_declarada (E11) · asiento_asentado

FLUJO 5 · REVISIÓN → FIRMA → EXPORTACIÓN (la medida maestra)
  Libro → VistaRevisable L2 → ControlCalidadMuestreo L8 (excepción + muestra)
      → CambioDesdeUltimaRevision L9 → RatificacionReglaAprendida L10 → AsientoAjuste B5
      → PuertoExportacion L1 → [asesor revisa y FIRMA] → FlujoFirma L3 → ExpedienteDocumental L7
  HECHOS:  regla_ratificada (L10) → ajuste_entrado (B5) → revision_firmada (L3) → documento_archivado (L7)

FLUJO 6 · AVISO → ENTREGA (proactiva, requisito 4)
  señales (A8.2 · C6 · D6 · E5 · J4) → MotorAvisos K2 (PRODUCE) → AvisoAlNegocio R1 (ENTREGA+CONFIRMA)
      → InformeAccionable R2 (qué hacer) · NarradorEstados R3 (lenguaje del negocio)
  HECHOS:  aviso_producido (K2) → aviso_entregado (R1)

FLUJO 7 · CORRECCIÓN (cuatro planos, NO se confunden — conflicto ③)
  interno → AsientoAjuste B5  ·  del hecho → HechoRectificativo A13
  comercial → FacturaRectificativa O2  ·  fiscal → RectificacionDeclaracion D14
      mapa canónico: O2 puede provocar B5 y, si ya se declaró, D14 — TRES actos, no uno.
  HECHOS:  hecho_rectificado (A13) · factura_emitida + asiento_asentado · declaracion_rectificada (D14)
```

**7 flujos del negocio.**

---

## Decisión humana — `SolicitudDecision`

El sistema **NO firma y NO decide**. Cuando falta un dato, una regla es nueva, un documento no
cuadra o una obligación vence, emite una `SolicitudDecision` (`peticion.decision_solicitar`) y **espera**.
Si **vence**, expira y **re-pregunta** — **jamás asume**.

| # | Punto de decisión | Se pide a | Qué decide | Clase que la emite |
|---|---|---|---|---|
| 1 | Documento ilegible / no cuadra | asesor · dueño · trabajador (`[ABIERTO]` A8.3) | resolver / reencolar / descartar | `EncoladoExcepcion` A8.1 · `AvisoRevision` A8.2 |
| 2 | Hecho incompleto | dueño (`[ABIERTO]` A6.3) | asienta provisional / espera / avisa | `ContrapartidaAsistida` A6.1 |
| 3 | Regla aprendida nueva | asesor | ratifica / bloquea **antes** de actuar sobre el volumen | `RatificacionReglaAprendida` L10 |
| 4 | Firma de la revisión | asesor | revisar / firmar (nivel: periodo/estado/documento — `[ABIERTO]` Q28) | `FlujoFirma` L3 |
| 5 | Rectificación de una declaración | administración (vía asesor) | complementaria / sustitutiva | `RectificacionDeclaracion` D14 |
| 6 | Ajuste contable | asesor | sumar corrección (NUNCA borrar) | `AsientoAjuste` B5 |
| 7 | Declaración de criterios | jefe | fijar/ratificar TODOS los criterios | `ColaDeclaracionesCriterio` K9 |
| 8 | Criterios que cierran `[ABIERTO]` | jefe · asesor | `unidad_de_cierre` · período · amortización · reparto · dimensiones · tipos · consolidación | `ColaDeclaracionesCriterio` K9 (+B7·C7·E6·F5·J6·D11·I5) |
| 9 | Desatasco de la entrada | trabajador/automatización (`[ABIERTO]` Q66) | resolver/reencolar/descartar con motivo | `DesatascoEntrada` P3 |
| 10 | Confrontación de saldo con proveedor | dueño/asesor (`[ABIERTO]` Q43) | confirmar saldo | `EstadoCuentaProveedor` N4 |
| 11 | Aviso de cuadre que falla | dueño/asesor (`[ABIERTO]` Q70) | quién actúa | `AvisoCuadre` C6 |
| 12 | Emisión vs observación de factura | dueño (`[ABIERTO]` Q72, conflicto ④) | ¿el sistema emite o sólo observa? (**el dueño ya dijo: SÍ emite**) | `EmisionFacturaVenta` O1 |
| 13 | Umbrales de decisión del dueño | dueño (`[ABIERTO]` Q24) | caja mínima, deuda máxima | `Umbral` (tipo) + `PuenteLenguajeDueno` Q2 |
| 14 | Silla del cliente | dueño (conflicto ⑤ `[ABIERTO]`) | ¿negocio o dueño? ¿una silla o tres? | Q1/R1/J8 |
| 15 | Multi-moneda (activa `diferencia-cambio`) | dueño (`[ABIERTO]` Q20) | ¿hay multi-moneda y a qué tipo? | `MaestroCuentasBancarias` E11 |
| 16 | Quién declara/ratifica criterios y en qué orden | jefe · asesor (`[ABIERTO]` Q25) | jefe / asesor / ambos y orden | `ColaDeclaracionesCriterio` K9 |

**16 puntos de decisión humana.** Todos son **solicitud**, no decisión: el sistema pregunta, no resuelve.

---

## Contratos / eventos

> **Contrato = qué PIDE cada clase (`SUBE`) y qué HECHO ANUNCIA (`PUBLICA`).** Sin transporte: un
> contrato declara datos y hechos, no un canal. Se cumplen por **puerto abierto**, nunca por acoplamiento.

### Contratos por forma (qué pide, qué anuncia, qué garantiza)

| Forma | Necesita (`SUBE`) | Anuncia (`PUBLICA`) | Garantía |
|---|---|---|---|
| `Reflejo` | sólo datos ya almacenados (una lectura de derivación) | **— (nada)** | determinista — un test lo afirma |
| `MicroAgente` | una entrada ambigua + contexto declarado | **— (nada)** … salvo `P3` que **actúa** y anuncia el desatasco | **propone**, nunca escribe |
| `Custodio` | ningún permiso de otro para escribir | **el hecho de su parcela** | rechaza segundo escritor |
| `Conversor` | un `Externo` + forma declarada | **— (nada)** (cruza formato) | frontera única; reversible si se declara |
| `Puente` | un canal declarado | **el hecho de su envío/enlace** | no impone; no pisa lo manual |

### La cadena de hechos (quién anuncia qué y quién escucha)

| Hecho anunciado | Lo anuncia | Lo ESCUCHAN (principales) |
|---|---|---|
| `hecho_recibido` | A1 | A2 · A7 · A12 · A6.1 · A13 · A15 · B2 · H3 · H4 · N5 · J1 · K2 · P1 · P2 · P4 · Q3 |
| `documento_recibido` | A5 | A2 · A3 · L7 |
| `excepcion_encolada` | A8.1 | A8.2 · P1 · P2 · P3 · P4 |
| `revision_solicitada` | A8.2 | K2 |
| `contrapartida_regla_declarada` | A6.2 | L8 |
| `contrato_hecho_declarado` | A11 | A1 (lectura del mínimo exigible) |
| `anclaje_cierre_declarado` | A14 | M3 |
| `fuente_faltante_declarada` | A15 | K2 |
| `hecho_rectificado` | A13 | B2 |
| `plan_cuentas_declarado` | B1 | A6.1 |
| **`asiento_asentado`** | **B2** | B3 · B4 · C1 · C2 · D1 · D2 · D4 · E1 · E3 · E4 · L2 · L7 · L8 · L9 · M3 · N3 · N4 · N6 · N7 · N8 · P2 · Q1 · R2 |
| `traza_registrada` | B4 | Q4 |
| `ajuste_entrado` | B5 | B2 · B4 · L9 |
| `ejercicio_cerrado` | C4 | B2 · C1 · C2 · D3 · D5 · I2 · I3 · J2 · J8 · J9 · J10 · K3 · Q1 · R3 |
| `cuadre_no_cuadra` | C6 | K2 |
| `plazo_declarado` | D6 | K2 |
| `modelo_exportado` | D7 | D12 |
| `factura_encadenada` | D8 | (exigencia de la administración) |
| `obligacion_avanzada` | D12 | D13 · D14 |
| `declaracion_justificada` | D13 | D12 · L7 |
| `declaracion_rectificada` | D14 | D12 |
| `perfil_administrativo_declarado` | D15 | D6 |
| `movimiento_regla_declarada` | E8 | E1 · E7 |
| `cuenta_bancaria_declarada` | E11 | E4 |
| `activo_alta` | F1 | F3 |
| `cuota_amortizacion_generada` | F2 | F3 · F4 |
| `nomina_recibida` | G4 | G1 · G2 · G3 · G6 · G8 · G9 · G10 |
| `acceso_nomina_declarado` | G7 | G1 |
| `negocio_parcela_creada` | I4 | K1 |
| `presupuesto_fijado` | J3 | J4 · J9 |
| `negocio_registrado` | K1 | I4 · K4 |
| `aviso_producido` | K2 | R1 · R2 |
| `criterio_fijado` | K9 | A14 · E5 · J1 · J5 · J10 · N6 |
| `revision_firmada` | L3 | L9 · Q4 |
| `documento_archivado` | L7 | (la inspección lo recupera) |
| `regla_ratificada` | L10 | A6.2 · E8 |
| `parcela_reclamada` | M2 | (la ley gobierna cada Custodio) |
| `tercero_actualizado` | N1 | A6.1 · N3 |
| `tercero_unificado` | N2 | N1 |
| **`factura_emitida`** | **O1** | D8 · O2 |
| `proceso_anotado` | P2 | P1 |
| `excepcion_desatascada` | P3 | A6.2 · P1 · P2 |
| `aviso_entregado` | R1 | (el negocio queda avisado) |

> **Cómo se cumplen los contratos clave.** `EscritorDiario` B2 recibe `peticion.asiento_asentar`
> y **anuncia `asiento_asentado`**; rechaza si Σ debe ≠ Σ haber. `CompletitudCobertura` A12 recibe
> `esperados`+`llegados` y **produce la métrica única**; Q3/C6/P4 la **LEEN** (conflicto ② resuelto).
> `MaestroTerceros` N1 + `PadronTerceros` N2 comparten el tipo `Tercero{roles}` — **un solo maestro
> con roles** (conflicto ① resuelto). `FlujoFirma` L3 anuncia `revision_firmada`; **el sistema nunca
> firma**; sin firma viva el estado **expira** y se re-pregunta.

---

## Invariantes / determinismo (las 15)

| # | Invariante | Dónde vive en el diseño |
|---|---|---|
| 1 | **La partida doble cuadra**: Σ debe = Σ haber; un descuadre es **ERROR**, no estado | `EscritorDiario` B2 (rechaza) · `BalanceSituacion` C1 |
| 2 | **Un hecho = un asiento** (idempotencia por clave natural) | `DeduplicacionHecho` A7 · `ClaveNatural` M3 |
| 3 | **El asiento original no se borra; la corrección SUMA** (append-only) | `AsientoAjuste` B5 · `TrazaAsiento` B4 · `CierreEjercicio` C4 |
| 4 | **Un solo escritor por parcela** (segundo escritor = corrupción) | `SingleWriter` M2 · todos los `Custodio` |
| 5 | **La ley entra como DATO**: tipos, plazos, coeficientes, calendario y formatos son `ParametroDeclarable` | `CalendarioFiscal` D6 · `PerfilAdministrativo` D15 · `PlanAmortizacion` F2 · `ValoracionExistencia` H1 · `CosteIndirecto` J5 |
| 6 | **El sistema NO firma y NO decide**: la firma es del asesor; vence → expira y re-pregunta | `FlujoFirma` L3 · `SolicitudDecision` · las 16 decisiones humanas |
| 7 | **Dato ausente = desconocido / `[ABIERTO]`**: nada se estima | 23 hojas `[ABIERTO]` · 72 preguntas · `SolicitudDecision` |
| 8 | **Una sola métrica de cobertura** (las demás la LEEN) | `CompletitudCobertura` A12 → A12/Q3/C6/P4 |
| 9 | **Los negocios no se fugan** (aislamiento) | `AislamientoNegocio` I4 · `AccesoNomina` G7 |
| 10 | **Los registros inmutables solo crecen** | `TrazaAsiento` B4 · `RegistroVerifactu` D8 · `ExpedienteDocumental` L7 · `HistorialProcesoContable` P2 |
| 11 | **Frontera única de formatos** | los 7 `Conversor`: A2 · A4.2 · B6 · D9 · E2 · H2 · L1 |
| 12 | **El cierre es irreversible salvo ajuste** | `CierreEjercicio` C4 (`reabrir(solo_con:AsientoAjuste)`) |
| 13 | **El mínimo se declara, no se estima** | `ContratoHechoMinimo` A11 · `ColaDeclaracionesCriterio` K9 |
| 14 | **Contabilidad observa los hechos y produce SUS documentos**; no produce los hechos que observa | `FronteraPlanos` M1 · `EmisionFacturaVenta` O1 (documento propio) |
| 15 | **El que ESCRIBE anuncia el hecho; el que CALCULA no anuncia** (regla de oro) | 43 clases publican · 75 sólo preguntan/escuchan |

**15 invariantes, todas con clase que las sostiene.**

---

## Reparto 32/32/22/32 (la partición decidida — declarada, no reabierta)

| Vertical | Hojas | Clases (grupos) | Concentración de forma |
|---|---|---|---|
| **`contabilidad-entrada`** | **32** | A entrada-hechos (18) · N terceros (8) · O facturación emitida (2) · P control-proceso (4) | **El eslabón limitante.** Los 3 MICRO-AGENTE de la entrada (A4.1·A6.1·P3) + 5 Conversor/Puente de frontera |
| **`contabilidad-libro`** | **32** | B libro-núcleo (6) · C estados-cierre (6) · E tesorería (10) · L revisión-asesor (7) · M anti-bucle (3) | Todo el cálculo derivado + los 3 cerrojos. Concentra `Custodio` del libro y de la tesorería |
| **`contabilidad-fiscal`** | **22** | D capa-fiscal (13) · G personal (9) | **Fiscal COMPLETO** (sin recorte) + nómina. Vendible como añadido. Predominio `Reflejo` |
| **`contabilidad-analítica`** | **32** | F inmovilizado (4) · H existencias (4) · I grupo (4) · J analítica/mando (8) · K producto-servicio (5) · Q consulta-dueño (4) · R entrega-negocio (3) | Las caras de actor + **grupo COMPLETO** (multi-sociedad). Concentra los `MicroAgente` de lenguaje |

**Verificación del reparto:** 32 + 32 + 22 + 32 = **118** = el total de hojas atómicas.
`entrada` contiene el eslabón limitante (grupo A) → **primera oleada**.
`fiscal` se vende como añadido; el núcleo se vende sin él. **Un solo proceso, cuatro oleadas.**

---

## Preguntas abiertas `[ABIERTO]`

### Las 23 hojas `[ABIERTO]` (tienen clase y puerto; su CONTENIDO no se estima)

| Hoja | Clase / puerto | Qué falta declarar |
|---|---|---|
| A6.3 `regla-hecho-incompleto` | `ContrapartidaAsistida` A6.1 | ¿asienta provisional / espera / avisa? |
| A8.3 `dueno-cola-revision` | `EncoladoExcepcion` A8.1 | ¿quién resuelve la cola: asesor, dueño o trabajador? |
| A10 `catalogo-puertos-documento` | Puerto #2 | ¿qué fuentes/canales declara cada negocio? |
| B7 `criterio-clave-asiento` | `ClaveNatural` M3 · K9 | se cierra con `unidad_de_cierre` |
| C7 `criterio-periodo` | `Periodificacion` C3 · K9 | `momento_de_uso` / `unidad_de_cierre` |
| D10 `alcance-fiscal` | `PerfilAdministrativo` D15 | ¿hasta dónde llega la capa fiscal? |
| D11 `parametros-fiscales` | `PerfilAdministrativo` D15 · K9 | bases/tipos fiscales |
| E6 `politica-cobro-pago` | `PrevisionCaja` E5 · K9 | plazos que declara el negocio |
| E12 `diferencia-cambio` | `MaestroCuentasBancarias` E11 | se activa SÓLO si hay multi-moneda |
| F5 `parametros-amortizacion` | `PlanAmortizacion` F2 · K9 | métodos/coeficientes |
| G5 `calculo-nomina` | `ReciboNomina` G1 · `PuertoNomina` G4 | ¿calcula o sólo recibe el hecho? |
| H5 `coste-consumo` | `ValoracionExistencia` H1 · `FronteraFichaProducto` H2 | `fuente_coste_consumo` |
| H6 `solape-custodia-contable` | `FronteraFichaProducto` H2 | ¿absorbe o sólo lee? |
| I5 `criterio-consolidacion` | `Consolidacion` I3 · K9 | criterio de consolidación |
| I6 `vista-agregada` | `Consolidacion` I3 | consolidador lectura vs proyecto-oficina |
| I7 `granularidad-grupo` | `Consolidacion` I3 | ¿hasta dónde llega el grupo? |
| J6 `dimensiones-analiticas` | `EtiquetadoAnalitico` J1 · K9 | centros/dimensiones por negocio |
| J7 `criterio-reparto-indirecto` | `CosteIndirecto` J5 · K9 | criterio de reparto |
| K6 `catalogo-avisos` | `MotorAvisos` K2 | qué avisos, a quién, por qué canal |
| K7 `frontera-entrega` | `AvisoAlNegocio` R1 | qué entra en la 1ª entrega |
| K8 `modelo-licencia` | `OnboardingNegocio` K1 | licencia por negocio / uso / paquete |
| L6 `formato-exportacion` | `PuertoExportacion` L1 | formato del programa del asesor |
| M4 `definicion-cierre` | `AnclajeCierreVertical` A14 · K9 | `unidad_de_cierre` — la clave de todo el cerrojo 3 |

### Los 7 conflictos de validación cruzada — **ya decididos por el dueño; NO se reabren**

| # | Conflicto | **Decisión tomada** | Clase que la materializa |
|---|---|---|---|
| ① | Dos maestros de terceros (N1 vs N2) | **Un solo maestro con roles** (cliente/proveedor/ambos) | `MaestroTerceros` N1 + `PadronTerceros` N2 (faceta identidad) |
| ② | Tres señales de cobertura (A12 · Q3 · C6) | **Una sola métrica**; las tres son sus vistas | `CompletitudCobertura` A12 → Q3/C6/P4 (leen) |
| ③ | Cuatro caminos de corrección (B5 · A13 · O2 · D14) | **Cuatro planos distintos** ligados por mapa canónico; TRES actos, no uno | `AsientoAjuste` B5 · `HechoRectificativo` A13 · `FacturaRectificativa` O2 · `RectificacionDeclaracion` D14 |
| ④ | Observadora que emite factura (O1) | **Contabilidad SÍ emite la factura de venta** (es su documento) | `EmisionFacturaVenta` O1 |
| ⑤ | La silla del cliente: ¿negocio o dueño? | **Sin declarar** → se sirve según la silla; `[ABIERTO]` (Q35) | Q1 · J8 · R1 |
| ⑥ | Trabajador humano vs automatización | **Sin declarar** (Q66 raíz); si es humano y concurrente, choca con M2 | `DesatascoEntrada` P3 · `SingleWriter` M2 |
| ⑦ | `diferencia-cambio` E12 depende de multi-moneda | **Latente** hasta que el dueño declare multi-moneda (Q20) | `MaestroCuentasBancarias` E11 |

### Las 72 preguntas abiertas de F2 (íntegras — guion de la conversación siguiente)

> **12 de F0** · **10 del prisma global** (9 únicas tras consolidar la duplicada) · **51 nuevas** de
> los 12 prismas de actor. La columna «toca» mapea a las clases de este diseño.

| # | Origen | Pregunta | Toca (clases) |
|---|---|---|---|
| 1 | F0 | `cuando_reconstruye` — ¿tiempo real, cierre o ambos? | A (entrada) · C4 |
| 2 | F0 | `unidad_de_cierre` — ¿qué es "un cierre" y cómo se identifica? | A7 · A14 · M3 · C3 |
| 3 | F0 | `fuente_coste_consumo` — ¿de dónde sale el coste del consumo? | H2 · H4 · J2 |
| 4 | F0 | `alcance_fiscal` — ¿hasta dónde llega la capa fiscal? | D15 · D1–D9 |
| 5 | F0 | `recepcion_digital_facturas` — ¿por qué canal/formato? | A5 · D9 |
| 6 | F0 | `cola_revision` — ¿qué pasa con lo ilegible y quién lo resuelve? | A8.1 · A8.2 · L10 |
| 7 | F0 | `catalogo_avisos` — ¿qué avisos, a quién y por qué canal? | K2 · K6 |
| 8 | F0 | `vista_agregada` — ¿consolidador lectura o proyecto-oficina? | I3 |
| 9 | F0 | `granularidad_de_grupo` — ¿hasta dónde llega el grupo? | I3 |
| 10 | F0 | `solape_marketing_budget` — ¿absorbe o lee? | H2 · H6 |
| 11 | F0 | `momento_de_uso` — ¿con qué ritmo se usa? | C3 · K1 |
| 12 | F0 | `frontera_primera_entrega` — ¿qué entra en la 1ª entrega? | R1 · K7 |
| 13 | global | ¿El producto **calcula nóminas** o sólo recibe el hecho? | G4 (G5) |
| 14 | global | ¿Qué **métodos/coeficientes de amortización**? | F2 (F5) |
| 15 | global | ¿Qué **método de valoración** de existencias? | H1 |
| 16 | global | ¿Qué **formato de exportación** exige el asesor? | L1 (L6) |
| 17 | global | ¿Bases y **tipos fiscales** de cada negocio? | D15 (D11) |
| 18 | global | ¿Qué **centros/dimensiones** declara cada negocio? | J1 (J6) |
| 19 | global | ¿El **ajuste** reemplaza o suma? | B5 |
| 20 | global | ¿**Multi-moneda**? ¿conversión y a qué tipo? | E11 · I3 · E12 |
| 21 | global | ¿El sistema **ejecuta** cobros/pagos o sólo los observa? | E (tesorería) |
| 22 | dueño | ¿Desde **dónde y en qué forma** consulta el dueño? | Q1 |
| 23 | dueño | ¿Hasta dónde quiere **bajar al detalle**? | Q1 · L2 · B3 |
| 24 | dueño | ¿Qué **cifra le hace decidir** (caja mínima, deuda máxima)? | Q2 · E5 · `Umbral` |
| 25 | dueño+jefe+asesor | ¿**Quién declara/ratifica los criterios** y en qué orden? | K9 · B1/B6 · I3 |
| 26 | asesor | ¿Revisa **por excepción y muestra** o exige el libro entero? | L8 |
| 27 | asesor | ¿**Ratifica cada regla aprendida** o sólo el resultado? | L10 · A6.2 · E8 |
| 28 | asesor | ¿**Nivel de la firma**: periodo, estado o documento? | L3 |
| 29 | asesor+jefe | El **plan contable**, ¿lo importa el asesor o lo declara el negocio? | B1 · B6 |
| 30 | administración | **Territorio**: ¿estatal, foral o autonómica? | D15 |
| 31 | administración | **Régimen de IVA**: general, simplificado, recargo equivalencia? | D15 · D1 |
| 32 | administración | **Sujeto fiscal**: ¿IS o IRPF, y cuál por negocio? | D5 · D15 |
| 33 | administración | ¿Qué **justificante/acuse** devuelve y cómo se liga? | D13 |
| 34 | administración+asesor | ¿**Presenta** el sistema o sólo **prepara**? | D7 · D13 · L3 |
| 35 | clientes+rol cliente | ¿Quién es **el cliente exacto**? ¿Coincide con el dueño? | N1 · R (conflicto ⑤) |
| 36 | clientes | **Pagador ≠ receptor fiscal**: ¿es siempre el mismo tercero? | N1 · O1 |
| 37 | clientes | **Series y numeración**: ¿por negocio, por canal o única? | O1 |
| 38 | clientes | **Ticket vs factura**: ¿se emite ticket, factura o ambos? | O1 |
| 39 | clientes+proveedores | ¿**Dónde se declara la condición de pago/cobro** por tercero? | N1 · E6 |
| 40 | proveedores | ¿La factura de compra se **coteja** contra pedido/recepción? | N5 |
| 41 | proveedores | ¿Existen **rappels / pronto-pago / anticipos**? | N7 |
| 42 | proveedores | ¿Hay **retención de IRPF a proveedores**? | D4 · N7 |
| 43 | proveedores | ¿**Quién confirma el saldo** con el proveedor? | N4 |
| 44 | proveedores | ¿La compra pasa por **albarán** o sólo por factura? | N5 · H4 |
| 45 | bancos | ¿Por qué **canal/formato** llega cada **extracto**? | E2 |
| 46 | bancos | ¿La **conciliación** se corre al día o al cierre? | E1 · C3 |
| 47 | bancos | Comisiones e intereses, ¿**se reclasifican solos** o con revisión? | E7 · E8 |
| 48 | bancos | ¿Hay **domiciliación de recibos**? | E1 · E3 |
| 49 | bancos | ¿**Cuántas cuentas** y en qué **monedas**? | E11 · E12 |
| 50 | empleados | ¿De dónde **vienen** los datos de nómina? | G4 |
| 51 | empleados | ¿Qué **convenio / tipos de cotización**? | G2 |
| 52 | empleados | ¿Hay **dietas, anticipos, pagas extra, especie**? | G8 · G9 |
| 53 | empleados | ¿**Quién paga el neto**: emite orden o sólo observa? | G3 · E |
| 54 | empleados | ¿**Quién puede ver una nómina**? | G7 |
| 55 | empleados | ¿Cuántos **tipos de relación laboral**? | G |
| 56 | verticales | ¿**Qué hechos emite HOY cada vertical y con qué campos**? | A11 · A1 |
| 57 | verticales | ¿**Qué vertical publica el movimiento de stock**? | A1 · H4 |
| 58 | verticales | ¿Se emite un **hecho de cierre explícito** o se infiere? | A14 · C4 |
| 59 | verticales | ¿Hay **hechos sin vertical productora** que contabilidad deba autoproducir? | C4 · F2 · G1 |
| 60 | verticales | Si una vertical **no publica**: ¿hueco o vacío? | A12 · A15 |
| 61 | jefe | ¿Qué **desviación/sangría** dispara aviso y con qué **umbral**? | J4 · K2 |
| 62 | jefe | ¿El jefe ve el **margen por dimensión** o basta el global? | J1 · J10 |
| 63 | rol cliente | ¿**Cómo se vende** (licencia/uso/paquete)? | K1 (K8) |
| 64 | rol cliente | ¿El cliente **elige sus avisos** o los recibe fijos? | R1 · K6 |
| 65 | rol cliente | ¿El cliente tiene **voz post-entrega**? | R |
| 66 | rol trabajador **[RAÍZ]** | ¿Existe **trabajador-humano** o el trabajador **es la automatización**? | P3 · M2 (conflicto ⑥) |
| 67 | rol trabajador | ¿**Cuándo es "hoy"**? el ritmo del trabajo | P (control) · C3 (=#11) |
| 68 | rol trabajador | ¿Qué hace con un **hecho incompleto** mientras espera? | A6.1 · P3 |
| 69 | rol trabajador | ¿El **desatasco escala** al asesor/jefe? | P3 · A8.3 · A8.2 |
| 70 | rol trabajador | ¿**Quién atiende** los avisos de cuadre que fallan? | C6 · P1 |
| 71 | rol trabajador | ¿Hay **turnos / concurrencia** sobre la misma cola? | P · M2 |
| 72 | global+actores | ¿El sistema **emite** facturas o sólo las **observa**? | O1 · D8 · D9 (conflicto ④) |

### Lo que ESTE diseño destapa (nuevas `[ABIERTO]` dirigidas al dueño — no se fusiona nada)

> Regla de la unidad: si el diseño sugiere que dos hojas podrían ir juntas, **NO se fusionan**; se
> declara `[ABIERTO]` y decide el dueño. Ninguna se ha fusionado.

1. **`[ABIERTO]` — N1 `maestro-terceros` vs N2 `padron-terceros`.** El diseño las mantiene como
   **dos clases** (dos facetas del mismo maestro: ficha funcional + identidad por número fiscal) y las
   ata por `Tercero{roles}`. **¿Debe el dueño fusionarlas en UNA clase?**
2. **`[ABIERTO]` — N6 `vencimiento-pago` vs N8 `antiguedad-de-saldos`.** Simétricas (pago/cobro) sobre
   el mismo tipo `Vencimiento`. Se mantienen **dos clases**. **¿Una sola lógica de vencimientos con dos lados?**
3. **`[ABIERTO]` — el tipo `Vencimiento` es TRANSVERSAL** a N6, N8 y E5. Se declara como **tipo de
   soporte**, no como clase. ¿Confirma el dueño el molde?
4. **`[ABIERTO]` — `MarcaEstado` (Q4) LEE `FlujoFirma` (L3) y `TrazaAsiento` (B4).** ¿Almacén de marca
   por dato o derivación pura?
5. **`[ABIERTO]` — `SolicitudDecision` es un TIPO, no una hoja.** 16 puntos de decisión humana lo
   comparten. ¿Se declara puerto propio para la decisión, o cada clase gestiona la suya?
6. **`[ABIERTO]` — 24 puertos abiertos.** Ninguno tiene formato declarado; los "cablea el sitio".
   ¿Cuáles entran en la **primera entrega** (relacionado con §Q12/K7)?
7. **`[ABIERTO]` — el habla de los `Conversor` y de los `Reflejo`.** Este diseño declara que **NO
   anuncian hechos** (transforman / derivan). ¿Confirma el dueño que la frontera de formato y el
   cálculo puro **no** son hechos? (Es el criterio con el que se cuentan los 43 hechos.)

---

## Verificación de la REGLA DE LA UNIDAD (auto-test del diseño)

- **118 clases de dominio** — una por cada hoja atómica del árbol §1 de `esquema.md`.
- **Ninguna hoja sin clase:** recuento por grupo A 18 · B 6 · C 6 · D 13 · E 10 · F 4 · G 9 · H 4 ·
  I 4 · J 8 · K 5 · L 7 · M 3 · N 8 · O 2 · P 4 · Q 4 · R 3 = **118** = el total del esquema.
- **Ninguna clase fusiona dos hojas:** donde el diseño vio parentesco (N1/N2 · N6/N8 · tipos
  transversales), **declaró `[ABIERTO]`** y no fusionó (§10.4).
- **Todas las formas respetadas:** 60 `Reflejo` · 29 `Custodio` · 14 `Puente` · 8 `MicroAgente` ·
  7 `Conversor` — **idéntico** al recuento de `pasada-diseccion.md`. Cero reclasificaciones.
- **26 tipos de soporte** (value objects), nombrados aparte con su porqué — ninguno es hoja.
- **El habla declarada en TODAS:** `SUBE` + `PUBLICA` + `ESCUCHA` en las 118 clases.
- **La regla de oro se cumple:** 43 clases publican hecho (29 Custodio + 13 Puente + `P3`);
  75 no publican (60 Reflejo + 7 Conversor + 7 MicroAgente que proponen + `Q1` que pregunta).
- **CERO TECNOLOGÍAS:** no se nombra ningún motor, transporte, lenguaje, canal ni formato concreto.
  Todo el entorno externo cruza por **puerto abierto** (§4). Lo no declarado es `[ABIERTO]`.

> **FIN DEL DISEÑO.** Fase 3 · PLASMA lista. Siguiente: **F3b** (`plan-construccion.md`) — ordenar
> las 118 clases en oleadas por vertical y declarar a qué vertical pertenece cada una.
