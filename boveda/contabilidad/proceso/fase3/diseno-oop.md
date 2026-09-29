# Diseño OOP — CONTABILIDAD (Fase 3 · PLASMA)

> **Fase 3 · planificar-construccion** · vertical **`contabilidad`** · entregable: este diseño.
> **Lente:** ingeniería de diseño orientada a objetos. **Sin plataforma:** pseudocódigo OOP tipado.
> **Fuente única:** `fase2/esquemas/esquema.md` (árbol maestro: 118 hojas atómicas, 23 `[ABIERTO]`,
> 3 SPAWN, 3 REF, 7 conflictos, partición §8b) + `pasada-diseccion.md` (FORMA de cada hoja).
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
> **Decisión del dueño (2026-09-28), ya tomada, NO se reabre:** la vertical se PARTE en **cuatro**
> (`entrada` 32 · `libro` 32 · `fiscal` 22 · `analítica` 32). Es **UN** diseño; el reparto se declara abajo.

---

## 0 · Las 5 formas (vocabulario cerrado)

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

## 1 · Objetivo del sistema

**Qué hace:** reconstruye la contabilidad completa (flujo de caja · ventas · consumo · stock · compras ·
resultado · fiscal · grupo · analítica) a partir de **hechos que ya ocurrieron** y del **cierre**.
Observa, normaliza, asienta, deriva, cierra, declara y **avisa**. No digita; no firma; no decide por
el dueño ni por el asesor.

**Cuándo interrumpe al dueño / al asesor:** **sólo cuando un dato falta, un documento no cuadra, una
regla es nueva, una obligación vence o el negocio se desvía.** Todo lo demás corre sin operador.
El sistema **no bloquea el flujo** por lo dudoso: lo **encola** y **avisa**.

---

## 2 · Tipos de soporte del dominio (value objects — NO son hojas)

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
| `ClaveNatural` | identidad idempotente de un hecho/cierre ("un cierre = un asiento") |
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
| `Vencimiento` | `tercero`, `documento`, `fecha`, `estado` — un solo tipo de "vencimiento" con dos lados (conflicto ①/N6/N8) |
| `Dimension` | centro de coste / línea / familia / sociedad — **declarada, nunca estimada** |
| `Delta` | diferencia entre dos puntos (revisión↔revisión, periodo↔periodo) |
| `Umbral` | umbral declarado (alto importe, caja mínima, desviación) — señal, no decisión |

**Total de tipos de soporte: 26.** Ninguno es una hoja; ninguno sustituye a una clase de dominio.

---

## 3 · Entidades y clases — LAS 118 (una por hoja atómica)

> Formato: `ATRIBUTOS · METODOS · REGLA` + `FORMA` + `HOJA` + a qué **vertical** cae.
> Cada clase **extiende su forma**. `[ABIERTO]` = su dato lo declara el dueño; **la clase existe,
> su contenido no se estima**.

### GRUPO A · ENTRADA-HECHOS — LA PUERTA (eslabón limitante) · `entrada`

```
CLASE PuertoEventoVertical : Puente {                     FORMA: PUENTE   · HOJA: A1   · entrada
  ATRIBUTOS: contrato:ContratoHechoMinimo, fuentes:Set<FuenteVertical>
  METODOS:  abrir(fuente:FuenteVertical):Flujo<HechoCrudo>
            recibir(crudo:HechoCrudo):Hecho
  REGLA: la vertical manda; contabilidad se adapta. NO impone formato ni obliga a emitir.
}
CLASE NormalizadorHecho : Conversor {                     FORMA: CONVERSOR · HOJA: A2   · entrada
  ATRIBUTOS: regla_forma:ParametroDeclarable
  METODOS:  entrar(crudo:HechoCrudo):Hecho
  REGLA: ÚNICA puerta de formato: homogeneiza el hecho de cada vertical a forma asentable.
}
CLASE CapturaDocumento : Reflejo {                        FORMA: REFLEJO  · HOJA: A3   · entrada
  ATRIBUTOS: documento:Documento
  METODOS:  admitir(doc:Documento):Validacion<Documento>
  REGLA: admite el documento (digitalizado o recibido) y valida campos; mecánico, cero juicio.
}
CLASE ExtraccionDato : MicroAgente {                      FORMA: MICRO-AGENTE · HOJA: A4.1 · entrada
  ATRIBUTOS: documento:Documento
  METODOS:  juzgar(doc:Documento):Propuesta<Hecho>
  REGLA: abre un documento NO estructurado y lo vuelve dato. Interpretar lo ilegible es juicio;
         no asienta: PROPONE. La contrapartida se resuelve después.
}
CLASE PuertoDocumento : Conversor {                       FORMA: CONVERSOR · HOJA: A4.2 · entrada
  ATRIBUTOS: formas_declarables:Set<FormaDocumento>
  METODOS:  entrar(externo:Externo):Documento
  REGLA: frontera de las formas declarables del documento; el adaptador lo pone el sitio.
}
CLASE ControlCuadreDocumento : Reflejo {                  FORMA: REFLEJO  · HOJA: A4.3 · entrada
  ATRIBUTOS: tolerancia:ParametroDeclarable
  METODOS:  cuadra(doc:Documento):bool
  REGLA: si importe+impuestos no cuadran → cola, NO se asienta mal. Cálculo determinista.
}
CLASE PuertoDocumentoDigital : Puente {                   FORMA: PUENTE   · HOJA: A5   · entrada
  ATRIBUTOS: canal:ParametroDeclarable
  METODOS:  recibir():Flujo<Documento>
  REGLA: recepción digital declarable; conecta con el canal emisor; si no existe, se crea.
}
CLASE ContrapartidaAsistida : MicroAgente {               FORMA: MICRO-AGENTE · HOJA: A6.1 · entrada
  ATRIBUTOS: plan:CatalogoCuentas, terceros:MaestroTerceros
  METODOS:  juzgar(h:Hecho):Propuesta<Apunte>
  REGLA: propone cuenta/tercero/periodo contra el plan declarado. PROPONE; el corte duro lo fija
         la regla (A6.2). No escribe.
}
CLASE ReglaContrapartida : Custodio {                     FORMA: CUSTODIO · HOJA: A6.2 · entrada
  ATRIBUTOS: reglas:Set<ReglaAprendida>, plan:CatalogoCuentas
  METODOS:  aplicar(h:Hecho):Opcion<Apunte>, proponer(r:ReglaAprendida)
  REGLA: parcela de reglas declarables/aprendidas ("este proveedor → esta cuenta"). UN escritor.
         El aprendizaje entra hidratado desde fuera (desatasco/ratificación).
}
CLASE DeduplicacionHecho : Reflejo {                      FORMA: REFLEJO  · HOJA: A7   · entrada
  ATRIBUTOS: vistas:Set<ClaveNatural>
  METODOS:  es_nuevo(h:Hecho):bool
  REGLA: aplica la clave natural del hecho/documento → no duplica. Idempotencia determinista.
}
CLASE EncoladoExcepcion : Custodio {                      FORMA: CUSTODIO · HOJA: A8.1 · entrada
  ATRIBUTOS: cola:List<Excepcion>
  METODOS:  encolar(e:Excepcion), tomar(id):Excepcion
  REGLA: parcela de lo dudoso. UN escritor. El flujo CONTINÚA; lo dudoso espera.
}
CLASE AvisoRevision : Puente {                            FORMA: PUENTE   · HOJA: A8.2 · entrada
  ATRIBUTOS: destino:ParametroDeclarable
  METODOS:  empujar(e:Excepcion):Aviso
  REGLA: empujón al canal de avisos ("esto necesita revisión"). Conecta por evento.
}
CLASE LoteAdmision : Reflejo {                            FORMA: REFLEJO  · HOJA: A9   · entrada
  ATRIBUTOS: tamano_lote:ParametroDeclarable
  METODOS:  admitir(entrada:Flujo<Hecho>):Flujo<Hecho>
  REGLA: desacople del cuello: N hechos en paralelo (la admisión no se serializa).
}
CLASE ContratoHechoMinimo : Custodio {                    FORMA: CUSTODIO · HOJA: A11  · entrada
  ATRIBUTOS: campos_por_vertical:Map<FuenteVertical,Campos>
  METODOS:  exigir(f:FuenteVertical):Contrato, declarar(f,c:Campos)
  REGLA: parcela declarable del MÍNIMO exigible. Es la cara vista desde la fuente:
         no un formato impuesto, un mínimo declarado. UN escritor.
}
CLASE CompletitudCobertura : Reflejo {                    FORMA: REFLEJO  · HOJA: A12  · entrada
  ATRIBUTOS: esperados:Set<Hecho>, llegados:Set<Hecho>
  METODOS:  medir():Cobertura
  REGLA: mide qué hechos publicó una vertical y cuáles NO llegaron. Produce **la métrica única**;
         las demás señales la LEEN (no la recalculan).
}
CLASE HechoRectificativo : Puente {                       FORMA: PUENTE   · HOJA: A13  · entrada
  ATRIBUTOS: original:Hecho
  METODOS:  emparejar(rect:Hecho):Enlace<Hecho,Hecho>
  REGLA: conecta el hecho posterior que corrige/anula uno anterior por clave natural. NO borra, añade.
}
CLASE AnclajeCierreVertical : Custodio {                  FORMA: CUSTODIO · HOJA: A14  · entrada
  ATRIBUTOS: por_vertical:Map<FuenteVertical,DefinicionCierre>
  METODOS:  anclar(f:FuenteVertical):DefinicionCierre, declarar(f,d)
  REGLA: parcela declarable de POR VERTICAL qué es "un cierre" y cómo se identifica. Su puerto es
         construible; su contenido pende de `unidad_de_cierre` (dato del dueño). UN escritor.
}
CLASE DeclaracionFuenteFaltante : Puente {                FORMA: PUENTE   · HOJA: A15  · entrada
  ATRIBUTOS: cobertura:Cobertura
  METODOS:  declarar(faltante:Hueco):Aviso
  REGLA: detecta que una vertical NO publica un hecho necesario y lo DECLARA (abierto + aviso).
         NO obliga a la vertical a producirlo.
}
```

### GRUPO B · LIBRO-NÚCLEO — partida doble · `libro`

```
CLASE CatalogoCuentas : Custodio {                        FORMA: CUSTODIO · HOJA: B1   · libro
  ATRIBUTOS: cuentas:Set<Cuenta>
  METODOS:  anadir(c:Cuenta), buscar(codigo):Opcion<Cuenta>
  REGLA: plan contable declarable/importable del asesor. UN escritor.
}
CLASE EscritorDiario : Custodio {                         FORMA: CUSTODIO · HOJA: B2   · libro
  ATRIBUTOS: asientos:List<Asiento>, escritor_id
  METODOS:  asentar(a:Asiento):Resultado
  REGLA: ES EL custodio del libro. Single-writer por parcela: dos escritores corrompen.
         Rechaza si Σ debe ≠ Σ haber (invariante 1).
}
CLASE MayorBalanza : Reflejo {                            FORMA: REFLEJO  · HOJA: B3   · libro
  ATRIBUTOS: diario:EscritorDiario
  METODOS:  saldos(ejercicio):Map<Cuenta,Cuantía>, balanza():EstadoDerivado
  REGLA: saldos por cuenta DERIVADOS del diario. Cálculo determinista; un test lo afirma.
}
CLASE TrazaAsiento : Custodio {                           FORMA: CUSTODIO · HOJA: B4   · libro
  ATRIBUTOS: marcas:List<MarcaTraza>
  METODOS:  registrar(a:Asiento, quien, cuando)
  REGLA: registro inmutable (quién/cuándo creó cada asiento), append-only. UN escritor.
}
CLASE AsientoAjuste : Puente {                            FORMA: PUENTE   · HOJA: B5   · libro
  ATRIBUTOS: origen:SolicitudDecision
  METODOS:  entrar(ajuste:Asiento)
  REGLA: camino por el que la corrección del asesor ENTRA al libro sin borrar. Conecta por evento,
         traza intacta. El almacén es B2/B4, no este camino.
}
CLASE PuertoPlanContable : Conversor {                    FORMA: CONVERSOR · HOJA: B6   · libro
  ATRIBUTOS: formato:ParametroDeclarable
  METODOS:  entrar(externo):Set<Cuenta>, salir(plan):Externo
  REGLA: frontera de codificación del plan (import/export). Cruce de formatos.
}
```

### GRUPO C · ESTADOS-CIERRE — balance · resultado · cierre · periodificación · `libro`

```
CLASE BalanceSituacion : Reflejo {                        FORMA: REFLEJO  · HOJA: C1   · libro
  ATRIBUTOS: mayor:MayorBalanza
  METODOS:  calcular(ejercicio):EstadoDerivado
  REGLA: activo/pasivo/patrimonio derivado del mayor. Determinista.
         Invariante: ACTIVO = PASIVO + PATRIMONIO; descuadre = ERROR, no estado.
}
CLASE CuentaResultados : Reflejo {                        FORMA: REFLEJO  · HOJA: C2   · libro
  ATRIBUTOS: mayor:MayorBalanza
  METODOS:  calcular(ejercicio):EstadoDerivado
  REGLA: ingresos/gastos/resultado derivado. Determinista.
}
CLASE Periodificacion : Reflejo {                         FORMA: REFLEJO  · HOJA: C3   · libro
  ATRIBUTOS: criterio:Periodo
  METODOS:  imputar(a:Asiento):Periodo
  REGLA: imputa cada hecho a su periodo con el criterio declarado; CONSERVA fecha operación y
         fecha valor, NO elige. Determinista.
}
CLASE CierreEjercicio : Custodio {                        FORMA: CUSTODIO · HOJA: C4   · libro
  ATRIBUTOS: ejercicio:Ejercicio, cerrado:bool
  METODOS:  cerrar(ajustes:List<Asiento>):Resultado, reabrir(solo_con:AsientoAjuste)
  REGLA: cierra el periodo con ajustes. IRREVERSIBLE salvo ajuste (invariante 12). UN escritor.
}
CLASE AperturaEjercicio : Reflejo {                       FORMA: REFLEJO  · HOJA: C5   · libro
  ATRIBUTOS: cierre_anterior:CierreEjercicio
  METODOS:  generar():List<Asiento>
  REGLA: asientos de apertura DERIVADOS del cierre anterior. Determinista.
}
CLASE AvisoCuadre : Puente {                              FORMA: PUENTE   · HOJA: C6   · libro
  ATRIBUTOS: cobertura:Cobertura, destino:ParametroDeclarable
  METODOS:  avisar(ejercicio):Aviso
  REGLA: NO finge el cuadre: si falta cobertura, avisa. LEE la métrica única; no la recalcula.
}
```

### GRUPO D · CAPA-FISCAL — IVA · IS/IRPF · retenciones · modelos · Verifactu · e-factura · `fiscal`

```
CLASE LiquidacionIva : Reflejo {                          FORMA: REFLEJO  · HOJA: D1   · fiscal
  ATRIBUTOS: mayor:MayorBalanza, params:ParametroDeclarable
  METODOS:  calcular(periodo):Liquidacion
  REGLA: IVA devengado/soportado DERIVADO del libro. Determinista. Tipos = dato, no constante.
}
CLASE Modelo303 : Reflejo {                               FORMA: REFLEJO  · HOJA: D2   · fiscal
  ATRIBUTOS: liquidacion:LiquidacionIva, formato:ParametroDeclarable
  METODOS:  construir(periodo):Modelo
  REGLA: construye el modelo desde la liquidación. Determinista.
}
CLASE Modelo390 : Reflejo {                               FORMA: REFLEJO  · HOJA: D3   · fiscal
  ATRIBUTOS: liquidaciones:List<LiquidacionIva>
  METODOS:  construir(ejercicio):Modelo
  REGLA: ídem anual; construcción determinista desde el libro.
}
CLASE Retenciones : Reflejo {                             FORMA: REFLEJO  · HOJA: D4   · fiscal
  ATRIBUTOS: mayor:MayorBalanza, params:ParametroDeclarable
  METODOS:  calcular(periodo):Liquidacion
  REGLA: retenciones practicadas/soportadas calculadas desde los asientos. Determinista.
}
CLASE EstimacionIsIrpf : Reflejo {                        FORMA: REFLEJO  · HOJA: D5   · fiscal
  ATRIBUTOS: resultados:CuentaResultados, base:ParametroDeclarable
  METODOS:  estimar(ejercicio):Estimacion
  REGLA: estimación del resultado fiscal con base DECLARADA. Determinista. Nada se estima sin base.
}
CLASE CalendarioFiscal : Custodio {                       FORMA: CUSTODIO · HOJA: D6   · fiscal
  ATRIBUTOS: plazos:Set<ParametroDeclarable>
  METODOS:  proximos(hoy):List<Vencimiento>, declarar(p)
  REGLA: parcela de plazos declarables → dispara aviso proactivo. UN escritor. La ley entra como dato.
}
CLASE GeneradorModelo : Puente {                          FORMA: PUENTE   · HOJA: D7   · fiscal
  ATRIBUTOS: destino:ParametroDeclarable
  METODOS:  exportar(m:Modelo):Fichero<Externo>
  REGLA: salida al programa del asesor. Conecta por puerto. Formato ABIERTO (no declarado aún).
}
CLASE RegistroVerifactu : Custodio {                      FORMA: CUSTODIO · HOJA: D8   · fiscal
  ATRIBUTOS: cadena:List<Huella>
  METODOS:  encadenar(f:FacturaEmitida):Huella
  REGLA: huella/cadena INALTERABLE de la facturación, registro encadenado. UN escritor.
}
CLASE FacturaElectronica : Conversor {                    FORMA: CONVERSOR · HOJA: D9   · fiscal
  ATRIBUTOS: formato:ParametroDeclarable
  METODOS:  entrar(externo):FacturaEmitida, salir(f):Externo
  REGLA: frontera de formato estructurado de la factura.
}
CLASE EstadoPresentacionFiscal : Custodio {               FORMA: CUSTODIO · HOJA: D12  · fiscal
  ATRIBUTOS: ciclo:Map<Obligacion,EstadoObligacion>
  METODOS:  avanzar(o:Obligacion, e:EstadoObligacion)
  REGLA: ciclo de vida de cada obligación (pendiente→generada→presentada→justificada→atrasada).
         UN escritor. Sin él, el calendario avisa pero nadie sabe en qué punto está cada modelo.
}
CLASE AcusePresentacion : Puente {                        FORMA: PUENTE   · HOJA: D13  · fiscal
  ATRIBUTOS: modelo:Modelo, asiento:Asiento
  METODOS:  ligar(acus:Justificante)
  REGLA: recoge y liga el justificante/acuse que devuelve la administración a su modelo y a su
         asiento. Cierra el bucle hacia fuera, por evento.
}
CLASE RectificacionDeclaracion : Custodio {               FORMA: CUSTODIO · HOJA: D14  · fiscal
  ATRIBUTOS: presentadas:Set<Obligacion>
  METODOS:  rectificar(o, tipo∈{complementaria,sustitutiva}):Obligacion
  REGLA: camino de corrección POSTERIOR a la presentación. UN escritor. ≠ `asiento-ajuste` B5.
}
CLASE PerfilAdministrativo : Custodio {                   FORMA: CUSTODIO · HOJA: D15  · fiscal
  ATRIBUTOS: administraciones:Set<Administracion>, regimen:ParametroDeclarable
  METODOS:  obligaciones():Set<Obligacion>, declarar(...)
  REGLA: parcela declarable de qué administraciones y obligaciones aplican (territorio y régimen).
         ≠ `parametros-fiscales` D11, que son tipos y bases. UN escritor.
}
```

### GRUPO E · TESORERÍA — bancos · conciliación · previsión · `libro`

```
CLASE ConciliacionBancaria : Reflejo {                    FORMA: REFLEJO  · HOJA: E1   · libro
  ATRIBUTOS: extracto:Flujo<Movimiento>, diario:EscritorDiario, reglas:ReglaMovimientoBancario
  METODOS:  cruzar(periodo):ResultadoConciliacion
  REGLA: cruce extracto ↔ libro por clave natural y reglas. Determinista (un test lo afirma).
         El JUICIO de lo que no casa vive en E7 (fuzzy) / E8 (custodio): no se duplica aquí.
}
CLASE PuertoExtracto : Conversor {                        FORMA: CONVERSOR · HOJA: E2   · libro
  ATRIBUTOS: adaptadores:Map<Banco,FormaExtracto>
  METODOS:  entrar(externo):Flujo<Movimiento>
  REGLA: frontera de canal/formato del extracto; un adaptador por banco; si falta, se crea.
}
CLASE CuadreCobroPago : Reflejo {                         FORMA: REFLEJO  · HOJA: E3   · libro
  ATRIBUTOS: movimientos:Flujo<Movimiento>, diario:EscritorDiario
  METODOS:  cuadrar(m:Movimiento):Opcion<Asiento>
  REGLA: clave natural compartida: un movimiento bancario = un cobro/pago. Determinista.
}
CLASE SaldoTesoreria : Reflejo {                          FORMA: REFLEJO  · HOJA: E4   · libro
  ATRIBUTOS: cuentas:MaestroCuentasBancarias, mayor:MayorBalanza
  METODOS:  calcular(cuenta, fecha):Cuantía
  REGLA: posición real de dinero por cuenta. Derivación determinista.
}
CLASE PrevisionCaja : Reflejo {                           FORMA: REFLEJO  · HOJA: E5   · libro
  ATRIBUTOS: vencimientos:Set<Vencimiento>, politica:PoliticaCobroPago, saldo:SaldoTesoreria
  METODOS:  proyectar(hasta):Serie<Cuantía>
  REGLA: proyecta entradas/salidas desde los compromisos con la política declarada. Determinista.
}
CLASE PartidaNoIdentificada : MicroAgente {               FORMA: MICRO-AGENTE · HOJA: E7 · libro
  ATRIBUTOS: movimiento:Movimiento, reglas:ReglaMovimientoBancario
  METODOS:  juzgar(m:Movimiento):Propuesta<Apunte>
  REGLA: reconoce y clasifica el movimiento sin contrapartida (comisión/interés/devolución).
         La descripción del banco llega ambigua → interpretar. Una vez existe la regla (E8),
         pasa a automático. PROPONE; no escribe.
}
CLASE ReglaMovimientoBancario : Custodio {                FORMA: CUSTODIO · HOJA: E8   · libro
  ATRIBUTOS: reglas:Set<ReglaAprendida>
  METODOS:  aplicar(m:Movimiento):Opcion<Apunte>, proponer(r:ReglaAprendida)
  REGLA: parcela de reglas declarables/aprendidas ("esta comisión → esta cuenta"). UN escritor.
         Ratificación única por L10, no por puertas distintas.
}
CLASE PartidaConciliatoria : Reflejo {                    FORMA: REFLEJO  · HOJA: E9   · libro
  ATRIBUTOS: transito:Set<Partida>
  METODOS:  desfase():Cuantía
  REGLA: partidas en tránsito que explican el desfase (cheque no cobrado, cobro no apuntado).
         Determinista.
}
CLASE InformeConciliacion : Reflejo {                     FORMA: REFLEJO  · HOJA: E10  · libro
  ATRIBUTOS: conciliacion:ConciliacionBancaria
  METODOS:  componer(periodo):Informe
  REGLA: documento de cuadre saldo banco ↔ saldo contable ajustado. La PRUEBA de que cuadra.
}
CLASE MaestroCuentasBancarias : Custodio {                FORMA: CUSTODIO · HOJA: E11  · libro
  ATRIBUTOS: cuentas:Map<IdCuenta,Moneda>
  METODOS:  declarar(c), listar():Set<IdCuenta>
  REGLA: parcela declarable de cuentas y su moneda. UN escritor. Sin él, "el banco" es un número falso.
}
```

### GRUPO F · INMOVILIZADO — altas · amortizaciones · bajas · `analítica`

```
CLASE AltaActivo : Custodio {                             FORMA: CUSTODIO · HOJA: F1   · analítica
  ATRIBUTOS: activos:Set<Activo>
  METODOS:  registrar(a:Activo):Resultado
  REGLA: parcela del inmovilizado. UN escritor. La valoración del alta es reflejo hidratador.
}
CLASE PlanAmortizacion : Custodio {                       FORMA: CUSTODIO · HOJA: F2   · analítica
  ATRIBUTOS: planes:Map<Activo,Cuotas>, params:ParametroDeclarable
  METODOS:  cuota_del_periodo(a:Activo, p:Periodo):Opcion<Cuantía>
  REGLA: genera la cuota cuando toca (dispara en el cierre). UN escritor. Método/coeficiente = dato.
}
CLASE BajaActivo : Reflejo {                              FORMA: REFLEJO  · HOJA: F3   · analítica
  ATRIBUTOS: activo:Activo, vnc:ValorNetoContable
  METODOS:  calcular(activo):Resultado<Perdida|Beneficio>
  REGLA: retira el bien y calcula el resultado (pérdida/beneficio) y lo imputa. Determinista.
}
CLASE ValorNetoContable : Reflejo {                       FORMA: REFLEJO  · HOJA: F4   · analítica
  ATRIBUTOS: coste:ParametroDeclarable, amort_acumulada:PlanAmortizacion
  METODOS:  calcular(a:Activo, fecha):Cuantía
  REGLA: coste − amortización acumulada. Determinista, al balance.
}
```

### GRUPO G · PERSONAL — nóminas · seguros sociales · `fiscal`

```
CLASE ReciboNomina : Reflejo {                            FORMA: REFLEJO  · HOJA: G1   · fiscal
  ATRIBUTOS: hecho_o_documento:Hecho
  METODOS:  dar_forma(entrada):HechoNomina
  REGLA: admite y da forma asentable al hecho de nómina (hecho hecho o documento). Mecánico, cero juicio.
}
CLASE ObligacionSeguridadSocial : Reflejo {               FORMA: REFLEJO  · HOJA: G2   · fiscal
  ATRIBUTOS: nomina:ReciboNomina, tipos:ParametroDeclarable
  METODOS:  calcular(n:ReciboNomina):Obligacion
  REGLA: gasto de empresa + obligación con la TGSS desde el recibo. Determinista. Tipos = dato.
}
CLASE AsientoPersonal : Reflejo {                         FORMA: REFLEJO  · HOJA: G3   · fiscal
  ATRIBUTOS: nomina:ReciboNomina, ss:ObligacionSeguridadSocial
  METODOS:  construir(...):Asiento
  REGLA: gasto de personal, retención y pago → asiento EQUILIBRADO. Determinista.
}
CLASE PuertoNomina : Puente {                             FORMA: PUENTE   · HOJA: G4   · fiscal
  ATRIBUTOS: origen:ParametroDeclarable
  METODOS:  recibir():Flujo<HechoNomina>
  REGLA: origen declarable del dato de nómina: conecta con el sistema de personal por evento;
         si no existe, se crea.
}
CLASE LineasNomina : Reflejo {                            FORMA: REFLEJO  · HOJA: G6   · fiscal
  ATRIBUTOS: nomina:ReciboNomina
  METODOS:  desglosar(n):Set<Linea>
  REGLA: desglose bruto / retención / cotización del trabajador / neto. Hace la nómina EXPLICABLE,
         no un número pelado. Determinista.
}
CLASE AccesoNomina : Custodio {                           FORMA: CUSTODIO · HOJA: G7   · fiscal
  ATRIBUTOS: permisos:Map<Empleado,Alcance>
  METODOS:  autorizar(quien, nomina):bool, declarar(p)
  REGLA: gobernanza de quién ve qué nómina (dato personal): cada uno ve la suya. UN escritor.
         Aislamiento dentro del negocio (eje persona) — complementa I4 (eje negocio).
}
CLASE PagosACuentaEmpleado : Reflejo {                    FORMA: REFLEJO  · HOJA: G8   · fiscal
  ATRIBUTOS: anticipos:Set<Anticipo>
  METODOS:  impacto(n:ReciboNomina):Cuantía
  REGLA: anticipos/adelantos y su impacto en el neto y el IRPF. Determinista. No todo es sueldo fijo.
}
CLASE ConceptosExtraNomina : Reflejo {                    FORMA: REFLEJO  · HOJA: G9   · fiscal
  ATRIBUTOS: conceptos:Set<Concepto>
  METODOS:  imputar(c:Concepto):Set<Apunte>
  REGLA: dietas, especie, finiquito, paga extra: cálculo de su imputación. Determinista.
}
CLASE LiquidacionBajaEmpleado : Reflejo {                 FORMA: REFLEJO  · HOJA: G10  · fiscal
  ATRIBUTOS: empleado:Empleado
  METODOS:  liquidar(...):Asiento
  REGLA: cierre de la cuenta del trabajador (finiquito/indemnización), para que NO quede un
         acreedor abierto. Determinista.
}
```

### GRUPO H · EXISTENCIAS — inventario valorado · `analítica`

```
CLASE ValoracionExistencia : Reflejo {                    FORMA: REFLEJO  · HOJA: H1   · analítica
  ATRIBUTOS: stock:InventarioExistente, metodo:ParametroDeclarable
  METODOS:  valorar(item, fecha):Cuantía
  REGLA: capa de valor SOBRE el inventario existente (no lo duplica). Método = dato (FIFO/medio).
}
CLASE FronteraFichaProducto : Conversor {                 FORMA: CONVERSOR · HOJA: H2   · analítica
  ATRIBUTOS: forma:ParametroDeclarable
  METODOS:  entrar(ficha):CosteInterno
  REGLA: puerto declarable del coste de cada negocio: frontera donde cruza el coste de la ficha al
         dato interno; si falta, se crea.
}
CLASE AjusteInventario : Reflejo {                        FORMA: REFLEJO  · HOJA: H3   · analítica
  ATRIBUTOS: teorico:Cuantía, real:Cuantía
  METODOS:  diferencia():Asiento
  REGLA: regulariza merma/rotura con asiento Y aviso. Cálculo de la diferencia. Determinista.
}
CLASE VariacionStockValorada : Reflejo {                  FORMA: REFLEJO  · HOJA: H4   · analítica
  ATRIBUTOS: entradas, salidas:Flujo<MovimientoStock>, valoracion:ValoracionExistencia
  METODOS:  variacion(periodo):Cuantía
  REGLA: entrada por compra / salida por consumo, VALORADAS. Determinista.
}
```

### GRUPO I · GRUPO — multi-sociedad · consolidación · `analítica`

```
CLASE MarcaSociedad : Reflejo {                           FORMA: REFLEJO  · HOJA: I1   · analítica
  ATRIBUTOS: sociedad:Sociedad
  METODOS:  marcar(a:Asiento):Asiento
  REGLA: etiqueta cada asiento con su sociedad. Mecánico, cero juicio.
}
CLASE EliminacionIntercompany : Reflejo {                 FORMA: REFLEJO  · HOJA: I2   · analítica
  ATRIBUTOS: asientos:Flujo<Asiento>
  METODOS:  eliminar():Set<Partida>
  REGLA: detecta y elimina el cruce interno en la consolidación. Determinista.
}
CLASE Consolidacion : Reflejo {                           FORMA: REFLEJO  · HOJA: I3   · analítica
  ATRIBUTOS: sociedades:Set<Sociedad>, criterio:ParametroDeclarable
  METODOS:  estados(criterio):EstadoDerivado
  REGLA: estados del conjunto con criterio DECLARADO. Agregación determinista. Grupo COMPLETO.
}
CLASE AislamientoNegocio : Custodio {                     FORMA: CUSTODIO · HOJA: I4   · analítica
  ATRIBUTOS: parcelas:Map<Negocio,Parcela>
  METODOS:  parcela(negocio):Parcela, escritor(negocio):Id
  REGLA: multi-negocio sin fuga. UN dueño por parcela. Los negocios NO se fugan.
         (Espejo de G7: eje negocio ↔ eje persona.)
}
```

### GRUPO J · ANALÍTICA / MANDO — centros de coste · márgenes · desviaciones · `analítica`

```
CLASE EtiquetadoAnalitico : MicroAgente {                 FORMA: MICRO-AGENTE · HOJA: J1 · analítica
  ATRIBUTOS: reglas:ParametroDeclarable, dimensiones:Set<Dimension>
  METODOS:  juzgar(h:Hecho):Propuesta<Dimension>
  REGLA: asigna centro/línea/producto a cada hecho con regla declarable; cuando la regla no cubre,
         clasificar es juicio → lo dudoso va a cola. PROPONE; no escribe.
}
CLASE MargenAnalitico : Reflejo {                         FORMA: REFLEJO  · HOJA: J2   · analítica
  ATRIBUTOS: ingresos, costes:Flujo<Cuantía>
  METODOS:  calcular(dimension, periodo):Cuantía
  REGLA: ingreso − coste imputado por dimensión. Determinista.
}
CLASE Presupuesto : Custodio {                            FORMA: CUSTODIO · HOJA: J3   · analítica
  ATRIBUTOS: objetivos:Map<Dimension,Cuantía>
  METODOS:  fijar(d,v), objetivo(d, periodo):Cuantía
  REGLA: cifra objetivo por dimensión declarable. UN escritor.
}
CLASE Desviacion : Reflejo {                              FORMA: REFLEJO  · HOJA: J4   · analítica
  ATRIBUTOS: real, presupuesto:Presupuesto, umbral:Umbral
  METODOS:  calcular(d, periodo):Delta
  REGLA: real vs presupuesto → dispara aviso SI se sale del umbral declarado. Determinista.
}
CLASE CosteIndirecto : Reflejo {                          FORMA: REFLEJO  · HOJA: J5   · analítica
  ATRIBUTOS: reparto:ParametroDeclarable
  METODOS:  repartir(coste, dimensiones):Map<Dimension,Cuantía>
  REGLA: aplica el reparto DECLARADO de gastos no directos. Determinista.
         Cubre lo que la pieza existente no cubre para grupo.
}
CLASE CuadroMandoContable : Reflejo {                     FORMA: REFLEJO  · HOJA: J8   · analítica
  ATRIBUTOS: caja:SaldoTesoreria, resultado:CuentaResultados, margen, desviacion, ejercicio
  METODOS:  componer(periodo):Informe
  REGLA: agregación de conjunto (caja·resultado·margen·desviación·ejercicio) SIN bajar al asiento.
         Lente del jefe. Determinista.
}
CLASE ComparadorPeriodos : Reflejo {                      FORMA: REFLEJO  · HOJA: J9   · analítica
  ATRIBUTOS: presupuesto:Presupuesto, desviacion:Desviacion
  METODOS:  comparar(a,b):Delta
  REGLA: ejercicio vs ejercicio, mes vs mes, real vs presupuesto. REUTILIZA J3/J4, no los duplica.
}
CLASE TableroMargenDimension : Reflejo {                  FORMA: REFLEJO  · HOJA: J10  · analítica
  ATRIBUTOS: margen:MargenAnalitico, dimensiones:Set<Dimension>
  METODOS:  cruzar():Tabla
  REGLA: cruce margen × dimensión bajo lente de conjunto: por centro, familia o sociedad.
}
```

### GRUPO K · PRODUCTO-SERVICIO — multi-tenant · avisos · informes · `analítica`

```
CLASE OnboardingNegocio : Custodio {                      FORMA: CUSTODIO · HOJA: K1   · analítica
  ATRIBUTOS: config:Map<Clave,Valor>
  METODOS:  recoger(negocio, datos), leer(clave):Opcion<Valor>
  REGLA: recoge los datos declarables del negocio nuevo (plan, fuentes, parámetros). UN escritor.
}
CLASE MotorAvisos : Puente {                              FORMA: PUENTE   · HOJA: K2   · analítica
  ATRIBUTOS: destino:ParametroDeclarable, catalogo:Set<Senal>
  METODOS:  producir(senal):Aviso
  REGLA: PRODUCE el aviso (requisito 4 del dueño). Conecta por evento. La ENTREGA es R1.
}
CLASE InformeRico : Reflejo {                             FORMA: REFLEJO  · HOJA: K3   · analítica
  ATRIBUTOS: cifra:Derivado, contexto:ParametroDeclarable
  METODOS:  componer(cifra, contexto):Informe
  REGLA: COMPONE la cifra ya calculada con el contexto declarado (periodo, origen, comparativas).
         Mecánico. La NARRACIÓN fuzzy vive en K15; el «qué hacer» en K14.
}
CLASE ActivacionVertical : Reflejo {                      FORMA: REFLEJO  · HOJA: K4   · analítica
  ATRIBUTOS: config:OnboardingNegocio
  METODOS:  activar(vertical):bool
  REGLA: enciende la vertical por la configuración declarada. Mecánico, cero juicio.
}
CLASE ColaDeclaracionesCriterio : Custodio {              FORMA: CUSTODIO · HOJA: K9   · analítica
  ATRIBUTOS: criterios:Map<Clave,ParametroDeclarable>
  METODOS:  fijar(clave, valor), ratificar(clave):ParametroDeclarable
  REGLA: UNA sola cola donde el jefe fija/ratifica TODOS los criterios. UN escritor.
         Cierra declarativamente B1/B7·C7·E6·F5·J6·D11·I5 — un único punto de declaración.
}
```

### GRUPO L · REVISIÓN-ASESOR — exportación · diálogo · ajuste · firma (medida maestra) · `libro`

```
CLASE PuertoExportacion : Conversor {                     FORMA: CONVERSOR · HOJA: L1   · libro
  ATRIBUTOS: formato:ParametroDeclarable
  METODOS:  salir(libro):Externo, entrar(ajustes):Set<Asiento>
  REGLA: frontera de formatos contables estándar hacia el programa del asesor; si falta, se crea.
}
CLASE VistaRevisable : Reflejo {                          FORMA: REFLEJO  · HOJA: L2   · libro
  ATRIBUTOS: asiento:Asiento, traza:TrazaAsiento
  METODOS:  explicar(a:Asiento):Informe
  REGLA: muestra cada asiento/cálculo CON su origen: composición determinista de la traza.
         NO caja negra.
}
CLASE FlujoFirma : Custodio {                             FORMA: CUSTODIO · HOJA: L3   · libro
  ATRIBUTOS: firmas:Map<Ambito,Firma>
  METODOS:  firmar(asesor, ambito, marca), estado(ambito):MarcaEstado
  REGLA: parcela de estado revisado/firmado del asesor. UN escritor. **El sistema NO firma**:
         vence → expira y RE-PREGUNTA, jamás asume.
}
CLASE ExpedienteDocumental : Custodio {                   FORMA: CUSTODIO · HOJA: L7   · libro
  ATRIBUTOS: referencias:Map<Cifra,Documento>
  METODOS:  archivar(cifra, doc), recuperar(cifra):Documento
  REGLA: cada cifra con el documento origen ARCHIVADO y ENLAZADO. Registro inmutable, UN escritor.
         L2 EXPLICA; el expediente CONSERVA la prueba para la inspección.
}
CLASE ControlCalidadMuestreo : Reflejo {                  FORMA: REFLEJO  · HOJA: L8   · libro
  ATRIBUTOS: umbrales:Set<Umbral>, reglas:ReglaContrapartida
  METODOS:  seleccionar(periodo):Set<Asiento>
  REGLA: selecciona lo que exige ojo humano por señales DURAS (alto importe, sin regla,
         contrapartida nueva, cuadre dudoso). Determinista: excepción + muestra, NO revisar todo.
}
CLASE CambioDesdeUltimaRevision : Reflejo {               FORMA: REFLEJO  · HOJA: L9   · libro
  ATRIBUTOS: firma:FlujoFirma
  METODOS:  delta():Delta
  REGLA: asientos nuevos, ajustes y reglas cambiadas desde el último visto bueno. Cálculo de diferencia.
}
CLASE RatificacionReglaAprendida : Puente {               FORMA: PUENTE   · HOJA: L10  · libro
  ATRIBUTOS: propuestas:Set<ReglaAprendida>
  METODOS:  ratificar(r, decision∈{ratifica,bloquea})
  REGLA: el asesor ratifica o bloquea la regla ANTES de que actúe sobre el volumen. Gate humano
         único para A6.2 y E8 — no tres puertas distintas.
}
```

### GRUPO M · ANTI-BUCLE — los 3 cerrojos transversales · `libro`

```
CLASE FronteraPlanos : Reflejo {                          FORMA: REFLEJO  · HOJA: M1   · libro
  ATRIBUTOS: permitido:PatronDeCalculo
  METODOS:  verificar(salida):bool
  REGLA: guarda verificable de que SÓLO se emiten cálculos, NUNCA hechos de negocio.
         Un test lo afirma. Contabilidad observa; no realimenta la operación.
}
CLASE SingleWriter : Custodio {                           FORMA: CUSTODIO · HOJA: M2   · libro
  ATRIBUTOS: duenos:Map<Parcela,Id>
  METODOS:  reclamar(parcela, id):bool, es_escritor(parcela, id):bool
  REGLA: la LEY que gobierna cada custodio: un solo escritor por parcela. Segundo escritor = corrupción.
}
CLASE ClaveNatural : Reflejo {                            FORMA: REFLEJO  · HOJA: M3   · libro
  ATRIBUTOS: composicion:ParametroDeclarable
  METODOS:  calcular(hecho):ClaveNatural, coincide(a,b):bool
  REGLA: idempotencia determinista: reprocesar NO duplica ("un cierre = un asiento"). Un test lo afirma.
}
```

### GRUPO N · TERCEROS — maestro fiscal único de clientes y proveedores · `entrada`

```
CLASE MaestroTerceros : Custodio {                        FORMA: CUSTODIO · HOJA: N1   · entrada
  ATRIBUTOS: terceros:Map<ClaveNatural,Tercero>
  METODOS:  ficha(id):Tercero, upsert(t:Tercero)
  REGLA: ficha única de cliente/proveedor (identificación fiscal, condiciones de pago/cobro,
         historial). **UN solo maestro con roles** (conflicto ① resuelto): un tercero que es
         cliente Y proveedor sigue siendo UNO. UN escritor.
}
CLASE PadronTerceros : Custodio {                         FORMA: CUSTODIO · HOJA: N2   · entrada
  ATRIBUTOS: identidades:Map<Nif,Tercero>
  METODOS:  unificar(t:Tercero):Tercero
  REGLA: identidad única por número fiscal: un proveedor escrito de tres formas sigue siendo uno.
         Faceta de identidad del MISMO maestro N1. UN escritor.
}
CLASE CuentaProveedor : Reflejo {                         FORMA: REFLEJO  · HOJA: N3   · entrada
  ATRIBUTOS: diario:EscritorDiario, tercero:Tercero
  METODOS:  saldo(t:Tercero):Cuantía, facturas_vivas(t):Set<Factura>
  REGLA: mayor auxiliar del tercero (cada factura de compra viva y su saldo), DERIVADO del diario.
}
CLASE EstadoCuentaProveedor : Reflejo {                   FORMA: REFLEJO  · HOJA: N4   · entrada
  ATRIBUTOS: auxiliar:CuentaProveedor
  METODOS:  extracto(t:Tercero, hasta):Informe
  REGLA: extracto CONFRONTABLE con el proveedor (conciliación de saldos). Derivación determinista.
}
CLASE CruceFacturaRecepcion : Reflejo {                   FORMA: REFLEJO  · HOJA: N5   · entrada
  ATRIBUTOS: pedido, recepcion, factura
  METODOS:  cotejar():Resultado
  REGLA: coteja pedido ↔ recepción ↔ factura ANTES de asentar; lo que no cuadra → cola. Determinista.
}
CLASE VencimientoPago : Reflejo {                         FORMA: REFLEJO  · HOJA: N6   · entrada
  ATRIBUTOS: factura:Factura, politica:PoliticaCobroPago
  METODOS:  calcular(f:Factura):Vencimiento
  REGLA: fecha de vencimiento por factura desde la política declarada → alimenta E5 y K2.
         Determinista. Un solo tipo `Vencimiento` con dos lados (pago/cobro).
}
CLASE RappelProntoPago : Reflejo {                        FORMA: REFLEJO  · HOJA: N7   · entrada
  ATRIBUTOS: compra:Factura, condiciones:ParametroDeclarable
  METODOS:  ajustar(f:Factura):Cuantía
  REGLA: descuentos/rappels/anticipos que ajustan el coste REAL de la compra a lo realmente pagado.
         Determinista.
}
CLASE AntiguedadSaldos : Reflejo {                        FORMA: REFLEJO  · HOJA: N8   · entrada
  ATRIBUTOS: vencimientos:Set<Vencimiento>
  METODOS:  clasificar():Tabla
  REGLA: lo pendiente clasificado por vencimiento — quién y cuánto está vencido. Espejo de N6 del
         lado del cobro; alimenta reclamación y E6. Determinista.
}
```

### GRUPO O · FACTURACIÓN EMITIDA (venta) · `entrada`

```
CLASE EmisionFacturaVenta : Custodio {                    FORMA: CUSTODIO · HOJA: O1   · entrada
  ATRIBUTOS: serie:Serie, secuencia, emisor:PerfilFiscal
  METODOS:  emitir(datos):FacturaEmitida
  REGLA: cara emitida con serie/numeración. Gobierna la secuencia: **número duplicado = corrupción**
         → UN escritor. El desglose de impuestos se COMPONE (reflejo). ≠ D8 (registro interno) y
         ≠ D9 (formato estructurado). **Contabilidad SÍ emite su factura (decisión del dueño)**:
         es SU documento; no un hecho de negocio observado.
}
CLASE FacturaRectificativa : Reflejo {                    FORMA: REFLEJO  · HOJA: O2   · entrada
  ATRIBUTOS: original:FacturaEmitida, motivo:ParametroDeclarable
  METODOS:  calcular(original, motivo):FacturaEmitida
  REGLA: corrección comercial POSTERIOR a la emisión (abono/devolución/descuento) que NO borra nada.
         ≠ ajuste interno B5. Determinista.
}
```

### GRUPO P · CONTROL DEL PROCESO (entrada) · `entrada`

```
CLASE PanelProcesoContable : Reflejo {                    FORMA: REFLEJO  · HOJA: P1   · entrada
  ATRIBUTOS: cola:EncoladoExcepcion, historial:HistorialProcesoContable
  METODOS:  latido():Panel
  REGLA: qué entra, qué se procesa, qué está en cola, qué falla. Agregación determinista.
}
CLASE HistorialProcesoContable : Custodio {               FORMA: CUSTODIO · HOJA: P2   · entrada
  ATRIBUTOS: eventos:List<Registro>
  METODOS:  anotar(r:Registro)
  REGLA: registro append-only de lo procesado y lo fallado con su rastro. UN escritor.
         ≠ `traza-asiento` B4 (que es del ASIENTO, no del PROCESO de entrada).
}
CLASE DesatascoEntrada : MicroAgente {                    FORMA: MICRO-AGENTE · HOJA: P3 · entrada
  ATRIBUTOS: cola:EncoladoExcepcion
  METODOS:  juzgar(e:Excepcion):Decision<resolver|reencolar|descartar>
  REGLA: resolver/reencolar/descartar una excepción CON motivo. Decidir la resolución
         (contrapartida, importe) es juicio. Es la ACCIÓN que completa A8 (que sólo encola).
         Si la silla la ocupa un humano, esto pasa a CAPTURA de su decisión (hoy `[ABIERTO]`).
}
CLASE TasaCoberturaEntrada : Reflejo {                    FORMA: REFLEJO  · HOJA: P4   · entrada
  ATRIBUTOS: cobertura:Cobertura
  METODOS:  calcular():Ratio
  REGLA: proporción de hechos que entran SIN intervención vs caen a cola. LEE la métrica única.
         La métrica que PRUEBA la promesa "sin una persona digitando".
}
```

### GRUPO Q · CONSULTA DEL DUEÑO (puerta *pull*) · `analítica`

```
CLASE ConsultaCuentasBajoDemanda : Puente {               FORMA: PUENTE   · HOJA: Q1   · analítica
  ATRIBUTOS: fuente:ParametroDeclarable
  METODOS:  preguntar(q:Consulta):Respuesta
  REGLA: puerta *pull*: conecta la pregunta del dueño con el cálculo por petición. NO impone cadencia
         (≠ cuadro del jefe J8, que sí la impone).
}
CLASE PuenteLenguajeDueno : MicroAgente {                 FORMA: MICRO-AGENTE · HOJA: Q2 · analítica
  ATRIBUTOS: mapa_lenguaje:ParametroDeclarable
  METODOS:  a_consulta(pregunta:Lenguaje):Consulta
            a_cifra(d:Derivado):Lenguaje
  REGLA: traductor BIDIRECCIONAL: su pregunta → consulta contable; cálculo → cifra en su idioma
         (caja, deuda, resultado, "¿puedo pagar X?"). Lenguaje → juicio.
}
CLASE SelloCobertura : Reflejo {                          FORMA: REFLEJO  · HOJA: Q3   · analítica
  ATRIBUTOS: cobertura:Cobertura
  METODOS:  sellar(respuesta):Respuesta
  REGLA: marca de completitud de lo consultado, FUERA de ciclo: si falta cobertura lo dice ANTES
         de que decida. LEE la métrica única. ≠ `aviso-cuadre` C6 (sólo avisa al cierre).
}
CLASE MarcaBorradorValidado : Reflejo {                   FORMA: REFLEJO  · HOJA: Q4   · analítica
  ATRIBUTOS: traza:TrazaAsiento, firma:FlujoFirma
  METODOS:  estado(dato):MarcaEstado
  REGLA: sello del punto en que está lo que ve (en curso / revisado / firmado), para no decidir
         sobre un borrador vivo como si fuera definitivo. Deriva el estado de la traza y la firma.
}
```

### GRUPO R · ENTREGA AL NEGOCIO (rol cliente) · `analítica`

```
CLASE AvisoAlNegocio : Puente {                           FORMA: PUENTE   · HOJA: R1   · analítica
  ATRIBUTOS: canal:ParametroDeclarable
  METODOS:  entregar(a:Aviso):Confirmacion
  REGLA: el aviso ENTREGADO y CONFIRMADO al negocio cliente. Cara de entrega: COMPLETA
         `motor-avisos` K2, que sólo PRODUCE.
}
CLASE InformeAccionable : MicroAgente {                   FORMA: MICRO-AGENTE · HOJA: R2 · analítica
  ATRIBUTOS: informe:Informe
  METODOS:  juzgar(i:Informe):Recomendacion
  REGLA: todo informe que recibe el cliente lleva QUÉ HACER con él. La recomendación es juicio.
         Refuerza K3 y lo quita de adorno.
}
CLASE NarradorEstados : MicroAgente {                     FORMA: MICRO-AGENTE · HOJA: R3 · analítica
  ATRIBUTOS: balance:EstadoDerivado, resultado:EstadoDerivado
  METODOS:  narrar(estados):Lenguaje
  REGLA: traduce balance/resultado al LENGUAJE del negocio cliente ("esto es lo que te ha pasado
         y lo que viene"). Lenguaje → juicio.
}
```

**Recuento verificado: 118 clases de dominio.** Grupo A 18 · B 6 · C 6 · D 13 · E 10 · F 4 · G 9 ·
H 4 · I 4 · J 8 · K 5 · L 7 · M 3 · N 8 · O 2 · P 4 · Q 4 · R 3 = **118**.

---

## 4 · Puertos abiertos (el entorno externo — cableado en el sitio, no aquí)

> Ningún acoplamiento tecnológico. Cada puerto declara **qué** cruza y **quién** lo aporta en el sitio.
> Los puertos se materializan como `Conversor` (frontera de formato) o `Puente` (canal con el vecino).

| # | Puerto | Clase que lo expone | Qué cruza | Quién lo aporta |
|---|---|---|---|---|
| 1 | **Hechos de las verticales** | `PuertoEventoVertical` A1 + `ContratoHechoMinimo` A11 | hechos ya emitidos por cada negocio | la vertical FUENTE (contabilidad se adapta) |
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
| 13 | **Entrega al negocio (avisos/informes)** | `AvisoAlNegocio` R1 + `K2` | aviso/informe entregado | canal declarable |
| 14 | **Declaración de criterios** | `ColaDeclaracionesCriterio` K9 | criterios del jefe | el jefe (una sola cola) |
| 15 | **Ficha de producto / coste** | `FronteraFichaProducto` H2 | coste de cada negocio | el negocio; si falta, se crea |
| 16 | **Origen de nómina** | `PuertoNomina` G4 | datos de nómina | sistema de personal; si no existe, se crea |
| 17 | **Firma del asesor** | `FlujoFirma` L3 | marca revisado/firmado | el ASESOR (el sistema no firma) |
| 18 | **Decisión humana (dueño/asesor)** | `SolicitudDecision` (tipo) | decisiones declaradas | dueño / asesor |
| 19 | **Cruce pedido↔recepción** | `CruceFacturaRecepcion` N5 | pedidos y albaranes | el negocio (si no existe, se asume directo `[ABIERTO]`) |
| 20 | **Proveedor (confrontación de saldo)** | `EstadoCuentaProveedor` N4 | extracto confrontable | proveedor / dueño / asesor (`[ABIERTO]`) |

**20 puertos abiertos.** Cada uno es una frontera declarada: **ninguno nombra transporte, protocolo
ni motor.** Donde el dato no está declarado, el puerto queda `[ABIERTO]` y **se crea la pieza que falte**.

---

## 5 · Flujos del negocio

```
FLUJO 1 · HECHO → ASIENTO → LIBRO (el camino continuo, sin operador)
  [FUENTE] ─Puerto A1→ HechoCrudo ─A2→ Hecho ─A7 dedup→ A12 cobertura
      ├─ ContrapartidaAsistida A6.1 (propone) ─→ ReglaContrapartida A6.2 (fija) ─→ Asiento
      └─ dudoso → EncoladoExcepcion A8.1 → AvisoRevision A8.2 (el flujo NO se bloquea)
  Asiento ─B2 escritor-diario→ Libro ─B4 traza→ ─B3 mayor/balanza

FLUJO 2 · DOCUMENTO → DATO → ASIENTO (la entrada dura)
  [Doc externo] ─A4.2 puerto-documento→ CapturaDocumento A3
      → ExtraccionDato A4.1 (interpreta lo ilegible) → ControlCuadreDocumento A4.3
      → si descuadra → Cola A8.1 (NO se asienta mal); si cuadra → FLUJO 1

FLUJO 3 · CIERRE (dos niveles) → ESTADOS → FISCAL
  [jornada] CierreCaja (operación) · [mes] CierreEjercicio C4 → Apertura C5
      → Balance C1 · Resultados C2 → LiquidacionIva D1 → Modelo D2/D3 → GeneradorModelo D7
      → AcusePresentacion D13.  Si falta cobertura → AvisoCuadre C6 (no finge el cuadre).

FLUJO 4 · TESORERÍA (observa el dinero)
  [Extracto] ─E2→ ConciliacionBancaria E1 ─→ CuadreCobroPago E3
      ├─ no identificado → PartidaNoIdentificada E7 (juicio) → Regla E8 (fija)
      └─ desfase → PartidaConciliatoria E9 → InformeConciliacion E10
  SaldoTesoreria E4 → PrevisionCaja E5 → MotorAvisos K2

FLUJO 5 · REVISIÓN → FIRMA → EXPORTACIÓN (la medida maestra)
  Libro → VistaRevisable L2 → ControlCalidadMuestreo L8 (excepción + muestra)
      → CambioDesdeUltimaRevision L9 → RatificacionReglaAprendida L10 → AsientoAjuste B5
      → PuertoExportacion L1 → [asesor revisa y FIRMA] → FlujoFirma L3 → ExpedienteDocumental L7

FLUJO 6 · AVISO → ENTREGA (proactiva, requisito 4)
  señales (A8.2 · C6 · D6 · E5 · J4) → MotorAvisos K2 (PRODUCE) → AvisoAlNegocio R1 (ENTREGA+CONFIRMA)
      → InformeAccionable R2 (qué hacer) · NarradorEstados R3 (lenguaje del negocio)

FLUJO 7 · CORRECCIÓN (cuatro planos, NO se confunden — conflicto ③)
  interno → AsientoAjuste B5  ·  del hecho → HechoRectificativo A13
  comercial → FacturaRectificativa O2  ·  fiscal → RectificacionDeclaracion D14
      mapa canónico: O2 puede provocar B5 y, si ya se declaró, D14 — TRES actos, no uno.
```

**7 flujos del negocio.**

---

## 6 · Decisión humana — `SolicitudDecision`

El sistema **NO firma y NO decide**. Cuando falta un dato, una regla es nueva, un documento no
cuadra o una obligación vence, emite una `SolicitudDecision` y **espera**. Si **vence**, expira y
**re-pregunta** — **jamás asume**.

| # | Punto de decisión | Se pide a | Qué decide | Clase que la emite |
|---|---|---|---|---|
| 1 | Documento ilegible / no cuadra | asesor · dueño · trabajador (`[ABIERTO]` A8.3) | resolver / reencolar / descartar | `EncoladoExcepcion` A8.1 · `AvisoRevision` A8.2 |
| 2 | Hecho incompleto | dueño (`[ABIERTO]` A6.3) | asienta provisional / espera / avisa | `ContrapartidaAsistida` A6.1 |
| 3 | Regla aprendida nueva | asesor | ratifica / bloquea **antes** de actuar sobre el volumen | `RatificacionReglaAprendida` L10 |
| 4 | Firma de la revisión | asesor | revisar / firmar (nivel: periodo/estado/documento — `[ABIERTO]`) | `FlujoFirma` L3 |
| 5 | Rectificación de una declaración | administración (vía asesor) | complementaria / sustitutiva | `RectificacionDeclaracion` D14 |
| 6 | Ajuste contable | asesor | sumar corrección (NUNCA borrar) | `AsientoAjuste` B5 |
| 7 | Declaración de criterios | jefe | fijar/ratificar TODOS los criterios | `ColaDeclaracionesCriterio` K9 |
| 8 | Criterios que cierran `[ABIERTO]` | jefe · asesor | `unidad_de_cierre` · período · amortización · reparto · dimensiones · tipos · consolidación | `ColaDeclaracionesCriterio` K9 (+B7·C7·E6·F5·J6·D11·I5) |
| 9 | Desatasco de la entrada | trabajador/automatización (`[ABIERTO]` Q66) | resolver/reencolar/descartar con motivo | `DesatascoEntrada` P3 |
| 10 | Confrontación de saldo con proveedor | dueño/asesor (`[ABIERTO]` Q43) | confirmar saldo | `EstadoCuentaProveedor` N4 |
| 11 | Aviso de cuadre que falla | dueño/asesor (`[ABIERTO]` Q70) | quién actúa | `AvisoCuadre` C6 |
| 12 | Emisión vs observación de factura | dueño (`[ABIERTO]` Q72, conflicto ④) | ¿el sistema emite o sólo observa? | `EmisionFacturaVenta` O1 |
| 13 | Umbrales de decisión del dueño | dueño (`[ABIERTO]` Q24) | caja mínima, deuda máxima | `Umbral` (tipo) + `PuenteLenguajeDueno` Q2 |
| 14 | Silla del cliente | dueño (conflicto ⑤ `[ABIERTO]`) | ¿negocio o dueño? ¿una silla o tres? | Q1/R1/J8 |

**14 puntos de decisión humana.** Todos son **solicitud**, no decisión: el sistema pregunta, no resuelve.

---

## 7 · Contratos (qué necesita cada clase y qué emite)

> Contrato = **necesidades** (entradas) y **emisiones** (salidas). **Sin transporte:** un contrato
> declara datos, no un canal. Los contratos se cumplen por puerto abierto, nunca por acoplamiento.

### 7.1 · Contratos por forma

| Forma | Necesita | Emite | Garantía |
|---|---|---|---|
| `Reflejo` | sólo datos ya almacenados (deriva) | un `Derivado` (valor/estado) | determinista — un test lo afirma |
| `MicroAgente` | una entrada ambigua + contexto declarado | una `Propuesta<Confianza>` | **propone**, nunca escribe |
| `Custodio` | escritor único identificado | el estado de su parcela | rechaza segundo escritor |
| `Conversor` | un `Externo` + forma declarada | un `Interno` | frontera única; reversible si se declara |
| `Puente` | un canal declarado | un evento/aviso | no impone; no pisa lo manual |

### 7.2 · Contratos clave de la cadena

- **`EscritorDiario` B2 recibe:** `Asiento{apuntes:Set<Apunte>, clave_natural:ClaveNatural, fecha,
  sociedad, traza}` · **emite:** `Resultado<aceptado|rechazado>`. **Rechaza** si Σ debe ≠ Σ haber.
- **`CompletitudCobertura` A12 recibe:** `esperados` + `llegados` · **emite:** `Cobertura` (**la
  única**). `SelloCobertura` Q3, `AvisoCuadre` C6 y `TasaCoberturaEntrada` P4 **la LEEN** — no la
  recalculan (conflicto ② resuelto).
- **`ContratoHechoMinimo` A11 recibe:** `declarar(f:FuenteVertical, campos)` · **emite:**
  `Contrato`. **Cara vista desde la fuente**: un mínimo declarado, no un formato impuesto.
- **`MaestroTerceros` N1 recibe:** `Tercero{nif, roles}` · **emite:** ficha única. `PadronTerceros`
  N2 es su **faceta de identidad** — **un solo maestro con roles** (conflicto ① resuelto).
- **`FlujoFirma` L3 recibe:** `firmar(asesor, ambito, marca)` · **emite:** `MarcaEstado`.
  **El sistema nunca firma**; sin firma viva, el estado **expira** y se re-pregunta.
- **`FronteraPlanos` M1 recibe:** cualquier salida · **emite:** `bool` de conformidad. **Sólo
  cálculos**; un hecho de negocio a la salida = fallo.
- **Cualquier `Custodio` recibe:** `escribir(...)` de un escritor · **emite:** estado.
  `SingleWriter` M2 es la ley que lo gobierna.

---

## 8 · Invariantes / determinismo (las 14)

| # | Invariante | Dónde vive en el diseño |
|---|---|---|
| 1 | **La partida doble cuadra**: Σ debe = Σ haber; un descuadre es **ERROR**, no estado | `EscritorDiario` B2 (rechaza) · `BalanceSituacion` C1 (ACTIVO = PASIVO + PATRIMONIO) |
| 2 | **Un hecho = un asiento** (idempotencia por clave natural) | `DeduplicacionHecho` A7 · `ClaveNatural` M3 |
| 3 | **El asiento original no se borra; la corrección SUMA** (append-only) | `AsientoAjuste` B5 · `TrazaAsiento` B4 · `CierreEjercicio` C4 |
| 4 | **Un solo escritor por parcela** (segundo escritor = corrupción) | `SingleWriter` M2 · todos los `Custodio` |
| 5 | **La ley entra como DATO**: tipos, plazos, coeficientes, calendario y formatos son `ParametroDeclarable` — ninguna constante legal en la lógica | `CalendarioFiscal` D6 · `PerfilAdministrativo` D15 · `PlanAmortizacion` F2 · `ValoracionExistencia` H1 · `CosteIndirecto` J5 |
| 6 | **El sistema NO firma y NO decide**: la firma es del asesor; vence → expira y re-pregunta, jamás asume | `FlujoFirma` L3 · `SolicitudDecision` · las 14 decisiones humanas |
| 7 | **Dato ausente = desconocido / `[ABIERTO]`**: nada se estima | 23 hojas `[ABIERTO]` · 72 preguntas abiertas · `SolicitudDecision` |
| 8 | **Una sola métrica de cobertura** (las demás la LEEN) | `CompletitudCobertura` A12 (produce) → A12/Q3/C6/P4 (leen) |
| 9 | **Los negocios no se fugan** (aislamiento) | `AislamientoNegocio` I4 · `AccesoNomina` G7 |
| 10 | **Los registros inmutables solo crecen** | `TrazaAsiento` B4 · `RegistroVerifactu` D8 · `ExpedienteDocumental` L7 · `HistorialProcesoContable` P2 |
| 11 | **Frontera única de formatos** | los 7 `Conversor`: A2 · A4.2 · B6 · D9 · E2 · H2 · L1 |
| 12 | **El cierre es irreversible salvo ajuste** | `CierreEjercicio` C4 (`reabrir(solo_con:AsientoAjuste)`) |
| 13 | **El mínimo se declara, no se estima** | `ContratoHechoMinimo` A11 · `ColaDeclaracionesCriterio` K9 |
| 14 | **Contabilidad observa los hechos y produce SUS documentos**; no produce los hechos que observa | `FronteraPlanos` M1 · `EmisionFacturaVenta` O1 (documento propio) |

**14 invariantes reflejadas, todas con clase que las sostiene.**

---

## 9 · Reparto 32/32/22/32 (la partición decidida — declarada, no reabierta)

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

## 10 · Preguntas abiertas `[ABIERTO]`

### 10.1 · Las 23 hojas `[ABIERTO]` (tienen clase y puerto; su CONTENIDO no se estima)

| Hoja | Clase / puerto | Qué falta declarar |
|---|---|---|
| A6.3 `regla-hecho-incompleto` | `ContrapartidaAsistida` A6.1 | ¿asienta provisional / espera / avisa? |
| A8.3 `dueno-cola-revision` | `EncoladoExcepcion` A8.1 | ¿quién resuelve la cola: asesor, dueño o trabajador? |
| A10 `catalogo-puertos-documento` | Puerto #2 | ¿qué fuentes/canales declara cada negocio? |
| B7 `criterio-clave-asiento` | `ClaveNatural` M3 · `ColaDeclaracionesCriterio` K9 | se cierra con `unidad_de_cierre` |
| C7 `criterio-periodo` | `Periodificacion` C3 · K9 | `momento_de_uso` / `unidad_de_cierre` |
| D10 `alcance-fiscal` | `PerfilAdministrativo` D15 | ¿hasta dónde llega la capa fiscal? |
| D11 `parametros-fiscales` | `PerfilAdministrativo` D15 · K9 | bases/tipos fiscales |
| E6 `politica-cobro-pago` | `PrevisionCaja` E5 · K9 | plazos que declara el negocio |
| E12 `diferencia-cambio` | `MaestroCuentasBancarias` E11 | se activa SÓLO si hay multi-moneda |
| F5 `parametros-amortizacion` | `PlanAmortizacion` F2 · K9 | métodos/coeficientes |
| G5 `calculo-nomina` | `PuertoNomina` G4 | ¿calcula o sólo recibe el hecho? |
| H5 `coste-consumo` | `FronteraFichaProducto` H2 | `fuente_coste_consumo` |
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

### 10.2 · Los 7 conflictos de validación cruzada — **ya decididos por el dueño; NO se reabren**

| # | Conflicto | **Decisión tomada** (documentada como decidida) | Clase que la materializa |
|---|---|---|---|
| ① | Dos maestros de terceros (N1 vs N2) | **Un solo maestro con roles** (cliente/proveedor/ambos) | `MaestroTerceros` N1 + `PadronTerceros` N2 (faceta identidad) |
| ② | Tres señales de cobertura (A12 · Q3 · C6) | **Una sola métrica**; las tres son sus vistas | `CompletitudCobertura` A12 (produce) → Q3/C6/P4 (leen) |
| ③ | Cuatro caminos de corrección (B5 · A13 · O2 · D14) | **Cuatro planos distintos** ligados por mapa canónico; TRES actos, no uno | `AsientoAjuste` B5 · `HechoRectificativo` A13 · `FacturaRectificativa` O2 · `RectificacionDeclaracion` D14 |
| ④ | Observadora que emite factura (O1) | **Contabilidad SÍ emite la factura de venta** (es su documento) | `EmisionFacturaVenta` O1 |
| ⑤ | La silla del cliente: ¿negocio o dueño? | **Sin declarar** → se sirve según la silla; `[ABIERTO]` (Q35) | Q1 · J8 · R1 |
| ⑥ | Trabajador humano vs automatización | **Sin declarar** (Q66 raíz); si es humano y concurrente, choca con M2 | `DesatascoEntrada` P3 · `SingleWriter` M2 |
| ⑦ | `diferencia-cambio` E12 depende de multi-moneda | **Latente** hasta que el dueño declare multi-moneda (Q20) | `MaestroCuentasBancarias` E11 |

### 10.3 · Las 72 preguntas abiertas de F2 (íntegras — guion de la conversación siguiente)

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

### 10.4 · Lo que ESTE diseño destapa (nuevas `[ABIERTO]` dirigidas al dueño — no se fusiona nada)

> Regla de la unidad: si el diseño sugiere que dos hojas podrían ir juntas, **NO se fusionan**; se
> declara `[ABIERTO]` y decide el dueño. Ninguna se ha fusionado.

1. **`[ABIERTO]` — N1 `maestro-terceros` vs N2 `padron-terceros`.** El diseño las mantiene como
   **dos clases** (dos facetas del mismo maestro: ficha funcional + identidad por número fiscal) y las
   ata por `Tercero{roles}`. **¿Debe el dueño fusionarlas en UNA clase?** Decisión del conflicto ①
   tomada (*un solo maestro con roles*) ya las hace coherentes, pero la **fusión de clase** es del dueño.
2. **`[ABIERTO]` — N6 `vencimiento-pago` vs N8 `antiguedad-de-saldos`.** Simétricas (pago/cobro) sobre
   el mismo tipo `Vencimiento`. Se mantienen **dos clases** porque la hoja atómica no se trocea ni se
   agrupa. **¿Una sola lógica de vencimientos con dos lados?**
3. **`[ABIERTO]` — el tipo `Vencimiento` es TRANSVERSAL** a N6, N8 y E5 `prevision-caja`. Se declara
   como **tipo de soporte**, no como clase: no pertenece a ninguna hoja. ¿Confirma el dueño el molde?
4. **`[ABIERTO]` — `MarcaEstado` (Q4) LEE `FlujoFirma` (L3) y `TrazaAsiento` (B4).** El diseño deriva
   el estado sin almacenarlo; ¿quiere el dueño un **almacén de marca por dato** o derivación pura?
5. **`[ABIERTO]` — `SolicitudDecision` es un TIPO, no una hoja.** Catorce puntos de decisión humana
   lo comparten. ¿Se declara puerto propio para la decisión, o cada clase gestiona la suya?
6. **`[ABIERTO]` — 20 puertos abiertos.** Ninguno tiene formato declarado; los "cablea el sitio".
   ¿Cuáles entran en la **primera entrega** (relacionado con §Q12/K7)?

---

## 11 · Verificación de la REGLA DE LA UNIDAD (auto-test del diseño)

- **118 clases de dominio** — una por cada hoja atómica del árbol §1 de `esquema.md`.
- **Ninguna hoja sin clase:** recuento por grupo A 18 · B 6 · C 6 · D 13 · E 10 · F 4 · G 9 · H 4 ·
  I 4 · J 8 · K 5 · L 7 · M 3 · N 8 · O 2 · P 4 · Q 4 · R 3 = **118** = el total del esquema.
- **Ninguna clase fusiona dos hojas:** donde el diseño vio parentesco (N1/N2 · N6/N8 · tipos
  transversales), **declaró `[ABIERTO]`** y no fusionó (§10.4).
- **Todas las formas respetadas:** 60 `Reflejo` · 29 `Custodio` · 14 `Puente` · 8 `MicroAgente` ·
  7 `Conversor` — **idéntico** al recuento de `pasada-diseccion.md`. Cero reclasificaciones.
- **26 tipos de soporte** (value objects), nombrados aparte con su porqué — ninguno es hoja.
- **CERO TECNOLOGÍAS:** no se nombra ningún motor, transporte, lenguaje, canal ni formato concreto.
  Todo el entorno externo cruza por **puerto abierto** (§4). Lo no declarado es `[ABIERTO]`.

> **FIN DEL DISEÑO.** Fase 3 · PLASMA lista. Siguiente: **F3b** (`plan-construccion.md`) — ordenar
> las 118 clases en oleadas por vertical y declarar a qué vertical pertenece cada una.
