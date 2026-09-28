# PASADA · DISECCIÓN — FORMA de cada hoja atómica, una a una

> **Fase 2 · esquematizar-negocio** · vertical **`contabilidad`** · paso FINAL de la fase.
> Da **FORMA** a CADA hoja atómica del árbol maestro (`esquema.md`, 70 atómicas) **+ las hojas
> nuevas que emergieron de los prismas de interlocutor y de rol** (+48). **Una por una, sin
> saltar ninguna.**
> **Agnosticismo total:** cero tecnologías (no se nombra ningún motor, bus, lenguaje ni canal
> concreto — sólo puertos y piezas). **Cero supuestos:** lo no declarado va `[ABIERTO]`.

## Las 5 FORMAS (el dueño del vocabulario)
```
REFLEJO puro        calcular, cero juicio — un test unitario lo AFIRMA
MICRO-AGENTE fuzzy  juicio, lenguaje, ambigüedad — el reflejo hidrata y persiste,
                    el agente solo transforma (el corte maestro pasa por aquí)
CUSTODIO            un solo dueño por store — dos escritores es corrupción esperando turno
CONVERSOR           una sola frontera donde cruzan formatos, unidades o dimensiones
PUENTE              conecta con lo vecino por EVENTO, sin pisar lo manual
```

**Criterio del corte maestro aplicado:** si la hoja **calcula sin juzgar** (determinista, un
test lo afirma) → **REFLEJO**. Si **interpreta o decide con ambigüedad** (lee un documento
ilegible, propone una contrapartida, clasifica un movimiento anómalo, traduce lenguaje) →
**MICRO-AGENTE fuzzy**. Quien tiene **store propio con un solo escritor** → **CUSTODIO**. La
**frontera de formato/unidad/codificación** → **CONVERSOR**. Quien **conecta con el vecino por
evento** → **PUENTE**.

> **Convención:** cada hoja lleva UNA forma principal (la que cuenta en el recuento). Cuando una
> hoja mezcla formas, la línea «por qué» nombra la hidratación (p.ej. «reflejo hidratador»).

---

## A · ENTRADA-HECHOS — LA PUERTA (el eslabón limitante)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| A1 | `puerto-evento-vertical` | **PUENTE** | Conecta con la vertical vecina por EVENTO (hechos ya emitidos); no pisa lo manual. |
| A2 | `normalizador-hecho` | **CONVERSOR** | Única puerta de formato: homogeneiza el hecho de cada vertical a forma asentable. |
| A3 | `captura-documento` | **REFLEJO** | Admite el documento (digitalizado o recibido) y valida campos; mecánico, cero juicio. |
| A4.1 | `extraccion-dato` | **MICRO-AGENTE** | Abre un documento no estructurado y lo vuelve dato (importes/fechas/tercero/líneas): interpretar lo ilegible es lenguaje/ambigüedad → fuzzy. |
| A4.2 | `puerto-documento` | **CONVERSOR** | Frontera de las formas declarables del documento; el adaptador lo pone el sitio. |
| A4.3 | `control-cuadre-documento` | **REFLEJO** | Comprueba importe+impuestos; si no cuadra → cola. Cálculo determinista, un test lo afirma. |
| A5 | `puerto-documento-digital` | **PUENTE** | Recepción digital declarable: conecta con el canal emisor por evento; si no existe, se crea. |
| A6.1 | `contrapartida-asistida` | **MICRO-AGENTE** | Propone cuenta/tercero/periodo contra el plan declarado: juicio con ambigüedad → fuzzy. |
| A6.2 | `regla-contrapartida` | **CUSTODIO** | Store de reglas declarables/aprendidas ("este proveedor → esta cuenta"); un solo escritor. El aprendizaje entra hidratado desde fuera (desatasco/ratificación). |
| A7 | `deduplicacion-hecho` | **REFLEJO** | Aplica la clave natural del hecho/documento → no duplica. Idempotencia determinista, test lo afirma. |
| A8.1 | `encolado-excepcion` | **CUSTODIO** | Buffer/cola de lo dudoso: un solo dueño del store; el flujo sigue, lo dudoso espera. |
| A8.2 | `aviso-revision` | **PUENTE** | Empujón al canal de avisos ("esto necesita revisión"): conecta con lo vecino por evento. |
| A9 | `lote-admision` | **REFLEJO** | Desacople del cuello: N hechos en paralelo. Programación mecánica de la admisión, cero juicio. |
| A11 | `contrato-hecho-minimo` | **CUSTODIO** | Store declarable del mínimo exigible por vertical (campos que un hecho debe traer); un escritor. |
| A12 | `completitud-cobertura` | **REFLEJO** | Mide qué hechos llegaron y cuáles no → cobertura de la reconstrucción. Cálculo determinista. |
| A13 | `hecho-rectificativo` | **PUENTE** | Conecta el hecho posterior que corrige/anula uno anterior con su original (por clave natural), por evento; no borra, añade. |
| A14 | `anclaje-cierre-vertical` | **CUSTODIO** | Store declarable por vertical de qué es "un cierre" y cómo se identifica; un solo escritor. |
| A15 | `declaracion-fuente-faltante` | **PUENTE** | Detecta el hueco (reflejo) y lo DECLARA al vecino por evento (abierto + aviso); no obliga a la vertical. |
| A16 | `panel-proceso-contable` | **REFLEJO** | Latido del pipeline (entra/procesa/cola/falla): agregación y medición deterministas. |
| A17 | `historial-proceso-contable` | **CUSTODIO** | Registro append-only de lo procesado y fallado; un solo dueño escribe. |
| A18 | `desatasco-entrada` | **MICRO-AGENTE** | Resolver/reencolar/descartar una excepción con motivo: decidir la resolución (contrapartida, importe) es juicio → fuzzy. |
| A19 | `tasa-cobertura-entrada` | **REFLEJO** | Proporción de hechos que entran sin intervención vs caen a cola: métrica determinista. |
| A20 | `cruce-factura-recepcion` | **REFLEJO** | Coteja pedido ↔ recepción ↔ factura; lo que no cuadra → cola. Cálculo de cotejo determinista. |

## B · LIBRO-NÚCLEO (partida doble · plan · diario · mayor · terceros)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| B1 | `catalogo-cuentas` | **CUSTODIO** | Plan contable declarable/importable: store con un solo escritor (lo aporta el negocio/asesor). |
| B2 | `escritor-diario` | **CUSTODIO** | Single-writer por parcela: es EL custodio del libro; dos escritores corrompen. |
| B3 | `mayor-balanza` | **REFLEJO** | Saldos por cuenta derivados del diario: cálculo determinista, un test lo afirma. |
| B4 | `traza-asiento` | **CUSTODIO** | Registro inmutable (quién/cuándo creó cada asiento): store append-only, un escritor. |
| B5 | `asiento-ajuste` | **PUENTE** | Camino por el que la corrección del asesor ENTRA al libro sin borrar: conecta con lo vecino por evento, traza intacta. |
| B6 | `puerto-plan-contable` | **CONVERSOR** | Frontera de codificación del plan (import/export): cruce de formatos. |
| B8 | `padron-terceros` | **CUSTODIO** | Identidad única del tercero por su número fiscal; store con un solo escritor. |
| B9 | `maestro-terceros` | **CUSTODIO** | Ficha única de cliente/proveedor (identificación fiscal, condiciones, historial); un escritor. *(Candidata a fusionarse con B8: misma lógica de identidad de tercero — lo decide el padre.)* |
| B10 | `cuenta-proveedor` | **REFLEJO** | Mayor auxiliar del tercero (cada factura viva y su saldo), derivado del diario: cálculo. |
| B11 | `estado-cuenta-proveedor` | **REFLEJO** | Extracto confrontable del saldo del tercero: derivación determinista del auxiliar. |
| B12 | `rappel-pronto-pago` | **REFLEJO** | Ajusta el coste real de la compra (descuentos/rappels/anticipos): cálculo determinista. |

## C · ESTADOS-CIERRE (balance · resultados · cierre · periodificación)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| C1 | `balance-situacion` | **REFLEJO** | Estado derivado del mayor (activo/pasivo/patrimonio): cálculo determinista. |
| C2 | `cuenta-resultados` | **REFLEJO** | Estado derivado (ingresos/gastos/resultado): cálculo determinista. |
| C3 | `periodificacion` | **REFLEJO** | Imputa cada hecho a su periodo con el criterio declarado: cálculo; conserva ambas fechas, no elige. |
| C4 | `cierre-ejercicio` | **CUSTODIO** | Cierra el periodo con ajustes; irreversible salvo ajuste → estado/parcela con un solo escritor. |
| C5 | `apertura-ejercicio` | **REFLEJO** | Asientos de apertura derivados del cierre anterior: cálculo determinista. |
| C6 | `aviso-cuadre` | **PUENTE** | No finge el cuadre: si falta cobertura, avisa → empujón al canal de avisos por evento. |

## D · CAPA-FISCAL (IVA · IS/IRPF · retenciones · modelos · Verifactu · e-factura)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| D1 | `liquidacion-iva` | **REFLEJO** | Deriva IVA devengado/soportado del libro: cálculo determinista. |
| D2 | `modelo-303` | **REFLEJO** | Construye el modelo desde la liquidación: cálculo. |
| D3 | `modelo-390` | **REFLEJO** | Ídem anual: construcción determinista desde el libro. |
| D4 | `retenciones` | **REFLEJO** | Retenciones practicadas/soportadas: cálculo desde los asientos. |
| D5 | `estimacion-is-irpf` | **REFLEJO** | Estimación del resultado fiscal con base declarada: cálculo determinista. |
| D6 | `calendario-fiscal` | **CUSTODIO** | Store de plazos declarables → dispara aviso (empuja al canal de avisos): un solo escritor. |
| D7 | `generador-modelo` | **PUENTE** | Salida al programa del asesor: conecta con lo vecino por evento/puerto. |
| D8 | `registro-verifactu` | **CUSTODIO** | Huella/cadena inalterable de la facturación: registro encadenado, un solo escritor. |
| D9 | `factura-electronica` | **CONVERSOR** | Frontera de formato estructurado de la factura. |
| D12 | `estado-presentacion-fiscal` | **CUSTODIO** | Ciclo de vida de cada obligación (pendiente→generada→presentada→justificada→atrasada): store de estado, un escritor. |
| D13 | `acuse-presentacion` | **PUENTE** | Recoge y liga el justificante/acuse de vuelta a su modelo y asiento: cierra el bucle hacia fuera por evento. |
| D14 | `rectificacion-declaracion` | **CUSTODIO** | Camino de corrección POSTERIOR a la presentación (complementaria/sustitutiva): store/secuencia con un escritor; ≠ ajuste interno B5. |
| D15 | `perfil-administrativo` | **CUSTODIO** | Store declarable de qué administraciones y obligaciones aplican al negocio (territorio/régimen); un escritor. |
| D16 | `emision-factura-venta` | **CUSTODIO** | Cara emitida con serie/numeración fiscal: gobierna la secuencia (un solo escritor — número duplicado = corrupción); el desglose se compone (reflejo). |
| D17 | `factura-rectificativa` | **REFLEJO** | Corrección comercial posterior (abono/devolución/descuento) que no borra: cálculo determinista del ajuste. |

## E · TESORERÍA (bancos · conciliación · previsión de caja)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| E1 | `conciliacion-bancaria` | **REFLEJO** | Cruce extracto ↔ libro por clave natural y reglas: determinista, un test lo afirma. El juicio de lo que no casa vive en E7/E8. **(Corte dudoso — ver nota final.)** |
| E2 | `puerto-extracto` | **CONVERSOR** | Frontera de canal/formato del extracto: un adaptador por banco; si falta, se crea. |
| E3 | `cuadre-cobro-pago` | **REFLEJO** | Clave natural compartida: un movimiento bancario = un cobro/pago. Cálculo determinista. |
| E4 | `saldo-tesoreria` | **REFLEJO** | Posición real de dinero por cuenta: derivación determinista. |
| E5 | `prevision-caja` | **REFLEJO** | Proyecta entradas/salidas desde los compromisos con la política declarada: cálculo. |
| E7 | `partida-no-identificada` | **MICRO-AGENTE** | Reconoce y clasifica el movimiento sin contrapartida (comisión/interés/devolución): interpretación con ambigüedad → fuzzy. |
| E8 | `regla-movimiento-bancario` | **CUSTODIO** | Store de reglas declarables/aprendidas ("esta comisión → esta cuenta"); un solo escritor. |
| E9 | `partida-conciliatoria` | **REFLEJO** | Partidas en tránsito que explican el desfase (cheque no cobrado, cobro no apuntado): cálculo. |
| E10 | `informe-conciliacion` | **REFLEJO** | Documento de cuadre saldo banco ↔ saldo contable ajustado: derivación determinista. |
| E11 | `maestro-cuentas-bancarias` | **CUSTODIO** | Catálogo declarable de cuentas y su moneda: store con un solo escritor. |
| E12 | `vencimiento-pago` | **REFLEJO** | Fecha de vencimiento por factura desde la política declarada: cálculo determinista. |
| E13 | `antiguedad-de-saldos` | **REFLEJO** | Clasifica lo pendiente por vencimiento (quién y cuánto está vencido): cálculo. |

## F · INMOVILIZADO (altas · amortizaciones · bajas)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| F1 | `alta-activo` | **CUSTODIO** | Registra el bien duradero (parcela del inmovilizado) con un solo escritor; la valoración del alta es reflejo hidratador. |
| F2 | `plan-amortizacion` | **CUSTODIO** | Genera la cuota cuando toca (dispara en el cierre): estado/store por bien, un escritor. |
| F3 | `baja-activo` | **REFLEJO** | Retira el bien y calcula el resultado (pérdida/beneficio) e lo imputa: cálculo determinista. |
| F4 | `valor-neto-contable` | **REFLEJO** | Coste − amortización acumulada: cálculo determinista al balance. |

## G · PERSONAL (nóminas · seguros sociales)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| G1 | `recibo-nomina` | **REFLEJO** | Admite y da forma asentable al hecho de nómina (hecho hecho o documento): mecánico, cero juicio. |
| G2 | `obligacion-seguridad-social` | **REFLEJO** | Gasto de empresa + obligación con la TGSS desde el recibo: cálculo determinista. |
| G3 | `asiento-personal` | **REFLEJO** | Gasto de personal, retención y pago → asiento equilibrado: construcción determinista. |
| G4 | `puerto-nomina` | **PUENTE** | Origen declarable del dato de nómina: conecta con el sistema de personal por evento; si no existe, se crea. |
| G6 | `lineas-nomina` | **REFLEJO** | Desglose bruto / retención / cotización trabajador / neto: cálculo derivado. |
| G7 | `acceso-nomina` | **CUSTODIO** | Gobernanza de quién ve qué nómina (dato personal): store de permisos con un solo escritor. |
| G8 | `pagos-a-cuenta-empleado` | **REFLEJO** | Anticipos/adelantos y su impacto en el neto y el IRPF: cálculo determinista. |
| G9 | `conceptos-extra-nomina` | **REFLEJO** | Dietas, especie, finiquito, paga extra: cálculo de su imputación. |
| G10 | `liquidacion-baja-empleado` | **REFLEJO** | Cierre de la cuenta del trabajador (finiquito/indemnización): cálculo determinista. |

## H · EXISTENCIAS (inventario valorado)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| H1 | `valoracion-existencia` | **REFLEJO** | Capa de valor sobre el stock existente (no duplica inventario): cálculo determinista. |
| H2 | `frontera-ficha-producto` | **CONVERSOR** | Puerto declarable del coste de cada negocio: frontera donde cruza el coste de la ficha al dato interno; si falta, se crea. |
| H3 | `ajuste-inventario` | **REFLEJO** | Regulariza merma/rotura (asiento + aviso): cálculo de la diferencia. |
| H4 | `variacion-stock-valorada` | **REFLEJO** | Entrada por compra / salida por consumo, valoradas: cálculo determinista. |

## I · GRUPO (multi-sociedad · consolidación)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| I1 | `marca-sociedad` | **REFLEJO** | Etiqueta cada asiento con su sociedad: mecánico, cero juicio. |
| I2 | `eliminacion-intercompany` | **REFLEJO** | Detecta y elimina el cruce interno en la consolidación: cálculo determinista. |
| I3 | `consolidacion` | **REFLEJO** | Estados del conjunto con criterio declarado: agregación determinista. |
| I4 | `aislamiento-negocio` | **CUSTODIO** | Multi-tenant sin fuga: gobierna la parcela de cada negocio (un dueño por parcela). |

## J · ANALÍTICA (centros de coste · márgenes · presupuestos · desviaciones)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| J1 | `etiquetado-analitico` | **MICRO-AGENTE** | Asigna centro/línea/producto a cada hecho con regla declarable; cuando la regla no cubre, clasificar es juicio → fuzzy (lo dudoso → cola). |
| J2 | `margen-analitico` | **REFLEJO** | Ingreso − coste imputado por dimensión: cálculo determinista. |
| J3 | `presupuesto` | **CUSTODIO** | Cifra objetivo por dimensión declarable: store con un solo escritor. |
| J4 | `desviacion` | **REFLEJO** | Real vs presupuesto → dispara aviso si se sale: cálculo determinista. |
| J5 | `coste-indirecto` | **REFLEJO** | Aplica el reparto declarado de gastos no directos: cálculo determinista. |
| J8 | `cuadro-mando-contable` | **REFLEJO** | Agregación de conjunto (caja·resultado·margen·desviación·ejercicio) sin bajar al asiento: cálculo. |
| J9 | `comparador-periodos` | **REFLEJO** | Real vs esperado, periodo vs periodo: cálculo comparativo determinista. |
| J10 | `tablero-margen-dimension` | **REFLEJO** | Cruce margen × dimensión bajo lente de conjunto: agregación determinista. |

## K · PRODUCTO-SERVICIO (multi-tenant · avisos · informes · cara negocio/dueño/cliente)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| K1 | `onboarding-negocio` | **CUSTODIO** | Recoge los datos declarables del negocio nuevo (plan, fuentes, parámetros): store de config, un escritor. |
| K2 | `motor-avisos` | **PUENTE** | Puente al canal de avisos: conecta con lo vecino por evento (el requisito 4 del dueño). |
| K3 | `informe-rico` | **REFLEJO** | Compone la cifra ya calculada con el contexto declarado (periodo, origen, comparativas): mecánico. La *narración* fuzzy vive en K15. **(Corte dudoso — ver nota final.)** |
| K4 | `activacion-vertical` | **REFLEJO** | Enciende la vertical por la configuración declarada: mecánico, cero juicio. |
| K9 | `consulta-cuentas-bajo-demanda` | **PUENTE** | Puerta *pull*: conecta la pregunta del dueño con el cálculo por evento/petición; no impone cadencia. |
| K10 | `puente-lenguaje-dueño` | **MICRO-AGENTE** | Traduce en los dos sentidos (pregunta → consulta contable; cálculo → cifra en su idioma): lenguaje → fuzzy. |
| K11 | `sello-cobertura` | **REFLEJO** | Marca de completitud de lo consultado: si falta cobertura, lo dice antes de que decida. Cálculo determinista. |
| K12 | `marca-borrador-validado` | **REFLEJO** | Sello del punto en que está lo que ve (en curso / revisado / firmado): deriva el estado desde la traza y la firma. |
| K13 | `aviso-al-negocio` | **PUENTE** | Entrega y confirma el aviso al negocio cliente: cara de entrega, conecta por evento (K2 sólo produce). |
| K14 | `informe-accionable` | **MICRO-AGENTE** | Todo informe que recibe el cliente lleva «qué hacer»: la recomendación es juicio → fuzzy. |
| K15 | `narrador-estados` | **MICRO-AGENTE** | Traduce balance/resultado al lenguaje del negocio («esto es lo que te ha pasado y lo que viene»): lenguaje → fuzzy. |
| K16 | `cola-declaraciones-criterio` | **CUSTODIO** | Una sola cola donde el jefe fija/ratifica los criterios (cierra los `[ABIERTO]`: B1/B7·C7·E6·F5·J6·D11·I5): store declarativo, un escritor. |

## L · REVISIÓN-ASESOR (exportación · diálogo · ajuste · firma — la medida maestra)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| L1 | `puerto-exportacion` | **CONVERSOR** | Frontera de formatos contables estándar hacia el programa del asesor; si falta, se crea. |
| L2 | `vista-revisable` | **REFLEJO** | Muestra cada asiento/cálculo con su origen: composición determinista de la traza (no caja negra). |
| L3 | `flujo-firma` | **CUSTODIO** | Marca de revisado/firmado por el asesor: store de estado con un solo escritor (el sistema no firma). |
| L7 | `expediente-documental` | **CUSTODIO** | Documento origen archivado y enlazado a su cifra (prueba de la firma): store con un solo escritor. |
| L8 | `control-calidad-muestreo` | **REFLEJO** | Selecciona lo que exige ojo humano por señales deterministas (alto importe, sin regla, contrapartida nueva, cuadre dudoso): cálculo. |
| L9 | `cambio-desde-ultima-revision` | **REFLEJO** | Delta entre revisiones (asientos nuevos, ajustes, reglas cambiadas): cálculo de diferencia. |
| L10 | `ratificacion-regla-aprendida` | **PUENTE** | El asesor ratifica o bloquea la regla ANTES de que actúe sobre el volumen: gate humano por evento. |

## M · ANTI-BUCLE (los 3 cerrojos transversales)

| Código | Hoja | FORMA | Por qué esa forma |
|---|---|---|---|
| M1 | `frontera-planos` | **REFLEJO** | Guarda verificable de que sólo se emiten cálculos (`contabilidad.*`), nunca hechos: un test lo afirma. |
| M2 | `single-writer` | **CUSTODIO** | La regla de un solo escritor por parcela — es la ley que gobierna cada custodio del sistema. |
| M3 | `clave-natural` | **REFLEJO** | Idempotencia determinista: reprocesar no duplica ("un cierre = un asiento"). Test lo afirma. |

---

## HOJAS `[ABIERTO]` (no se disecan — esperan al dueño)

> **Ley de cero supuestos:** estas hojas no tienen FORMA porque su contenido lo declara el
> dueño/asesor. No se estiman.

**Del árbol maestro (22):**
`A6.3 regla-hecho-incompleto` · `A8.3 dueno-cola-revision` · `A10 catalogo-puertos-documento` ·
`B7 criterio-clave-asiento` · `C7 criterio-periodo` · `D10 alcance-fiscal` ·
`D11 parametros-fiscales` · `E6 politica-cobro-pago` · `F5 parametros-amortizacion` ·
`G5 calculo-nomina` · `H5 coste-consumo` · `H6 solape-custodia-contable` ·
`I5 criterio-consolidacion` · `I6 vista-agregada` · `I7 granularidad-grupo` ·
`J6 dimensiones-analiticas` · `J7 criterio-reparto-indirecto` · `K6 catalogo-avisos` ·
`K7 frontera-entrega` · `K8 modelo-licencia` · `L6 formato-exportacion` · `M4 definicion-cierre`.

**Nuevos, emergidos de los prismas (1):**
`E14 diferencia-cambio` — diferencia por moneda distinta de la base; **[ABIERTO]** hasta que el
dueño declare multi-moneda.

---

## RECUENTO POR FORMA

| FORMA | Cuántas | Dónde se concentran |
|---|---|---|
| **REFLEJO puro** | **60** | Todo el cálculo derivado: mayor/balanza, estados, fiscal, márgenes, saldos, métricas |
| **MICRO-AGENTE fuzzy** | **8** | El corte maestro: extracción de documento, contrapartida asistida, clasificación de anomalía, etiquetado, lenguaje/narración, acción de desatasco |
| **CUSTODIO** | **29** | Un store por parcela: diario, plan, traza, colas, registros inmutables, maestros, config |
| **CONVERSOR** | **7** | Las 7 fronteras de formato/codificación |
| **PUENTE** | **14** | Todo lo que conecta con el vecino por evento |
| **TOTAL** | **118** | 70 atómicas del árbol maestro + 48 nuevas de los prismas |

> **Verificación de cobertura:** 118 = 70 (esquema.md) + 48 (prismas de interlocutor y rol).
> **Ninguna hoja atómica quedó sin forma.**

### Detalle de las 7 fronteras (CONVERSOR)
`A2 normalizador-hecho` · `A4.2 puerto-documento` · `B6 puerto-plan-contable` ·
`D9 factura-electronica` · `E2 puerto-extracto` · `H2 frontera-ficha-producto` ·
`L1 puerto-exportacion`.

### Detalle de las 8 MICRO-AGENTE (el corte maestro)
`A4.1 extraccion-dato` · `A6.1 contrapartida-asistida` · `A18 desatasco-entrada` ·
`E7 partida-no-identificada` · `J1 etiquetado-analitico` · `K10 puente-lenguaje-dueño` ·
`K14 informe-accionable` · `K15 narrador-estados`.

---

## CORTES DUDOSOS REFLEJO ↔ MICRO-AGENTE (transparencia del corte maestro)

1. **`A4.1 extraccion-dato`** — *¿calcular o interpretar?* **MICRO-AGENTE.** Un documento
   estructurado sería reflejo, pero el cuello declara documentos **ilegibles/no estructurados**;
   abrirlos y sacar importes/tercero/impuestos es interpretar lenguaje → fuzzy. El reflejo
   hidratador es `A4.2 puerto-documento` (la forma declarable).
2. **`A6.1 contrapartida-asistida`** — *¿elijo cuenta/tercero o lo calculo?* **MICRO-AGENTE.**
   Proponer la contrapartida contra el plan es juicio con ambigüedad. El corte **duro** lo fija la
   regla (A6.2, custodio); el agente sólo **propone**.
3. **`E1 conciliacion-bancaria`** — *la pasada dice «reglas + juicio asistido».* **REFLEJO.**
   Decidí que el **cruce** por clave natural y reglas es determinista (un test lo afirma) y que el
   **juicio** vive en sus dos hojas satélite: `E7 partida-no-identificada` (fuzzy) y
   `E8 regla-movimiento-bancario` (custodio). Así no se duplica el mismo juicio en dos hojas.
4. **`E7 partida-no-identificada`** — *¿clasificar por regla o interpretar?* **MICRO-AGENTE.**
   El movimiento sin contrapartida (comisión/interés/devolución) llega con descripción ambigua del
   banco → interpretar. Una vez existe la regla (E8), pasa a automático (reflejo hidratado).
5. **`A18 desatasco-entrada`** — *¿acción mecánica o decisión?* **MICRO-AGENTE.** Resolver la
   excepción (decidir contrapartida, confirmar importe, descartar con motivo) es juicio. Nota: si
   el dueño declara que la silla la ocupa un humano (`A8.3 [ABIERTO]`), esto se vuelve una
   **captura** de su decisión — pero no se estima hasta que se declare.
6. **`J1 etiquetado-analitico`** — *regla declarable → ¿reflejo?* **MICRO-AGENTE.** Con regla
   declarada el caso cubierto es reflejo, pero asignar un hecho a un centro cuando la regla no
   cubre es clasificación con ambigüedad (lo dudoso → cola). El juicio es el que manda.
7. **`L8 control-calidad-muestreo`** — *¿es juicio «qué exige ojo humano»?* **REFLEJO.** Los
   criterios son señales duras declaradas (umbral de importe, sin regla, contrapartida nueva,
   cuadre dudoso) → selección determinista, un test la afirma.
8. **`K3 informe-rico`** — *«información rica» ¿es redactar o componer?* **REFLEJO.** Decidí que
   el informe **compone** cifras ya calculadas con el contexto declarado (periodo, origen,
   comparativa) — mecánico; la **narración** en lenguaje es `K15 narrador-estados` (fuzzy) y el
   «qué hacer» es `K14 informe-accionable` (fuzzy). Separa composición de lenguaje.

*(Cortes secundarios también valorados con cuidado: `A6.2 regla-contrapartida` — custodio del
store frente a «aprendizaje fuzzy»: el aprendizaje entra hidratado por A18/L10, el store es
custodio. `B5 asiento-ajuste` — puente frente a custodio: es el **camino** por el que entra la
corrección del asesor, no el store; el store es B2/B4. `D16 emision-factura-venta` — custodio
frente a reflejo: gobierna la **serie/numeración** (número duplicado = corrupción), el desglose
es reflejo.)*

---

> **FIN DE LA DISECCIÓN.** 118 hojas atómicas con FORMA, 1 nueva `[ABIERTO]`, 22 `[ABIERTO]` del
> árbol. El corte maestro queda explícito y trazable. Fase 2 lista para consolidar en `esquema.md`.
