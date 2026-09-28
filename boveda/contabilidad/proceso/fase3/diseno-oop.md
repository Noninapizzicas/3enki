# Diseño OOP — Sistema CONTABILIDAD (Fase 3 · PLASMA)

> **Fase:** 3 · PLASMA (planificar-construccion) · **Vertical:** `contabilidad`
> **Entrada:** el árbol maestro de la FASE 2 (`fase2/esquemas/esquema.md`, 118 hojas atómicas +
> 23 `[ABIERTO]` + 3 SPAWN + 3 REF), la **FORMA** de cada hoja (`fase2/esquemas/pasada-diseccion.md`:
> 60 REFLEJO · 29 CUSTODIO · 14 PUENTE · 8 MICRO-AGENTE · 7 CONVERSOR) y las decisiones ya tomadas
> (`fase2/preguntas-respondidas-legislacion-es.md`, `fase0-identidad-contabilidad.json`).
> **Sujeto (F0):** capacidad transversal **observadora VENDIBLE** — la vertical que le falta a las demás
> verticales para llevar la contabilidad de cada cual. **No produce hechos de negocio: observa y
> reconstruye.** Emite **CÁLCULOS**.
> **Medida maestra:** que **el asesor la acepte y pueda presentarla** — cuadra sin una persona
> digitando, sin colapsar y sin entrar en bucle.
>
> ## ⚠️ AVISO DE PLASMA — CERO TECNOLOGÍAS
> **Este diseño está pensado SIN CONOCER LA PLATAFORMA.** No se nombra ni se presupone ninguna
> tecnología, motor, lenguaje, canal, transporte, almacén, framework, plataforma ni producto.
> Todo el entorno externo (documentos, extractos, parámetros fiscales, canal de avisos, entrega al
> negocio, conservación de la prueba) entra por **PUERTO ABIERTO**, cableado en el sitio de
> despliegue, nunca acoplado a un proveedor concreto.
> Los **grupos A–R del árbol NO son unidades de construcción**: son **dominio**. Aquí el dominio se
> traduce a **CLASES**. La traducción a la plataforma es de la **FASE 3b** (adaptador). **Esta fase
> solo PIENSA: diseña el QUÉ, no el CÓMO.**
>
> **Ley de cero supuestos:** lo no declarado es **parámetro declarable** o **pregunta abierta**,
> **nunca** una constante inventada. **Dato ausente = desconocido / `[ABIERTO]`.**
> **Cero juicio automático:** el sistema calcula y transporta de forma determinista; el dueño y el
> asesor deciden a través de `SolicitudDecision`.

---

## Índice

| # | Eje de dominio | Clases |
|---|---|---|
| 0 | Clases de soporte (tipos del dominio) + cerrojos M | 17 soporte + M1·M2·M3 |
| 1 | El hecho y su admisión (la entrada) | 15 |
| 2 | El tercero con roles | 8 |
| 3 | La cuenta y el asiento (partida doble) | 6 |
| 4 | El libro (diario · mayor · balanza) | 3 |
| 5 | El periodo y el cierre (2 niveles) | 3 |
| 6 | Los estados (balance · resultados) | 3 |
| 7 | El impuesto y el modelo (parámetros declarables) | 13 |
| 8 | La tesorería y la conciliación | 10 |
| 9 | El inmovilizado y la amortización | 4 |
| 10 | El personal | 9 |
| 11 | Las existencias valoradas | 4 |
| 12 | El grupo y la consolidación | 4 |
| 13 | La analítica | 8 |
| 14 | La factura (emisión + rectificativa) | 2 |
| 15 | La cola de revisión (2 colas) | 3 |
| 16 | El aviso | 2 |
| 17 | La cobertura (métrica única) y el control del proceso | 6 |
| 18 | La exportación al asesor y las caras de consulta/entrega | 15 |
| | **TOTAL** | **118 clases** |

---

## 0 · Clases de soporte (tipos del dominio, no hojas del árbol)

```text
CLASE Hecho {                        // LA unidad que el sistema observa — nunca la produce
    claveNatural: ClaveNatural       // identidad idempotente: "un cierre = un asiento"
    fuente: IdVertical | IdDocumento // de quién viene (vertical o documento)
    claseHecho: VENTA | COBRO | PAGO | COMPRA | CONSUMO_STOCK | CIERRE_JORNADA | NOMINA | RECTIFICATIVO | [ABIERTO]
    fechaOperacion: Fecha            // cuándo ocurrió
    fechaValor: Fecha | [ABIERTO]    // cuándo vale (≠ operación: periodificación C3)
    tercero: IdTercero | [ABIERTO]
    lineas: List<LineaHecho>
    impuestos: List<CuotaImpuesto>   // tipo y base por línea
    formaPago: FormaPago | [ABIERTO]
    documentoOrigen: IdDocumento | [ABIERTO]
    estado: CRUDO | NORMALIZADO | ASENTADO | EN_COLA | DESCARTADO
    REGLA: el hecho llega de FUERA. El sistema lo admite, lo normaliza y lo asienta; nunca lo inventa.
}

CLASE LineaHecho {
    producto: IdProducto | [ABIERTO]
    cantidad: Decimal, precioUnitario: Importe, tipoImpuesto: TipoImpuesto | [ABIERTO]
    centroAnalitico: IdDimension | [ABIERTO]   // se hidrata en J1
}

CLASE Asiento {                      // el hecho ya reconstruido a partida doble
    claveNatural: ClaveNatural
    fechaContable: Fecha, periodo: IdPeriodo
    apuntes: List<Apunte>
    sociedad: IdSociedad | [ABIERTO] // marca-sociedad I1
    origen: IdHecho | IdDocumento | AJUSTE | APERTURA | CIERRE | AMORTIZACION | PROVISION
    ajusteDe: IdAsiento | [ABIERTO]  // si corrige, apunta al original (no lo borra)
    REGLA INVARIANTE: Σ debe = Σ haber. Un asiento descuadrado es un error, no un estado.
}

CLASE Apunte {
    cuenta: IdCuenta, debe: Importe, haber: Importe
    tercero: IdTercero | [ABIERTO]   // mayor auxiliar (N3)
    centroAnalitico: IdDimension | [ABIERTO]
}

CLASE Cuenta {
    codigo: IdCuenta, nombre: Texto, naturaleza: ACTIVO|PASIVO|PATRIMONIO|INGRESO|GASTO
    admitidaAnalitica: Bool | [ABIERTO]
}

CLASE Tercero {                      // el tercero ÚNICO con roles (conflicto ① resuelto)
    idTercero: Id, nif: NIF          // identidad fiscal única (N2)
    nombreFiscal: Texto, direccion: Texto | [ABIERTO]
    roles: Set<CLIENTE|PROVEEDOR|EMPLEADO|ACREEDOR|BANCO>   // un tercero puede ser varios
    condicionesPago: CondicionesPago | [ABIERTO]
    moneda: Moneda | [ABIERTO]
    REGLA: UN solo maestro; los roles son facetas. Un tercero cliente+proveedor NO se duplica.
}

CLASE ClaveNatural {
    componentes: List<Texto>         // p.ej. {vertical, unidad_de_cierre} — declarable (M4)
    REGLA INVARIANTE: mismos componentes ⇒ mismo hecho ⇒ mismo asiento. Reprocesar no duplica.
}

CLASE Periodo { idPeriodo: Id, tipo: DIA|MES|TRIMESTRE|ANIO, desde: Fecha, hasta: Fecha, estado: ABIERTO|CERRADO }

CLASE MovimientoBancario {
    idMovimiento: Id, cuentaBancaria: IdCuentaBancaria, fecha: Fecha, importe: Importe (signo), moneda: Moneda
    descripcion: Texto, contrapartida: IdAsiento | NINGUNA
}

CLASE Importe { valor: Decimal, moneda: Moneda, REGLA: la aritmética entre monedas exige tipo de cambio declarado (E14). }

CLASE ParametroDeclarable<T> {       // EL MOLDE DE LA LEY COMO DATO
    clave: Texto, valor: T | AUSENTE, vigenteDesde: Fecha, vigenteHasta: Fecha | AUSENTE
    declaradoPor: Rol (DUENO | ASESOR | JEFE), ratificado: Bool | [ABIERTO]
    REGLA INVARIANTE: ningún valor legal, tipo, plazo, coeficiente o formato vive en la lógica.
                     Todo valor es un ParametroDeclarable; si no está declarado → AUSENTE → [ABIERTO].
}

CLASE ResultadoCalculo<V> { valor: V | INDETERMINADO, base: List<IdAsiento|IdHecho>, cobertura: Cobertura, estado: BORRADOR|REVISADO|FIRMADO }

CLASE Cobertura {                    // MÉTRICA ÚNICA (conflicto ② resuelto)
    esperados: Set<ClaveHecho>, recibidos: Set<ClaveHecho>, huecos: Set<ClaveHecho>, tasa: Decimal
    REGLA: EXISTE UN SOLO CALCULADOR de cobertura (A12). Q3, P4 y C6 son VISTAS de esta misma métrica.
}

CLASE Aviso { clase: CATALOGO[], destinatario: Rol, contenido: ResultadoCalculo, estado: PRODUCIDO|ENTREGADO|CONFIRMADO }

CLASE Excepcion {                    // lo que la automatización no resolvió sola
    idExcepcion: Id, motivo: ILEGIBLE|NO_CUADRA|DUPLICADO|SIN_REGLA|INCOMPLETO|SIN_CONTRAPARTIDA
    hecho: IdHecho | IdDocumento, cola: ASESOR | DUENO, estado: ABIERTA|RESUELTA|DESCARTADA
    resolucion: ContrapartidaDecision | Motivo | [ABIERTO]
}

CLASE ReglaDeclarada {               // "este proveedor → esta cuenta" — declarada o APRENDIDA y RATIFICADA
    condicion: Predicado, accion: Contrapartida, origen: DECLARADA | APRENDIDA
    ratificadaPor: Rol | PENDIENTE          // L10 — una regla aprendida NO actúa sobre el volumen sin ratificar
    escritorUnico: Rol
}

CLASE SolicitudDecision {            // vehículo de TODA decisión humana
    tipo: DECLARAR_CRITERIO | RESOLVER_EXCEPCION | RATIFICAR_REGLA | DECLARAR_PARAMETRO | CONFIRMAR_INFORME | AUTORIZAR_EJECUCION
    contexto: Documento              // paquete autocxplicado (cálculo + base + cobertura + estado)
    estado: PENDIENTE | RESUELTA | EXPIRADA
    resolucion: Aprobar | Rechazar | Corregir | [ABIERTO]
    REGLA INVARIANTE: el sistema NUNCA resuelve una SolicitudDecision; solo la crea y la entrega.
                      Si vence sin respuesta → EXPIRADA y se re-pregunta; jamás asume.
}
```

### Cerrojos transversales (grupo M · las invariantes hechas clase)

```text
CLASE M1_FronteraPlanos {            // FORMA: REFLEJO
    ATRIBUTOS: emisiones: Set<ContratoEmitido>
    MÉTODOS: verificar(emision) -> ok | ERROR_FUGA
      PRECONDICION: el contrato emitido empieza por el espacio de CÁLCULOS.
      POSTCONDICION: si un contrato pretende ser un HECHO de negocio → rechazo determinista.
    REGLA INVARIANTE: el sistema emite CÁLCULOS; jamás realimenta la operación con hechos.
}

CLASE M2_SingleWriter {              // FORMA: CUSTODIO — la ley que gobierna a todo custodio
    ATRIBUTOS: parcelaEscritor: Map<IdParcela, Rol>
    MÉTODOS: autorizar(parcela, rol) -> ok
             escribir(parcela, rol, cambio) -> ok | ERROR_DOS_ESCRITORES
    REGLA INVARIANTE: UN único escritor por parcela. Dos escritores = corrupción esperando turno.
                      Ningún custodio escribe si no es el rol autorizado de su parcela.
}

CLASE M3_ClaveNatural {              // FORMA: REFLEJO
    ATRIBUTOS: criterio: ClaveNatural   // cuelga de `unidad_de_cierre` (M4/declarable)
    MÉTODOS: calcular(hechoODocumento) -> ClaveNatural
             esRepeticion(clave, yaAsentados) -> Bool    // idempotencia
    REGLA INVARIANTE: reprocesar no duplica. Test unitario lo afirma.
}
```

---

## 1 · EJE: EL HECHO Y SU ADMISIÓN — la puerta (**ESLABÓN LIMITANTE**)

> El sistema **no produce** los hechos que observa: los **admite**. Esta puerta es el cuello porque
> es continua, heterogénea y con juicio, y porque la asimetría con la fuente obliga a **adaptar sin
> obligar**. Cada clase respeta la FORMA ya disecada.

```text
CLASE A1_PuertoEventoVertical {      // FORMA: PUENTE
    ATRIBUTOS: fuenteConectada: IdVertical | NINGUNA
    MÉTODOS: admitirHecho(hecho: Hecho) -> ok
             reconectar(fuente) -> ok        // el puerto es reemplazable, la fuente manda
    REGLA: conecta con la fuente por SEÑAL; contabilidad **lee, no impone**. La vertical emite a su
           manera y su ritmo; este puerto solo recibe. Si no hay fuente → se DECLARA (A15), no se fuerza.
}

CLASE A2_NormalizadorHecho {         // FORMA: CONVERSOR
    ATRIBUTOS: contratoMinimo: ContratoHechoMinimo (A11), formaInterna: Hecho
    MÉTODOS: homogeneizar(hechoCrudo: HechoCrudo) -> Hecho
             mapear(camposFuente, camposInternos) -> Hecho
             detectarFaltantes(hecho) -> Set<Campo>       // → A6.3 / A8.1
    REGLA: ÚNICA puerta de formato. Homogeneiza el hecho de cualquier fuente a forma asentable.
           Lo que falta no se rellena: se marca como campo ausente → excepción o pregunta.
}

CLASE A3_CapturaDocumento {          // FORMA: REFLEJO
    ATRIBUTOS: documento: Documento
    MÉTODOS: admitir(documento) -> DocumentoAdmitido
             validarCampos(documento) -> ok | ERROR_DOCUMENTO_VACIO
    REGLA: admite el documento (llegado o digitalizado) y comprueba su integridad mecánica. Cero
           juicio. Un documento vacío o sin formato reconocible se rechaza con error determinista.
}

CLASE A41_ExtraccionDato {           // FORMA: MICRO-AGENTE (fuzzy)
    ATRIBUTOS: documentoAdmitido: DocumentoAdmitido, planDeclarado: CatalogoCuentas (B1)
    MÉTODOS: abrir(documento) -> ContenidoInterpretable
             extraer(contenido) -> List<CampoExtraido>   // importes, fechas, tercero, líneas, impuestos
             confianza() -> Grado
    REGLA: abrir un documento NO estructurado y volverlo dato es INTERPRETAR (lenguaje/ambigüedad).
           Cuando la confianza no alcanza el umbral declarado → excepción a cola (A8.1), no se asienta.
           Un documento YA estructurado entra sin este juicio (por A5).
}

CLASE A42_PuertoDocumento {          // FORMA: CONVERSOR
    ATRIBUTOS: formasDeclarables: Set<FormaDocumento> | catalogo declarable (A10)
    MÉTODOS: leer(formatoOrigen) -> DocumentoAdmitido
             registrarForma(forma) -> ok
    REGLA: frontera de las formas declarables del documento. Un adaptador por forma, puesto en el
           sitio de despliegue. Si falta una forma, SE CREA (invariante de puerto abierto).
}

CLASE A43_ControlCuadreDocumento {   // FORMA: REFLEJO
    ATRIBUTOS: campos: List<CampoExtraido>
    MÉTODOS: cuadrar(campos) -> Cuadrado | Descuadre            // Σ bases + Σ impuestos = total
             tolerancia() -> Importe | declarable
    REGLA: si importe+impuestos no cuadran → excepción a cola (A8.1). Determinista, un test lo afirma.
           Nunca se asienta mal "casi cuadrado".
}

CLASE A5_PuertoDocumentoDigital {    // FORMA: PUENTE
    ATRIBUTOS: canalDigital: CanalDeclarable | [ABIERTO]
    MÉTODOS: recibir(entregaDigital) -> DocumentoAdmitido
             suscribir(canal) -> ok
    REGLA: recepción digital declarable (buzón, intercambio, carpeta — el CANAL es un puerto).
           El documento digital ya estructurado entra SIN extracción (no pasa por A4.1). Si el canal
           no existe → se crea; si falta la fuente → se declara (A15).
}

CLASE A61_ContrapartidaAsistida {    // FORMA: MICRO-AGENTE (fuzzy)
    ATRIBUTOS: hecho: Hecho, plan: CatalogoCuentas (B1), reglas: List<ReglaDeclarada> (A6.2), terceros: MaestroTerceros
    MÉTODOS: proponer(hecho) -> ContrapartidaPropuesta {cuenta, tercero, periodo}
             justificar(propuesta) -> Explicacion
    REGLA: PROPONE (juicio con ambigüedad contra el plan declarado). El corte DURO lo fija la REGLA
           (A6.2, custodio). Si ninguna regla cubre y la ambigüedad es alta → excepción (A8.1).
}

CLASE A62_ReglaContrapartida {       // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: reglas: Repositorio<ReglaDeclarada>, escritorAutorizado: Rol=DUENO/ASESOR
    MÉTODOS: declarar(rol, regla) -> ok
             aplicar(hecho) -> Contrapartida | SIN_COBERTURA
             aprender(rol, regla, evidencia) -> ok      // el aprendizaje entra HIDRATADO (desatasco/ratificación)
    REGLA: repositorio de reglas declaradas/aprendidas. UN solo escritor. Una regla APRENDIDA no actúa
           sobre el volumen hasta ser RATIFICADA (L10). El bucle: excepción resuelta → regla → menos excepciones.
}

CLASE A7_DeduplicacionHecho {        // FORMA: REFLEJO
    ATRIBUTOS: clave: ClaveNatural (M3), yaAsentados: Repositorio<ClaveNatural>
    MÉTODOS: esDuplicado(hecho) -> Duplicado | Nuevo
             marcarProcesado(clave) -> ok
    REGLA: aplica la clave natural del hecho/documento. Reprocesar NO duplica (anti-bucle). Determinista.
           Si el hecho es RECTIFICATIVO (A13), su clave apunta al original y NO se considera duplicado.
}

CLASE A9_LoteAdmision {              // FORMA: REFLEJO
    ATRIBUTOS: colaEntrada: Cola<Hecho>, paralelismo: Int | declarable
    MÉTODOS: lotear(cola) -> List<Hecho>        // N hechos en paralelo
             despachar(lote) -> ok
    REGLA: DESACOPLE del cuello: la admisión no se hace en serie. Programación mecánica, cero juicio.
           Es el empujón que abre "la entrada en serie atasca el embudo".
}

CLASE A11_ContratoHechoMinimo {      // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: minimoPorVertical: Repositorio<IdVertical, Set<Campo>>, escritorAutorizado: Rol=DUENO/JEFE
    MÉTODOS: declarar(rol, vertical, campos) -> ok
             exigir(vertical) -> Set<Campo>
             cubre(vertical, hecho) -> ok | Set<Campo> faltantes
    REGLA: el mínimo EXIGIBLE por fuente, **visto desde la fuente** (no un formato impuesto). Lo declara
           el dueño/jefe. Un hecho que no lo cumple → incompleto (A6.3) o excepción.
}

CLASE A13_HechoRectificativo {       // FORMA: PUENTE
    ATRIBUTOS: hechoOriginal: ClaveNatural, signo: CORRIGE | ANULA
    MÉTODOS: emparejar(rectificativo, original) -> ok | ERROR_ORIGINAL_NO_HALLADO
             emitir(hecho, ajuste) -> señal al libro (B5)
    REGLA: conecta el hecho posterior que corrige/anula uno anterior POR SU CLAVE NATURAL (M3).
           NO BORRA: AÑADE. Espejo de B5 del lado del hecho (plano 2 de los 4 planos de corrección).
}

CLASE A14_AnclajeCierreVertical {    // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: unidadPorVertical: Repositorio<IdVertical, DefinicionCierre>, escritorAutorizado: Rol=DUENO
    MÉTODOS: declarar(rol, vertical, definicion) -> ok    // qué es "un cierre" y cómo se identifica
             anclar(vertical, hecho) -> ClaveNatural
    REGLA: declara POR FUENTE qué es un cierre y cómo se identifica. Ancla la clave natural (M3).
           Su CONTENIDO pende de `unidad_de_cierre` (M4, [ABIERTO]). Si la fuente no lo declara → la
           clave queda incompleta y el hecho va a cola; no se inventa una unidad.
}

CLASE A15_DeclaracionFuenteFaltante { // FORMA: PUENTE
    ATRIBUTOS: esperado: ClaveHecho, recibido: Bool (vía A12)
    MÉTODOS: detectarHueco(cobertura) -> Hueco               // reflejo interno
             declarar(hueco) -> señal de aviso (K2) + marca [ABIERTO]
    REGLA: si una fuente NO publica un hecho que se necesita, se DECLARA el hueco (abierto + aviso).
           NUNCA se obliga a la fuente a producirlo. (Empujón: "la vertical no publica ciertos hechos".)
}
```

---

## 2 · EJE: EL TERCERO CON ROLES

```text
CLASE N1_MaestroTerceros {           // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: terceros: Repositorio<IdTercero, Tercero>, escritorAutorizado: Rol=DUENO/ASESOR
    MÉTODOS: declarar(rol, tercero) -> ok
             ficha(idTercero) -> Tercero
             historial(idTercero) -> List<IdAsiento|IdDocumento>
             anadirRol(idTercero, rol) -> ok         // cliente, proveedor, empleado… un tercero, varios roles
    REGLA: ficha ÚNICA de cliente/proveedor (identificación fiscal, condiciones, historial). Un solo
           escritor. Un mismo tercero cliente y proveedor NO se duplica (conflicto ① resuelto: un maestro
           con dos facetas, N1 ficha + N2 identidad).
}

CLASE N2_PadronTerceros {            // FORMA: CUSTODIO (misma parcela que N1)
    ATRIBUTOS: porNIF: Repositorio<NIF, IdTercero>, escritorAutorizado: Rol=SISTEMA (unificación) + DUENO
    MÉTODOS: identificar(nif, nombreFiscal) -> IdTercero    // "un proveedor escrito de tres formas = uno"
             unificar(idA, idB, evidencia) -> IdTercero
    REGLA: índice de IDENTIDAD por número fiscal. Es la faceta de identidad del MISMO maestro (N1); no
           un segundo maestro. Dos escritores sobre la identidad = terceros contradictorios = prohibido.
}

CLASE N3_CuentaProveedor {           // FORMA: REFLEJO
    ATRIBUTOS: idTercero: IdTercero, libro: Libro (B3)
    MÉTODOS: facturasVivas(idTercero) -> List<IdAsiento>
             saldo(idTercero) -> Importe
    REGLA: mayor AUXILIAR del tercero, DERIVADO del libro (nunca almacén paralelo). Cada factura viva y su saldo.
}

CLASE N4_EstadoCuentaProveedor {     // FORMA: REFLEJO
    ATRIBUTOS: idTercero, auxiliar: CuentaProveedor (N3), vencimientos (N6)
    MÉTODOS: extracto(idTercero, desde, hasta) -> DocumentoConfrontable
    REGLA: extracto confrontable con el tercero (conciliación de saldos). Derivación determinista. Quién
           confirma el saldo (dueño o asesor) es declarable, no una decisión del sistema.
}

CLASE N5_CruceFacturaRecepcion {     // FORMA: REFLEJO
    ATRIBUTOS: pedido: IdPedido | [ABIERTO], recepcion: IdRecepcion, factura: Documento
    MÉTODOS: cotejar(pedido, recepcion, factura) -> Cuadra | Descuadre
    REGLA: coteja pedido ↔ recepción ↔ factura ANTES de asentar. Lo que no cuadra → cola (A8.1).
           Determinista. Si el negocio no coteja (declarable) → se asienta directo, pero se declara.
}

CLASE N6_VencimientoPago {           // FORMA: REFLEJO
    ATRIBUTOS: factura: IdAsiento, condiciones: CondicionesPago (declarable), plazoLegal: ParametroDeclarable (D)
    MÉTODOS: calcularVencimiento(factura) -> Fecha
             estaVencido(factura, hoy) -> Bool
    REGLA: fecha de vencimiento por factura desde la política declarada (que respeta el plazo legal como
           PARÁMETRO, no como constante). Alimenta previsión de caja (E5) y avisos (K2).
}

CLASE N7_RappelProntoPago {          // FORMA: REFLEJO
    ATRIBUTOS: factura: IdAsiento, descuentos: List<Descuento>, anticipos: List<IdAsiento>
    MÉTODOS: ajustarCosteReal(factura) -> Importe        // a lo realmente pagado
    REGLA: descuentos/rappels/pronto-pago/anticipos ajustan el coste real de la compra. Cálculo
           determinista; el ajuste se asienta como suma (nunca borra, invariante de corrección).
}

CLASE N8_AntiguedadSaldos {          // FORMA: REFLEJO
    ATRIBUTOS: terceros: MaestroTerceros, vencimientos (N6), lado: POR_COBRAR | POR_PAGAR
    MÉTODOS: clasificarPorVencimiento(lado, hoy) -> AgingReport
    REGLA: espejo de N6 del lado del cobro: lo pendiente clasificado por vencimiento. Alimenta
           reclamación y política de cobro (E6). Cálculo puro.
}
```

---

## 3 · EJE: LA CUENTA Y EL ASIENTO (partida doble)

```text
CLASE B1_CatalogoCuentas {           // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: cuentas: Repositorio<IdCuenta, Cuenta>, escritorAutorizado: Rol=DUENO/ASESOR
    MÉTODOS: declarar(rol, cuenta) -> ok
             importar(rol, plan) -> ok
             resolver(codigo) -> Cuenta | NO_EXISTE
    REGLA: plan contable DECLARABLE/IMPORTABLE (lo aporta el negocio o el asesor). Un solo escritor.
           Se cierra con el criterio declarado (K9). No se inventa un plan por defecto.
}

CLASE B6_PuertoPlanContable {        // FORMA: CONVERSOR
    ATRIBUTOS: formatoDeclarado: FormaPlan | [ABIERTO]
    MÉTODOS: importar(origen) -> List<Cuenta>
             exportar(catalogo) -> DocumentoPlan
    REGLA: frontera de CODIFICACIÓN del plan (import/export). Único cruce de formatos del plan.
}

CLASE B2_EscritorDiario {            // FORMA: CUSTODIO (EL custodio del libro)
    ATRIBUTOS: asientos: Repositorio<ClaveNatural, Asiento>, escritorAutorizado: Rol=ADMISION (único)
    MÉTODOS: asentar(rol, asiento) -> ok | ERROR_DESCUADRE | ERROR_DUPLICADO
             registrarApertura(apertura) -> ok
             registrarCierre(cierre) -> ok
    REGLA: SINGLE-WRITER por parcela (M2). El libro tiene UN escritor. Verifica partida doble antes de
           aceptar. Rechaza duplicados por clave natural (M3). Es el punto donde el cuello entrega.
}

CLASE B4_TrazaAsiento {              // FORMA: CUSTODIO (append-only)
    ATRIBUTOS: traza: ListaAppendOnly<EntradaTraza>, escritorAutorizado: Rol=ESCRITOR_DIARIO
    MÉTODOS: anotar(quien, cuando, que) -> ok        // inmutabilidad
             consultar(claveNatural) -> EntradaTraza
    REGLA: registro INMUTABLE de quién y cuándo creó cada asiento. Solo crece; nunca se reescribe ni se borra.
}

CLASE B5_AsientoAjuste {             // FORMA: PUENTE
    ATRIBUTOS: asientoOriginal: ClaveNatural, ajuste: Asiento
    MÉTODOS: recibir(correccion: Asiento) -> señal al libro (B2)
             verificarNoBorrado() -> ok
    REGLA: el camino por el que la corrección del asesor ENTRA al libro SIN BORRAR. SUMAN, nunca borran.
           Traza intacta (requisito de auditoría). Es el plano 1 de los 4 planos de corrección.
}
```

---

## 4 · EJE: EL LIBRO (diario · mayor · balanza)

```text
CLASE B3_MayorBalanza {              // FORMA: REFLEJO
    ATRIBUTOS: diario: EscritorDiario (B2)
    MÉTODOS: saldoPorCuenta(periodo) -> Map<IdCuenta, Importe>
             balanza(periodo) -> Balanza                           // sumas y saldos
             movimientosDe(cuenta, periodo) -> List<Apunte>
    REGLA: los saldos se DERIVAN del diario (nunca almacén paralelo). Determinista; un test lo afirma.
           "El asiento original no se borra": la balanza refleja la suma de todo lo asentado.
}
```

---

## 5 · EJE: EL PERIODO Y EL CIERRE (2 niveles)

```text
CLASE C3_Periodificacion {           // FORMA: REFLEJO
    ATRIBUTOS: criterio: ParametroDeclarable (C7 → K9)
    MÉTODOS: imputarPeriodo(hecho) -> IdPeriodo
             conservarFechas(hecho) -> (fechaOperacion, fechaValor)
    REGLA: imputa cada hecho a su periodo con el CRITERIO DECLARADO. CONSERVA ambas fechas: no elige ni
           adivina. Determinista.
}

CLASE C4_CierreEjercicio {           // FORMA: CUSTODIO (un solo escritor — irreversibilidad)
    ATRIBUTOS: cierres: Repositorio<IdPeriodo, Cierre>, escritorAutorizado: Rol=CIERRE
    MÉTODOS: cerrar(periodo, ajustes) -> Cierre | ERROR_PERIODO_YA_CERRADO
             esIrreversible() -> Bool
    REGLA: cierra el periodo con ajustes. IRREVERSIBLE salvo por AJUSTE posterior (B5). Dos niveles de
           cierre (jornada/día del negocio · mes del asesor) según `unidad_de_cierre` (M4). Un solo escritor.
           Genera los hechos que produce el TIEMPO (amortización, periodificación) si están declarados (Q59).
}

CLASE C5_AperturaEjercicio {         // FORMA: REFLEJO
    ATRIBUTOS: cierreAnterior: Cierre (C4)
    MÉTODOS: generarApertura(cierreAnterior) -> List<Asiento>
             arrastrarSaldos() -> Balance
    REGLA: abre el ejercicio siguiente DESDE el cierre anterior. Cálculo determinista: los saldos de
           apertura son los de cierre. Nunca se inventan saldos de arranque.
}
```

---

## 6 · EJE: LOS ESTADOS (balance · resultados)

```text
CLASE C1_BalanceSituacion {          // FORMA: REFLEJO
    ATRIBUTOS: mayor: MayorBalanza (B3), inmovilizado: ValorNetoContable (F4), existencias: ValoracionExistencia (H1)
    MÉTODOS: componer(periodo) -> Balance {activo, pasivo, patrimonio}
             cuadrar() -> ok | ERROR_ACTIVO_NO_CUADRA
    REGLA: estado DERIVADO del mayor + valoraciones. Determinista. Un test lo afirma.
}

CLASE C2_CuentaResultados {          // FORMA: REFLEJO
    ATRIBUTOS: mayor (B3), analitica: MargenAnalitico (J2)
    MÉTODOS: componer(periodo) -> Resultado {ingresos, gastos, resultado}
    REGLA: estado DERIVADO (ingresos/gastos/resultado). Determinista. No se "arregla" un resultado:
           se explica con su base (L2) y su cobertura (Cobertura).
}

CLASE C6_AvisoCuadre {               // FORMA: PUENTE
    ATRIBUTOS: cobertura: Cobertura (métrica única), destinatario: Rol=ASESOR/DUENO
    MÉTODOS: evaluar(cierre) -> Cuadra | FaltaCobertura
             emitir(falta) -> señal de aviso (K2)
    REGLA: NO FINGE el cuadre. Si falta cobertura, AVISA. Es una VISTA de la métrica única (A12), no
           una segunda métrica (conflicto ② resuelto).
}
```

---

## 7 · EJE: EL IMPUESTO Y EL MODELO (parámetros declarables)

> Toda la capa fiscal es **REFLEJO** (cálculo determinista) sobre **parámetros declarables**. La ley
> entra como DATO (territorio, régimen, tipos, plazos, coeficientes), nunca como constante en la lógica.

```text
CLASE D1_LiquidacionIVA {            // FORMA: REFLEJO
    ATRIBUTOS: libro (B3), parametros: PuertoParametrosFiscales (D11)
    MÉTODOS: devengado(periodo) -> Importe
             soportado(periodo) -> Importe
             liquidar(periodo) -> Liquidacion {devengado, deducible, resultado}
    REGLA: deriva el impuesto indirecto del LIBRO con los tipos DECLARADOS (21/10/4 o IGIC/IPSI según
           territorio). No asume "IVA": asume impuesto indirecto declarable con su territorio.
}

CLASE D2_Modelo303 {                 // FORMA: REFLEJO
    ATRIBUTOS: liquidacion: LiquidacionIVA (D1), calendario: CalendarioFiscal (D6)
    MÉTODOS: construir(periodo) -> Modelo
    REGLA: construye la autoliquidación desde la liquidación. Cálculo; ningún plazo ni tipo cableado.
}

CLASE D3_Modelo390 {                 // FORMA: REFLEJO
    ATRIBUTOS: liquidaciones: List<LiquidacionIVA>, ejercicio: IdPeriodo
    MÉTODOS: resumirAnual(ejercicio) -> Modelo
    REGLA: resumen anual del impuesto indirecto. Determinista desde el libro/liquidaciones.
}

CLASE D4_Retenciones {               // FORMA: REFLEJO
    ATRIBUTOS: libro (B3), parametros: PuertoParametrosFiscales (D11)
    MÉTODOS: practicadas(periodo) -> Importe      // p.ej. profesionales / alquileres
             soportadas(periodo) -> Importe
    REGLA: retenciones calculadas con los porcentajes DECLARADOS (15 % profesional, 19 % alquiler,
           tablas de trabajo — todos parámetros). Nunca de memoria.
}

CLASE D5_EstimacionISIRPF {          // FORMA: REFLEJO
    ATRIBUTOS: resultado: CuentaResultados (C2), parametros: PuertoParametrosFiscales (D11)
    MÉTODOS: estimar(periodo) -> CuotaEstimada     // IS (sociedad) | IRPF (persona física) — declarable por sociedad
    REGLA: estimación del resultado fiscal con base declarada. El sujeto fiscal (IS/IRPF) es un parámetro.
           Un negocio puede ser los dos (formas mixtas): parámetro POR SOCIEDAD.
}

CLASE D6_CalendarioFiscal {          // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: plazos: Repositorio<IdPeriodo, List<Plazo>>, escritorAutorizado: Rol=ASESOR/DUENO
    MÉTODOS: declarar(rol, ejercicio, plazos) -> ok
             proximos(hoy) -> List<Plazo>
             dispararAviso(plazo) -> señal (K2)
    REGLA: plazos DECLARABLES por ejercicio (cambian: prórrogas, festivos, domiciliación). Un solo
           escritor. Dispara aviso proactivo; nunca fija una fecha de memoria.
}

CLASE D7_GeneradorModelo {           // FORMA: PUENTE
    ATRIBUTOS: modelo: Modelo, puerto: PuertoModeloFiscal
    MÉTODOS: generar(modelo) -> DocumentoModelo
             entregar(documento) -> ok        // salida al programa del asesor
    REGLA: salida al programa del asesor por PUERTO (formato ABIERTO y declarable). Si el sistema solo
           PREPARA (no presenta), aquí termina su responsabilidad; presentar es del asesor (declarable).
}

CLASE D8_RegistroVerifactu {         // FORMA: CUSTODIO (append-only, encadenado)
    ATRIBUTOS: registros: ListaAppendOnly<RegistroFactura>, escritorAutorizado: Rol=EMISION_FACTURA (O1)
    MÉTODOS: encadenar(factura) -> Huella         // huella + encadenamiento inalterable
             anotar(factura, huella) -> ok
             verificarCadena() -> ok | ERROR_CADENA_ROTA
    REGLA: registro INTERNO Y NO ALTERABLE de la facturación: huella, encadenamiento. Solo crece. Es
           distinto de la emisión (O1) y del formato estructurado (D9): tres cosas, no una.
}

CLASE D9_FacturaElectronica {        // FORMA: CONVERSOR
    ATRIBUTOS: formaEstructurada: FormaDeclarable | [ABIERTO]
    MÉTODOS: emitirEstructurada(factura) -> DocumentoEstructurado
             interpretarEstructurado(documento) -> Factura
    REGLA: frontera del FORMATO ESTRUCTURADO de la factura (recibir y emitir). Un solo cruce. Un
           documento estructurado entra SIN extracción (no pasa por A4.1).
}

CLASE D12_EstadoPresentacionFiscal { // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: obligaciones: Repositorio<IdObligacion, EstadoObligacion>, escritorAutorizado: Rol=SISTEMA+ASESOR
    MÉTODOS: avanzar(obligacion, estado) -> ok     // pendiente→generada→presentada→justificada→atrasada
             estadoDe(obligacion) -> EstadoObligacion
    REGLA: ciclo de vida de cada obligación. Sin él, el calendario avisa pero nadie sabe en qué punto
           está cada modelo. Un solo escritor.
}

CLASE D13_AcusePresentacion {        // FORMA: PUENTE
    ATRIBUTOS: acuse: Justificante, modelo: IdObligacion, asiento: IdAsiento
    MÉTODOS: recibir(justificante) -> ok
             ligar(acuse, modelo, asiento) -> ok       // cierra el bucle hacia fuera
    REGLA: recoge y LIGA el justificante/acuse que devuelve la administración a su modelo y a su
           asiento. Cierra el bucle hacia fuera. Si no llega el acuse → obligación no justificada → aviso.
}

CLASE D14_RectificacionDeclaracion { // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: rectificaciones: Repositorio<IdDeclaracion, Rectificacion>, escritorAutorizado: Rol=ASESOR
    MÉTODOS: rectificar(declaracionOriginal, tipo) -> Rectificacion   // complementaria | sustitutiva
             enlazar(original, rectificacion) -> ok
    REGLA: corrección POSTERIOR a la presentación. ≠ ajuste interno (B5). Plano 4 de los 4 planos de
           corrección: NO se confunde con el ajuste contable ni con la rectificativa comercial (O2).
}

CLASE D15_PerfilAdministrativo {     // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: perfiles: Repositorio<IdSociedad, Perfil>, escritorAutorizado: Rol=DUENO/ASESOR
    MÉTODOS: declarar(rol, sociedad, perfil) -> ok
             aplicables(sociedad) -> Set<IdObligacion>   // territorio + régimen
    REGLA: qué administraciones y obligaciones aplican al negocio (territorio/régimen). ≠ parámetros
           fiscales (D11 = tipos y bases). Cuatro territorios posibles; el sistema no asume uno.
}
```

---

## 8 · EJE: LA TESORERÍA Y LA CONCILIACIÓN

```text
CLASE E1_ConciliacionBancaria {      // FORMA: REFLEJO
    ATRIBUTOS: extracto: List<MovimientoBancario>, libro: MayorBalanza (B3), reglas: ReglaMovimientoBancario (E8)
    MÉTODOS: cruzar(extracto, libro) -> List<Conciliacion>       // por clave natural y reglas
             sinCruzar(extracto, libro) -> List<MovimientoBancario>   // → E7
    REGLA: el CRUCE por clave natural y reglas es DETERMINISTA (un test lo afirma). El JUICIO vive en sus
           satélites E7 (fuzzy) y E8 (custodio) — no se duplica el juicio en dos clases.
}

CLASE E2_PuertoExtracto {            // FORMA: CONVERSOR
    ATRIBUTOS: canalesDeclarables: Set<CanalExtracto> | catalogo declarable
    MÉTODOS: leer(canal) -> List<MovimientoBancario>
             registrarAdaptador(canal) -> ok
    REGLA: frontera de canal/formato del extracto. Un adaptador por fuente, puesto en el sitio. Si falta
           una fuente → se crea (invariante de puerto abierto).
}

CLASE E3_CuadreCobroPago {           // FORMA: REFLEJO
    ATRIBUTOS: movimiento: MovimientoBancario, asiento: IdAsiento
    MÉTODOS: cuadrar(movimiento, cobroOPago) -> Ok | Descuadre    // clave natural compartida
    REGLA: un movimiento bancario = un cobro/pago. Determinista. Si no casa → E7/E9, nunca se ignora.
}

CLASE E4_SaldoTesoreria {            // FORMA: REFLEJO
    ATRIBUTOS: cuentasBancarias: MaestroCuentasBancarias (E11), movimientos: List<MovimientoBancario>
    MÉTODOS: saldoPorCuenta(idCuentaBancaria) -> Importe
             posicionReal() -> Map<IdCuentaBancaria, Importe>
    REGLA: posición REAL de dinero por cuenta. Derivación determinista (no la posición contable: la real).
}

CLASE E5_PrevisionCaja {             // FORMA: REFLEJO
    ATRIBUTOS: vencimientos: List<VencimientoPago> (N6/N8), politica: PoliticaCobroPago (E6)
    MÉTODOS: proyectar(desde, hasta) -> CajaProyectada
             alertarUmbral(prevision, umbral) -> señal (K2)     // umbral declarable (Q24)
    REGLA: proyecta entradas/salidas desde los compromisos con la POLÍTICA DECLARADA. Cálculo. Los
           umbrales ("caja mínima", "deuda máxima") los declara el dueño; no se asumen.
}

CLASE E7_PartidaNoIdentificada {     // FORMA: MICRO-AGENTE (fuzzy)
    ATRIBUTOS: movimiento: MovimientoBancario, reglas: ReglaMovimientoBancario (E8)
    MÉTODOS: reconocer(movimiento) -> Clasificacion | SIN_REGLA
             proponerContrapartida(movimiento) -> Contrapartida      // comisión/interés/devolución
    REGLA: el movimiento SIN contrapartida llega con descripción ambigua → INTERPRETAR. Una vez existe
           la regla (E8), pasa a automático. Lo no reconocible → excepción (A8.1). NO se ignora.
}

CLASE E8_ReglaMovimientoBancario {   // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: reglas: Repositorio<ReglaDeclarada>, escritorAutorizado: Rol=DUENO/ASESOR
    MÉTODOS: declarar(rol, regla) -> ok
             aplicar(movimiento) -> Contrapartida | SIN_COBERTURA
             aprender(rol, regla, evidencia) -> ok      // hidratada por E7/desatasco; RATIFICADA por L10
    REGLA: repositorio de reglas declarables/aprendidas ("esta comisión → esta cuenta"). Un solo escritor.
           Comparte la puerta ÚNICA de ratificación (L10) con A6.2 — no hay tres puertas distintas.
}

CLASE E9_PartidaConciliatoria {      // FORMA: REFLEJO
    ATRIBUTOS: saldoBanco: Importe, saldoContable: Importe
    MÉTODOS: explicarDesfase() -> List<PartidaEnTransito>      // cheque no cobrado, cobro no apuntado
    REGLA: partidas en tránsito que EXPLICAN el desfase saldo banco ↔ saldo contable. Cálculo puro.
}

CLASE E10_InformeConciliacion {      // FORMA: REFLEJO
    ATRIBUTOS: conciliacion (E1), transito (E9), saldoBanco (E4), saldoContable (B3)
    MÉTODOS: componer() -> DocumentoCuadre        // saldo banco ↔ saldo contable ajustado
    REGLA: el documento de cuadre: LA PRUEBA de que el cuadre cuadra. Derivación determinista.
}

CLASE E11_MaestroCuentasBancarias {  // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: cuentas: Repositorio<IdCuentaBancaria, CuentaBancaria>, escritorAutorizado: Rol=DUENO
    MÉTODOS: declarar(rol, cuenta, moneda) -> ok
             cuentas() -> List<CuentaBancaria>
    REGLA: catálogo DECLARABLE de cuentas y su MONEDA. Sin él, "el banco" es un solo número falso. Un
           solo escritor. Si el dueño no declara multi-moneda → una sola moneda base; si la declara → E14.
}
```

---

## 9 · EJE: EL INMOVILIZADO Y LA AMORTIZACIÓN

```text
CLASE F1_AltaActivo {                // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: activos: Repositorio<IdActivo, Activo>, escritorAutorizado: Rol=DUENO/ASESOR
    MÉTODOS: registrar(rol, activo) -> ok
             valorarAlta(activo) -> Importe      // reflejo hidratador
    REGLA: registra el bien duradero (parcela del inmovilizado). Un solo escritor. La valoración del
           alta es reflejo; el alta no se "estima", se declara.
}

CLASE F2_PlanAmortizacion {          // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: planes: Repositorio<IdActivo, Plan>, parametros: ParametroDeclarable (F5)
    MÉTODOS: generarCuota(activo, periodo) -> AsientoAmortizacion | NADA
             dispararEnCierre(cierre) -> ok
    REGLA: genera la cuota CUANDO TOCA (dispara en el cierre C4). Método/coeficiente/años son
           DECLARABLES (lineal estándar; degresiva/fiscal según caso). No se cablea ningún coeficiente.
}

CLASE F3_BajaActivo {                // FORMA: REFLEJO
    ATRIBUTOS: activo: IdActivo, amortizacionAcumulada: Importe, valorRecuperado: Importe | [ABIERTO]
    MÉTODOS: calcularResultadoBaja(activo) -> Perdida | Beneficio
             imputar(resultado) -> Asiento
    REGLA: retira el bien y calcula el resultado (pérdida/beneficio) y lo imputa. Cálculo determinista.
           La baja no borra la historia del bien: suma un asiento.
}

CLASE F4_ValorNetoContable {         // FORMA: REFLEJO
    ATRIBUTOS: coste: Importe, amortizacionAcumulada: Importe
    MÉTODOS: calcular(activo) -> Importe        // coste − amortización acumulada
    REGLA: cálculo determinista al balance (C1). Un test lo afirma.
}
```

---

## 10 · EJE: EL PERSONAL

```text
CLASE G1_ReciboNomina {              // FORMA: REFLEJO
    ATRIBUTOS: origen: PuertoNomina (G4), recibos: List<Recibo>
    MÉTODOS: admitir(recibo) -> ReciboFormado        // mecánico: hecho-hecho o documento
    REGLA: admite y da FORMA ASENTABLE al hecho de nómina. Cero juicio. Si el negocio no calcula
           nómina, el recibo LLEGA hecho por el puerto (G4).
}

CLASE G2_ObligacionSeguridadSocial { // FORMA: REFLEJO
    ATRIBUTOS: recibo: Recibo, parametros: ParametroDeclarable (convenio/tipos)
    MÉTODOS: calcular(recibo) -> Obligacion {gastoEmpresa, obligacionTGSS}
    REGLA: gasto de empresa + obligación con la Seguridad Social desde el recibo. Determinista. Los
           tipos de cotización son DECLARABLES (cambian cada año).
}

CLASE G3_AsientoPersonal {           // FORMA: REFLEJO
    ATRIBUTOS: recibo (G1), lineas (G6), obligacion (G2)
    MÉTODOS: construir(recibo) -> AsientoEquilibrado      // gasto, retención y pago
    REGLA: gasto de personal, retención y pago → asiento equilibrado. Determinista.
}

CLASE G4_PuertoNomina {              // FORMA: PUENTE
    ATRIBUTOS: origenDeclarable: OrigenNomina | [ABIERTO]
    MÉTODOS: recibir(hechoNomina) -> ok
             conectar(origen) -> ok
    REGLA: origen DECLARABLE del dato de nómina (conecta con el sistema de personal). Si no existe → se
           crea. El sistema NO calcula nómina por defecto: la RECIBE (calcular es capacidad opcional, G5).
}

CLASE G6_LineasNomina {              // FORMA: REFLEJO
    ATRIBUTOS: recibo: Recibo
    MÉTODOS: desglosar(recibo) -> Lineas {bruto, retencion, cotizacionTrabajador, neto}
    REGLA: hace la nómina EXPLICABLE, no un número pelado (requisito de información rica). Cálculo derivado.
}

CLASE G7_AccesoNomina {              // FORMA: CUSTODIO (dato personal)
    ATRIBUTOS: permisos: Repositorio<IdEmpleado, Set<Rol>>, escritorAutorizado: Rol=DUENO
    MÉTODOS: autorizar(rol, empleado, visor) -> ok
             puedeVer(visor, empleado) -> Bool      // cada uno ve la suya
    REGLA: aísla la nómina como DATO PERSONAL. Un solo escritor del store de permisos. Eje de
           aislamiento dentro del negocio (≠ aislamiento entre negocios, I4).
}

CLASE G8_PagosACuentaEmpleado {      // FORMA: REFLEJO
    ATRIBUTOS: anticipos: List<IdAsiento>, recibo: Recibo
    MÉTODOS: aplicarAnticipo(empleado, recibo) -> NetoAjustado
    REGLA: anticipos y adelantos: no todo es sueldo fijo. Impacto en el neto y en la retención: cálculo
           determinista.
}

CLASE G9_ConceptosExtraNomina {      // FORMA: REFLEJO
    ATRIBUTOS: conceptos: List<Concepto> | declarables (dietas, especie, pagas extra, finiquitos)
    MÉTODOS: imputar(concepto, recibo) -> List<Apunte>
    REGLA: dieta, retribución en especie, finiquito, paga extra: cálculo de su imputación. Determinista.
}

CLASE G10_LiquidacionBajaEmpleado {  // FORMA: REFLEJO
    ATRIBUTOS: empleado: IdEmpleado, finiquito: Importe | declarable, indemnizacion: Importe | declarable
    MÉTODOS: liquidar(empleado) -> AsientoCierre
             cerrarCuentaTrabajador() -> SaldoCero    // para que no quede un acreedor abierto
    REGLA: cierra la cuenta del trabajador con su finiquito/indemnización. Determinista. Una cuenta de
           empleado sin cerrar es un error de estado, no un saldo válido.
}
```

---

## 11 · EJE: LAS EXISTENCIAS VALORADAS

```text
CLASE H1_ValoracionExistencia {      // FORMA: REFLEJO
    ATRIBUTOS: fichaProducto: PuertoFichaProducto (H2), metodo: ParametroDeclarable (FIFO|PMP)
    MÉTODOS: valorar(producto, cantidad, fecha) -> Importe
             capaDeValor(inventarioExistente) -> Valoracion    // NO duplica el inventario
    REGLA: capa de VALOR sobre el stock existente (no duplica el inventario). Método DECLARABLE por
           negocio (FIFO/PMP permitidos; LIFO no). Determinista.
}

CLASE H2_FronteraFichaProducto {     // FORMA: CONVERSOR
    ATRIBUTOS: fuenteCoste: CanalDeclarable | [ABIERTO]
    MÉTODOS: leerCoste(producto) -> Coste
             crearFrontera(negocio) -> ok        // si falta, se crea
    REGLA: puerto DECLARABLE del coste de cada negocio: frontera donde cruza el coste de la ficha al
           dato interno. Si falta → se crea. Nunca se inventa un coste: se declara o se marca [ABIERTO].
}

CLASE H3_AjusteInventario {          // FORMA: REFLEJO
    ATRIBUTOS: stockReal: Cantidad, stockContable: Cantidad
    MÉTODOS: calcularDiferencia() -> Importe        // merma/rotura
             regularizar(diferencia) -> Asiento + señal de aviso (K2)
    REGLA: regulariza merma/rotura con asiento y aviso. Cálculo de la diferencia; el asiento SUMA.
}

CLASE H4_VariacionStockValorada {    // FORMA: REFLEJO
    ATRIBUTOS: hecho: Hecho (compra → entrada; consumo → salida), valoracion (H1)
    MÉTODOS: valorarEntrada(compra) -> Importe
             valorarSalida(consumo) -> Importe
    REGLA: entrada por compra / salida por consumo, VALORADAS. El hecho de stock lo emite la fuente (A1);
           contabilidad lo VALORA, no lo produce.
}
```

---

## 12 · EJE: EL GRUPO Y LA CONSOLIDACIÓN

```text
CLASE I1_MarcaSociedad {             // FORMA: REFLEJO
    ATRIBUTOS: asiento: Asiento
    MÉTODOS: etiquetar(asiento, sociedad) -> Asiento     // mecánico, cero juicio
    REGLA: cada asiento lleva su sociedad. Determinista.
}

CLASE I2_EliminacionIntercompany {   // FORMA: REFLEJO
    ATRIBUTOS: asientos: List<Asiento>, sociedades: Set<IdSociedad>
    MÉTODOS: detectarCruceInterno() -> List<Cruce>
             eliminar(cruces) -> List<Eliminacion>
    REGLA: detecta y ELIMINA el cruce interno en la consolidación. Cálculo determinista.
}

CLASE I3_Consolidacion {             // FORMA: REFLEJO
    ATRIBUTOS: estados: Map<IdSociedad, Estados>, criterio: ParametroDeclarable (I5)
    MÉTODOS: agregar(sociedades) -> EstadosConsolidados     // con eliminación (I2) y criterio declarado
    REGLA: estados del conjunto con CRITERIO DECLARADO. Agregación determinista. Dos niveles: por
           negocio (aislado) y del grupo (consolidado). Nunca mezcla parcelas de negocios distintos.
}

CLASE I4_AislamientoNegocio {        // FORMA: CUSTODIO (un solo dueño por parcela)
    ATRIBUTOS: parcelaPorNegocio: Repositorio<IdNegocio, Parcela>, escritorAutorizado: Rol=SISTEMA
    MÉTODOS: parcela(negocio) -> Parcela
             escribir(negocio, rol, cambio) -> ok | ERROR_FUGA_ENTRE_NEGOCIOS
    REGLA: multi-negocio SIN FUGA. Gobierna la parcela de cada negocio (un dueño por parcela). Ningún
           cálculo de un negocio lee ni escribe la parcela de otro salvo por consolidación declarada.
}
```

---

## 13 · EJE: LA ANALÍTICA

```text
CLASE J1_EtiquetadoAnalitico {       // FORMA: MICRO-AGENTE (fuzzy)
    ATRIBUTOS: hecho: Hecho, dimensiones: ParametroDeclarable (J6), reglas: List<ReglaDeclarada>
    MÉTODOS: etiquetar(hecho) -> Etiqueta {centro, linea, producto} | SIN_REGLA
             proponerEtiqueta(hecho) -> Etiqueta        // juicio cuando la regla no cubre
    REGLA: asigna centro/línea/producto con REGLA DECLARABLE; cuando la regla no cubre, clasificar es
           JUICIO → lo dudoso va a cola (A8.1). El caso cubierto por regla es reflejo.
}

CLASE J2_MargenAnalitico {           // FORMA: REFLEJO
    ATRIBUTOS: ingresos: IdCuenta, costeImputado (H1 + J5), etiquetas (J1)
    MÉTODOS: calcular(dimension) -> Margen        // ingreso − coste imputado por dimensión
    REGLA: cálculo determinista. Enlaza existencias (coste) con analítica.
}

CLASE J3_Presupuesto {               // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: presupuestos: Repositorio<IdDimension, CifraObjetivo>, escritorAutorizado: Rol=JEFE
    MÉTODOS: declarar(rol, dimension, cifra) -> ok
             objetivo(dimension, periodo) -> CifraObjetivo
    REGLA: cifra OBJETIVO por dimensión, declarable. Un solo escritor (el jefe).
}

CLASE J4_Desviacion {                // FORMA: REFLEJO
    ATRIBUTOS: real: Resultado, presupuesto: Presupuesto (J3), umbral: ParametroDeclarable
    MÉTODOS: calcular(real, presupuesto) -> Desviacion
             dispararSiExcede(desviacion) -> señal (K2)
    REGLA: real vs presupuesto → dispara aviso si se sale del UMBRAL DECLARADO. Cálculo determinista.
}

CLASE J5_CosteIndirecto {            // FORMA: REFLEJO
    ATRIBUTOS: gastosNoDirectos: List<IdAsiento>, criterioReparto: ParametroDeclarable (J7)
    MÉTODOS: repartir(gasto, criterio) -> Map<IdDimension, Importe>
    REGLA: aplica el REPARTO DECLARADO de gastos no directos. Cálculo determinista. Cubre lo que la
           pieza existente no cubre para grupo (multi-sociedad, periodos).
}

CLASE J8_CuadroMandoContable {       // FORMA: REFLEJO
    ATRIBUTOS: caja (E4/E5), resultado (C2), margen (J2), desviacion (J4), ejercicio (C4)
    MÉTODOS: agregar(lente: CONJUNTO) -> CuadroMando      // sin bajar al asiento
    REGLA: agregación de CONJUNTO (caja · resultado · margen · desviación · ejercicio). Lente del jefe:
           no baja al asiento. Determinista.
}

CLASE J9_ComparadorPeriodos {        // FORMA: REFLEJO
    ATRIBUTOS: presupuesto (J3), desviacion (J4), periodos: List<IdPeriodo>
    MÉTODOS: comparar(a, b) -> Delta      // ejercicio vs ejercicio, mes vs mes, real vs presupuesto
    REGLA: compara REUTILIZANDO presupuesto (J3) y desviación (J4); NO los duplica. Cálculo comparativo.
}

CLASE J10_TableroMargenDimension {   // FORMA: REFLEJO
    ATRIBUTOS: margen (J2), dimensiones (J6)
    MÉTODOS: cruzar(margen, dimension) -> Tablero     // por centro, familia o sociedad
    REGLA: cruce margen × dimensión bajo lente de conjunto. Agregación determinista.
}
```

---

## 14 · EJE: LA FACTURA (emisión + rectificativa)

```text
CLASE O1_EmisionFacturaVenta {       // FORMA: CUSTODIO (gobierna la serie/numeración)
    ATRIBUTOS: series: Repositorio<IdSerie, Secuencia>, escritorAutorizado: Rol=EMISION
    MÉTODOS: emitir(factura) -> FacturaEmitida      // asigna número correlativo, sin saltos
             rectificarSustitutiva(serie, rectificativa) -> OK | ERROR
             series() -> List<IdSerie>              // por negocio/canal/única — declarable
    REGLA: cara EMITIDA con serie/numeración fiscal. UN solo escritor (número duplicado = corrupción).
           Numeración correlativa SIN SALTOS; no reiniciar sin abrir serie nueva. El desglose se COMPONE
           (reflejo). Emite ticket o factura completa según el TIPO, que es DATO del hecho.
           ⚠️ Conflicto ④ (identidad "observadora" vs "emisora") sigue [ABIERTO]: se diseña como EMISORA;
           si el dueño declara "solo observa", esta clase se degrada a admisión de una factura ya emitida.
}

CLASE O2_FacturaRectificativa {      // FORMA: REFLEJO
    ATRIBUTOS: facturaOriginal: IdFactura, motivo: ABONO|DEVOLUCION|DESCUENTO
    MÉTODOS: calcularAjuste(original, motivo) -> Importe
             emitir(rectificativa) -> FacturaRectificativa        // NO borra nada
    REGLA: corrección COMERCIAL posterior a la emisión (abono/devolución/descuento). NO BORRA. Plano 3
           de los 4 planos de corrección: ≠ ajuste interno (B5) y ≠ rectificación fiscal (D14).
}
```

---

## 15 · EJE: LA COLA DE REVISIÓN (DOS COLAS)

```text
CLASE A81_EncoladoExcepcion {        // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: colas: Repositorio<Cola, List<Excepcion>>, escritorAutorizado: Rol=ADMISION
    MÉTODOS: encolar(excepcion) -> ok        // routing por NATURALEZA de la excepción
             siguiente(cola) -> Excepcion | VACIA
             resolver(rol, excepcion, resolucion) -> ok
    REGLA: DOS colas, según naturaleza (decisión tomada): **cola ASESOR** (excepciones contables) y
           **cola DUEÑO** (excepciones del negocio). El flujo NUNCA se bloquea: lo dudoso espera, la
           operación continúa. Un solo escritor de cada cola (M2).
}

CLASE A82_AvisoRevision {            // FORMA: PUENTE
    ATRIBUTOS: excepcion: Excepcion
    MÉTODOS: avisar(excepcion) -> señal a MotorAvisos (K2)    // "esto necesita revisión"
    REGLA: empujón al motor de avisos. Conecta por señal; no resuelve ni decide nada.
}

CLASE P3_DesatascoEntrada {          // FORMA: MICRO-AGENTE (fuzzy)
    ATRIBUTOS: excepcion: Excepcion, plan: CatalogoCuentas (B1)
    MÉTODOS: resolver(excepcion, decision) -> Resolucion | REENColar | DescartarConMotivo
             producirRegla(resolucion, evidencia) -> ReglaDeclarada   // → A6.2 / E8 (aprendizaje HIDRATADO)
    REGLA: la ACCIÓN que completa la cola (A8 sólo encola). Resolver/reencolar/descartar una excepción
           con su MOTIVO es JUICIO. La resolución produce una regla candidata que NO actúa hasta ser
           ratificada (L10). Si la silla la ocupa un humano (A8.3 [ABIERTO]), esta clase CAPTURA su decisión.
}
```

---

## 16 · EJE: EL AVISO

```text
CLASE K2_MotorAvisos {               // FORMA: PUENTE (produce el aviso — requisito 4 del dueño)
    ATRIBUTOS: catalogo: ParametroDeclarable (K6, [ABIERTO]), señalesEntrantes: List<Señal>
    MÉTODOS: producir(señal) -> Aviso     // de descuadre, excepción, IVA, vencimiento, plazo, desviación,
                                          // cierre pendiente, amortización, rectificación, hueco de cobertura
             enrutar(aviso, destinatario) -> ok
    REGLA: PRODUCE el aviso a partir de señales REALES (nunca de pantalla muda). Qué avisos, a quién y
           por qué canal es DECLARABLE (K6). Recibe señales de A8.2, C6, D6, E5, J4, A15, R1.
}

CLASE R1_AvisoAlNegocio {            // FORMA: PUENTE
    ATRIBUTOS: aviso: Aviso (K2)
    MÉTODOS: entregar(aviso) -> ok
             confirmar(entrega) -> Confirmacion      // el aviso ENTREGADO y confirmado
    REGLA: cara de ENTREGA del aviso al negocio cliente. Completa K2 (que sólo PRODUCE). Si no se puede
           confirmar la entrega → el aviso NO consta como recibido. El canal es un puerto.
}
```

---

## 17 · EJE: LA COBERTURA (MÉTRICA ÚNICA) Y EL CONTROL DEL PROCESO

```text
CLASE A12_CompletitudCobertura {     // FORMA: REFLEJO — EL ÚNICO CALCULADOR
    ATRIBUTOS: esperados: Set<ClaveHecho>, recibidos: Set<ClaveHecho>, unidades: AnclajeCierreVertical (A14)
    MÉTODOS: calcular(periodo) -> Cobertura {esperados, recibidos, huecos, tasa}
             huecos() -> Set<ClaveHecho>
    REGLA INVARIANTE: existe UN SOLO calculador de cobertura. Q3 (consulta), P4 (métrica del proceso) y
           C6 (aviso al cierre) son VISTAS de ESTA métrica; no se recalcula "lo que falta" en cada sitio
           (conflicto ② resuelto). Cálculo determinista.
}

CLASE Q3_SelloCobertura {            // FORMA: REFLEJO
    ATRIBUTOS: cobertura: Cobertura (A12)
    MÉTODOS: sellar(resultadoCalculo) -> ResultadoCalculo con sello
    REGLA: marca de completitud de lo consultado, FUERA de ciclo: si falta cobertura lo dice ANTES de
           que el dueño decida. Vista de la métrica única; ≠ C6 (que sólo avisa al cierre).
}

CLASE P1_PanelProcesoContable {      // FORMA: REFLEJO
    ATRIBUTOS: colas (A8.1), historial (P2), tasa (P4)
    MÉTODOS: latido() -> Panel {queEntra, queSeProcesa, queEstaEnCola, queFalla}
    REGLA: latido del proceso de admisión. Agregación y medición deterministas. Es el "display" del
           proceso contable, no del asiento.
}

CLASE P2_HistorialProcesoContable {  // FORMA: CUSTODIO (append-only)
    ATRIBUTOS: historial: ListaAppendOnly<EntradaProceso>, escritorAutorizado: Rol=ADMISION
    MÉTODOS: anotar(entrada) -> ok        // qué se procesó y qué falló, con su rastro
             consultar(desde, hasta) -> Historial
    REGLA: registro append-only de lo procesado y fallado. Un solo dueño escribe. ≠ traza-asiento (B4),
           que es del ASIENTO; este es del PROCESO de entrada.
}

CLASE P4_TasaCoberturaEntrada {      // FORMA: REFLEJO
    ATRIBUTOS: cobertura: Cobertura (A12), entradas: List<EntradaProceso>
    MÉTODOS: calcular() -> Tasa        // proporción sin intervención vs caen a cola
    REGLA: la métrica que PRUEBA la promesa "sin una persona digitando". Vista de la métrica única (A12).
           Determinista.
}

CLASE Q4_MarcaBorradorValidado {     // FORMA: REFLEJO
    ATRIBUTOS: traza: TrazaAsiento (B4), firma: FlujoFirma (L3)
    MÉTODOS: derivarEstado(periodo) -> EN_CURSO | REVISADO | FIRMADO
    REGLA: sello del punto en que está lo que el dueño ve, para no decidir sobre un borrador vivo como
           si fuera definitivo. Deriva el estado desde la traza y la firma. Determinista.
}
```

---

## 18 · EJE: LA EXPORTACIÓN AL ASESOR Y LAS CARAS DE CONSULTA/ENTREGA

```text
CLASE L1_PuertoExportacion {         // FORMA: CONVERSOR
    ATRIBUTOS: formatoDeclarado: FormaContable | [ABIERTO] (L6)
    MÉTODOS: exportar(alcance) -> DocumentoContable
             registrarFormato(rol, formato) -> ok
    REGLA: frontera de FORMATOS contables estándar hacia el programa del asesor. El formato es
           DECLARABLE, se cierra con el asesor concreto. Si falta → se crea.
}

CLASE L2_VistaRevisable {            // FORMA: REFLEJO
    ATRIBUTOS: asiento: Asiento, traza: TrazaAsiento (B4), base: List<IdHecho|IdDocumento>
    MÉTODOS: explicar(asientoOCalculo) -> Vista {cifra, base, origen, estado}
    REGLA: TODO asiento/cálculo EXPLICADO — no caja negra. Composición determinista de la traza. L2
           EXPLICA; el expediente (L7) CONSERVA la prueba.
}

CLASE L3_FlujoFirma {                // FORMA: CUSTODIO (el sistema NO firma)
    ATRIBUTOS: firmas: Repositorio<IdAlcance, MarcaRevision>, escritorAutorizado: Rol=ASESOR
    MÉTODOS: marcarRevisado(rol, alcance) -> ok
             firmar(rol, alcance) -> MarcaFirma       // la marca la pone el asesor; el sistema la REGISTRA
    REGLA: marca de revisado/firmado POR EL ASESOR. Un solo escritor (el asesor). El sistema NO firma,
           sólo registra la marca. Nivel de firma (periodo/estado/documento) es declarable.
}

CLASE L7_ExpedienteDocumental {      // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: expediente: Repositorio<IdCifra, IdDocumento>, almacen: PuertoArchivoDocumental
    MÉTODOS: archivar(cifra, documentoOrigen) -> ok
             recuperar(cifra) -> IdDocumento
             verificarEnlace() -> ok | ERROR_CIFRA_SIN_PRUEBA
    REGLA: cada cifra con el documento origen ARCHIVADO y ENLAZADO: la prueba que sostiene la firma ante
           una inspección. Un solo escritor. L2 explica; el expediente CONSERVA la prueba.
}

CLASE L8_ControlCalidadMuestreo {    // FORMA: REFLEJO
    ATRIBUTOS: senales: ParametroDeclarable (alto importe, sin regla, contrapartida nueva, cuadre dudoso)
    MÉTODOS: seleccionar(conjuntoAsientos) -> Muestra     // excepción + muestra, no revisar todo
    REGLA: los criterios son SEÑALES DURAS DECLARADAS → selección determinista (un test la afirma).
           Qué exige ojo humano lo fija el umbral declarado, no la intuición.
}

CLASE L9_CambioDesdeUltimaRevision { // FORMA: REFLEJO
    ATRIBUTOS: firmas (L3), ajustes (B5), reglas: List<ReglaDeclarada> (A6.2/E8)
    MÉTODOS: calcularDelta(desdeUltimaFirma) -> Delta {asientosNuevos, ajustes, reglasCambiadas}
    REGLA: delta entre revisiones. Cálculo de diferencia. Le da al asesor sólo lo que cambió desde su
           último visto bueno.
}

CLASE L10_RatificacionReglaAprendida { // FORMA: PUENTE
    ATRIBUTOS: reglaCandidata: ReglaDeclarada (de A6.2/E8), asesor: Rol
    MÉTODOS: solicitarRatificacion(regla) -> SolicitudDecision
             aplicarRatificacion(regla, decision) -> ok     // ratifica | bloquea
    REGLA: el asesor ratifica o BLOQUEA la regla aprendida ANTES de que actúe sobre el volumen. PUERTA
           ÚNICA de ratificación: cubre A6.2 y E8 — no tres puertas distintas. Si vence sin respuesta,
           la regla NO actúa (jamás asume).
}

CLASE Q1_ConsultaCuentasBajoDemanda { // FORMA: PUENTE
    ATRIBUTOS: canalConsulta: PuertoConsultaDueno | [ABIERTO]
    MÉTODOS: responder(pregunta) -> ResultadoCalculo
             sinCadencia() -> Bool        // el dueño pregunta cuando quiere
    REGLA: puerta PULL: el dueño pregunta cuando quiere y el sistema contesta. Sin cadencia impuesta
           (≠ cuadro del jefe J8, que sí impone cadencia y agregación). Desde dónde consulta es declarable.
}

CLASE Q2_PuenteLenguajeDueno {       // FORMA: MICRO-AGENTE (fuzzy)
    ATRIBUTOS: vocabulario: ParametroDeclarable (caja, deuda, resultado, "¿puedo pagar X?")
    MÉTODOS: traducirPregunta(preguntaNatural) -> ConsultaContable
             traducirCifra(resultado) -> CifraEnSuIdioma
    REGLA: traductor BIDIRECCIONAL (su pregunta → consulta contable; cálculo → cifra en su idioma).
           Lenguaje → fuzzy. Hidratado por el núcleo de informe rico (K3).
}

CLASE K1_OnboardingNegocio {         // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: configuracion: Repositorio<IdNegocio, ConfigNegocio>, escritorAutorizado: Rol=DUENO
    MÉTODOS: recoger(rol, negocio, datos) -> ok      // plan, fuentes, parámetros
             estado(negocio) -> CONFIGURADO | FALTA [ABIERTO]
    REGLA: recoge los datos DECLARABLES del negocio nuevo (plan, fuentes, parámetros). Un solo escritor.
           Un negocio sin sus parámetros declarados queda INCOMPLETO — no se asume nada.
}

CLASE K3_InformeRico {               // FORMA: REFLEJO
    ATRIBUTOS: cifra: ResultadoCalculo, contexto: ParametroDeclarable (periodo, origen, comparativas)
    MÉTODOS: componer(cifra, contexto) -> InformeRico     // núcleo de informe (no un número pelado)
    REGLA: COMPONE cifras ya calculadas con el contexto declarado (mecánico). El núcleo de informe rico
           se sirve en idiomas distintos (dueño Q2 / cliente R3); no se fusionan los traductores, sí el núcleo.
}

CLASE K4_ActivacionVertical {        // FORMA: REFLEJO
    ATRIBUTOS: configuracion (K1)
    MÉTODOS: activar(negocio) -> ok        // enciende por la configuración declarada
    REGLA: mecánico, cero juicio. Sin parámetros declarados, la vertical no se activa: se declara el hueco.
}

CLASE K9_ColaDeclaracionesCriterio { // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: declaraciones: Repositorio<IdCriterio, ParametroDeclarable>, escritorAutorizado: Rol=JEFE/ASESOR
    MÉTODOS: declarar(rol, criterio, valor) -> ok
             leer(criterio) -> ParametroDeclarable
             pendientes() -> List<IdCriterio>       // los que siguen [ABIERTO]
    REGLA: UNA sola cola donde el jefe/asesor fija o ratifica TODOS los criterios: cierra de forma
           declarativa B1/B7·C7·E6·F5·J6·D11·I5 (y M4). Un solo escritor. Los que falten quedan [ABIERTO].
}

CLASE R2_InformeAccionable {         // FORMA: MICRO-AGENTE (fuzzy)
    ATRIBUTOS: informe: InformeRico (K3)
    MÉTODOS: recomendar(informe) -> InformeAccionable      // "qué hacer" con él
    REGLA: todo informe que recibe el cliente lleva QUÉ HACER con él. La RECOMENDACIÓN es juicio → fuzzy.
           Refuerza K3 y lo quita de adorno.
}

CLASE R3_NarradorEstados {           // FORMA: MICRO-AGENTE (fuzzy)
    ATRIBUTOS: balance: BalanceSituacion (C1), resultado: CuentaResultados (C2)
    MÉTODOS: narrar(estados) -> Narracion        // "esto es lo que te ha pasado y lo que viene"
    REGLA: traduce balance/resultado al LENGUAJE del negocio cliente. Lenguaje → fuzzy. Comparte el
           núcleo (K3) con el traductor del dueño (Q2), pero el idioma de destino es otro.
}
```

---

## Relaciones entre clases

> Dirección del flujo: **entrada → libro → estados → fiscal**, con tesorería / inmovilizado /
> existencias / personal alimentando el libro desde sus hechos, y analítica / grupo / asesor leyendo
> aguas abajo. `▸` = composición (parte-de, ciclo de vida del todo) · `»` = agregación (referencia sin
> propiedad) · `→` = dependencia de uso (lee/escribe).

```text
COMPOSICIÓN
  Asiento ▸ List<Apunte>              // un asiento SIN apuntes no existe
  Hecho   ▸ List<LineaHecho>          // un hecho sin líneas no es asentable
  Hecho   ▸ List<CuotaImpuesto>       // los impuestos son parte del hecho
  Cobertura ▸ {esperados, recibidos, huecos}   // la métrica es una; las vistas no la poseen
  Excepcion ▸ {motivo, resolucion}    // el motivo es parte de la excepción

AGREGACIÓN
  EscritorDiario » CatalogoCuentas, TrazaAsiento, ClaveNatural
  MayorBalanza   » EscritorDiario
  BalanceSituacion, CuentaResultados » MayorBalanza + ValorNetoContable + ValoracionExistencia
  CierreEjercicio » Periodificacion, PlanAmortizacion
  Consolidacion » EliminacionIntercompany + Estados por sociedad
  ExpedienteDocumental » PuertoArchivoDocumental

DEPENDENCIA (dirección del cálculo)
  A1 → A2 → {A3, A5} → A4.1/A4.3 → A6.1 → A6.2 → A7 → A9 → B2 → B4
  A6.1 → B1 (plan) ; A6.1 → N1/N2 (tercero)
  A8.1 → A8.2 → K2 → R1            // lo dudoso: cola → aviso → entrega
  B2 → B3 → {C1, C2, D1} → {D2, D3, D5} → D7 → D13
  E1/E7/E8 → E3 → B2 ; E4/E9/E10 → E1
  F2 → B2 ; F4 → C1 ; H4 → B2 ; H1 → J2 ; G3 → B2
  N1/N2 → A6.1 ; N3 → B3 ; N5 → A8.1 ; N6 → E5
  J1 → J2 → {J8, J10} ; J3 → J4 → {J8, J9}
  A12 → {Q3, P4, C6, A15}          // la métrica única alimenta sus vistas
  B4 + L3 → Q4 ; B2 → L2 → L7 ; L9 → L3 ; L10 → {A6.2, E8}
  I1 → I2 → I3 → vista agregada
  K9 → {B1, C3, E5(umbral), F2, J1, D1, I3}   // la puerta declarativa única alimenta a todos

BUCLE DE APRENDIZAJE (no de realimentación de negocio)
  Excepcion → P3 (resuelve) → ReglaDeclarada candidata → L10 (ratifica) → A6.2/E8 → menos excepciones.
  M1 garantiza que TODO lo anterior NO emite hechos de negocio: sólo cálculos.
```

**Los 4 planos de corrección (coherentes, nunca confundidos · conflicto ③ resuelto):**

| Plano | Clase | Qué corrige | Cuándo |
|---|---|---|---|
| 1 · interno contable | `B5_AsientoAjuste` | el asiento | en cualquier momento, suma |
| 2 · del hecho fuente | `A13_HechoRectificativo` | el hecho original | cuando la fuente se equivocó/república |
| 3 · comercial | `O2_FacturaRectificativa` | la factura emitida | posterior a la emisión |
| 4 · fiscal | `D14_RectificacionDeclaracion` | la declaración presentada | posterior a la presentación |

> Un mapa canónico los liga: una rectificativa comercial (3) puede provocar un ajuste interno (1) y, si
> ya se declaró, una rectificación fiscal (4). Son **tres actos**, no uno.

---

## Invariantes del dominio

1. **La partida doble cuadra.** `Σ debe = Σ haber` en todo asiento aceptado. Un descuadre es un error,
   no un estado. `B2` rechaza antes de escribir.
2. **Un hecho = un asiento (idempotencia).** La clave natural (`M3`, con `A14`) hace que reprocesar no
   duplique. Test unitario lo afirma.
3. **La cobertura tiene UN SOLO calculador.** `A12`; `Q3`, `P4` y `C6` son sus vistas. Nunca se
   recalcula "lo que falta" a la medida de cada carátula (conflicto ② resuelto).
4. **El asiento original no se borra; la corrección SUMA.** `B2`/`B4` son inmutables; `B5` añade.
   Traza intacta (auditoría). Los 4 planos de corrección son actos distintos.
5. **Contabilidad NO produce los hechos que observa.** Produce sus **documentos** (factura `O1`,
   informe `K3/R3`, modelo `D7`) y emite **cálculos**. `M1` lo verifica: cero realimentación de la
   operación.
6. **La ley entra como DATO.** Todo valor legal (territorio, régimen, tipos, plazos, coeficientes,
   formatos) es `ParametroDeclarable`. Ninguna constante legal vive en la lógica. Si falta → `[ABIERTO]`.
7. **Dato ausente = desconocido / `[ABIERTO]`.** Nada se estima. Un valor sin declarar no se decide:
   se marca y se pregunta.
8. **Un solo escritor por parcela.** `M2` gobierna a todo CUSTODIO: diario, plan, traza, colas,
   maestros, registros, config. Dos escritores = corrupción esperando turno.
9. **Los registros inmutables solo crecen.** `B4`, `D8`, `P2`, `L7`: append-only; nunca se reescriben.
10. **Frontera única de formatos.** Cada CONVERSOR (`A2`, `A4.2`, `B6`, `D9`, `E2`, `H2`, `L1`) es el
    único cruce de formatos de su dominio.
11. **El sistema no firma y no decide.** La firma la pone el asesor (`L3`); toda decisión humana va por
    `SolicitudDecision`. Si vence sin respuesta → EXPIRADA y se re-pregunta; jamás asume.
12. **El cierre es irreversible salvo ajuste.** `C4` no se reabre; se corrige sumando (`B5`).
13. **Los negocios no se fugan.** `I4`: un negocio sólo lee/escribe su parcela, salvo consolidación
    declarada. Dos ejes de aislamiento: negocio↔negocio (`I4`) y persona↔persona (`G7`).
14. **El mínimo se declara, no se estima.** `A11` (contrato del hecho), `A10/A5` (canales), `D11`
    (tipos), `E6` (plazos), `L6` (formato), todos por `K9`. Sin declarar → la pieza no actúa.

---

## PUERTOS ABIERTOS (fronteras con el exterior · sin nombrar tecnología)

> Todo lo externo entra por puerto ABIERTO, cableado en el sitio de despliegue, reemplazable, nunca
> acoplado a un proveedor. **Si un puerto falta, se crea** (invariante de puerto abierto).

```text
PUERTO PuertoHechosDeVertical {      // A1 — la fuente manda; contabilidad lee, no impone
    admitir(hecho) -> ok ; reconectar(fuente) -> ok ; contratoMinimo(vertical) -> Set<Campo>
}
PUERTO PuertoDocumento {             // A3, A4.1, A4.2 — documentos llegados o digitalizados, formas declarables
    admitir(documento) -> DocumentoAdmitido ; leer(formato) -> DocumentoAdmitido ; registrarForma(f) -> ok
}
PUERTO PuertoDocumentoDigital {      // A5, D9 — recepción digital estructurada (entra sin extracción)
    recibir(entrega) -> DocumentoAdmitido ; suscribir(canal) -> ok
}
PUERTO PuertoExtractoBancario {      // E2 — un adaptador por fuente; moneda declarable (E11)
    leer(canal) -> List<MovimientoBancario> ; registrarAdaptador(canal) -> ok
}
PUERTO PuertoPlanContable {          // B6 — codificación import/export del plan del asesor
    importar(origen) -> List<Cuenta> ; exportar(catalogo) -> DocumentoPlan
}
PUERTO PuertoParametrosFiscales {    // D1, D4, D5, D6 — la ley como DATO (territorio, régimen, tipos, plazos)
    leer(clave, ejercicio) -> ParametroDeclarable ; vigente(clave, fecha) -> valor | AUSENTE
}
PUERTO PuertoModeloFiscal {          // D7 (salida) + D13 (retorno del acuse) — cierra el bucle hacia fuera
    generar(modelo) -> DocumentoModelo ; entregar(documento) -> ok ; recibirAcuse() -> Justificante
}
PUERTO PuertoExportacionAsesor {     // L1 — formatos contables estándar hacia su programa (declarable, L6)
    exportar(alcance) -> DocumentoContable
}
PUERTO PuertoCanalAvisos {           // K2, R1, A8.2, C6, D6, E5, J4 — produce y entrega el aviso
    producir(aviso) -> Aviso ; entregar(aviso) -> Confirmacion
}
PUERTO PuertoNomina {                // G4 — origen declarable del dato de nómina
    recibir(hechoNomina) -> ok ; conectar(origen) -> ok
}
PUERTO PuertoFichaProducto {         // H2 — coste del producto declarable por negocio
    leerCoste(producto) -> Coste ; crearFrontera(negocio) -> ok
}
PUERTO PuertoTerceros {              // N1, N2 — identidad fiscal y condiciones por tercero (declarable)
    identificar(nif, nombreFiscal) -> IdTercero ; condiciones(IdTercero) -> CondicionesPago | [ABIERTO]
}
PUERTO PuertoConsultaDueno {         // Q1 — puerta PULL declarable (desde dónde consulta el dueño)
    recibir(pregunta) -> ok ; responder(resultado) -> ok
}
PUERTO PuertoEntregaNegocio {        // R1, R2, R3, K7 — canal y forma de entrega al negocio (declarable)
    entregar(informeOaviso, negocio) -> Confirmacion
}
PUERTO PuertoArchivoDocumental {     // L7 — conservación de la prueba (documento origen enlazado a la cifra)
    archivar(idCifra, documento) -> ok ; recuperar(idCifra) -> documento
}
PUERTO PuertoEjecucionCobroPago {    // E — EJECUTAR cobros/pagos SÓLO si el negocio lo declara
    ejecutar(cobroOPago) -> Ok | NO_DECLARADO      // por defecto: registrar y observar, no ejecutar
}
```

**Total: 16 puertos abiertos.** Ninguno nombra proveedor ni tecnología: son contratos abstractos.

---

## DECISIONES HUMANAS (parámetros declarables — NO se inventan)

> Cada punto necesita un valor que **solo el dueño/asesor/jefe** puede declarar. El sistema lo pide por
> `SolicitudDecision`; mientras no llegue, la pieza queda en `[ABIERTO]` y **no actúa**.

| # | Decisión | Quién la declara | Piezas que la consumen | Si falta |
|---|---|---|---|---|
| 1 | **Tipos y parámetros fiscales**: territorio (común / forales / Canarias / Ceuta-Melilla), régimen de impuesto indirecto, tipo impositivo (IS/IRPF), tipos por línea, retención de profesionales | Asesor | `D1`–`D6`, `D15` | `[ABIERTO]` (D11) |
| 2 | **Plan de cuentas**: importar del asesor o declarar por el negocio | Asesor / Jefe | `B1`, `B6`, `A6.1` | `[ABIERTO]` (B1/B7) |
| 3 | **Definición de cierre** (`unidad_de_cierre`): qué es "un cierre" y cómo se identifica (jornada/día/mes) | Dueño | `A14`, `B7`, `C3`, `C4`, `M3`, `M4` | `[ABIERTO]` (M4) — la clave de todo el cerrojo de idempotencia |
| 4 | **Política de cobro/pago y umbrales de aviso**: plazos por tercero, caja mínima, deuda máxima, umbral de desviación | Dueño / Jefe | `E5`, `E6`, `N6`, `N8`, `J4`, `K2`, `K6` | `[ABIERTO]` (E6, K6) |
| 5 | **Quién resuelve cada cola**: asesor (contable) / dueño (negocio) — y quién escala | Dueño | `A8.1`, `A8.3`, `P3` | `[ABIERTO]` (A8.3) |
| 6 | **Ámbito del grupo y multi-moneda**: granularidad (sociedades/sucursales), criterio de consolidación, vista agregada, monedas y tipo de cambio | Jefe / Dueño | `E11`, `E14`, `I3`, `I5`, `I6`, `I7` | `[ABIERTO]` (I5/I6/I7, E14) — E14 se **activa** si hay multi-moneda |
| 7 | **Políticas de valoración**: método de amortización/coeficientes/años por tipo de activo; método de existencias (FIFO/PMP) | Asesor | `F2`, `F5`, `H1`, `H2`, `H5` | `[ABIERTO]` (F5, H5) |
| 8 | **Criterios analíticos**: dimensiones (centros/líneas), criterio de reparto de indirectos, umbral de sangría | Jefe | `J1`, `J5`, `J6`, `J7`, `J10` | `[ABIERTO]` (J6/J7) |
| 9 | **Alcance y forma de entrega**: alcance fiscal (qué modelos), formato de exportación al asesor, canal de avisos y entregas, modelo de licencia | Asesor / Dueño | `D10`, `L1`, `L6`, `K6`, `K7`, `K8` | `[ABIERTO]` (D10, L6, K6, K7, K8) |
| 10 | **Regla para hecho incompleto**: asienta provisional / espera / avisa | Dueño | `A6.3`, `A8.1` | `[ABIERTO]` (A6.3) |

**Todas pasan por `K9_ColaDeclaracionesCriterio`** (una sola puerta declarativa) o por
`SolicitudDecision`. El sistema **no resuelve ninguna**: crea la solicitud y la entrega.

---

## EL ESLABÓN LIMITANTE EN EL DISEÑO — cómo se materializa

> **El cuello es LA ENTRADA DE LOS HECHOS (eje 1).** El diseño lo expande hasta que cada freno tiene
> su clase. La promesa sólo se sostiene si esta puerta se llena **sola**.

```text
CADENA DE ADMISIÓN (cómo se abre el cuello, freno → empujón)

 [A1 PuertoHechosDeVertical]      llegan los hechos ya emitidos (ventas, cobros, compras, consumo, cierre)
        │  + [A11 ContratoHechoMinimo]  el mínimo EXIGIBLE por fuente (declarado, no impuesto)
        ▼
 [A2 NormalizadorHecho]           única puerta de FORMATO → forma asentable
        │
        ├── documentos llegados/digitalizados:
        │     [A3 CapturaDocumento] → [A4.2 PuertoDocumento] → [A4.1 ExtraccionDato] (JUICIO: abre lo ilegible)
        │                                                        → [A4.3 ControlCuadreDocumento] (si no cuadra → cola)
        │     [A5 PuertoDocumentoDigital]  ya estructurado → entra SIN extracción
        │
        ├── cada hecho debe hallar su CUENTA y su TERCERO:
        │     [A6.1 ContrapartidaAsistida] (PROPONE, juicio) ← [A6.2 ReglaContrapartida] (corte DURO, custodio)
        │                                          ↑ regla aprendida, RATIFICADA por [L10]
        │     [N1 MaestroTerceros]+[N2 PadronTerceros] dan identidad al tercero
        │
        ├── ANTI-BUCLE: [A7 DeduplicacionHecho] + [M3 ClaveNatural] ("un hecho = un asiento")
        │     [A13 HechoRectificativo] casa con su original por clave natural (no borra, añade)
        │
        ├── DESACOPLE: [A9 LoteAdmision] → N hechos en paralelo (la serie no atasca el embudo)
        │
        ├── VÁLVULA: lo dudoso NO bloquea → [A8.1 EncoladoExcepcion] (2 colas: asesor / dueño)
        │     → [A8.2 AvisoRevision] → [K2 MotorAvisos] → [R1 AvisoAlNegocio]
        │     → la ACCIÓN que completa la cola: [P3 DesatascoEntrada] → produce regla candidata → [L10]
        │
        ├── MEDIDA: [A12 CompletitudCobertura] (métrica ÚNICA) mide qué llegó y qué NO
        │     → [P4 TasaCoberturaEntrada] prueba la promesa "sin una persona digitando"
        │     → [C6 AvisoCuadre] avisa al cierre · [Q3 SelloCobertura] avisa antes de decidir
        │
        └── ASIMETRÍA CON LA FUENTE (subordinada): contabilidad LEE, NO OBLIGA
              [A14 AnclajeCierreVertical]  la fuente declara su unidad de cierre (o [ABIERTO])
              [A15 DeclaracionFuenteFaltante] si la fuente calla un hecho → se DECLARA, no se exige
        ▼
 [B2 EscritorDiario]              EL cuello entrega: asiento a partida doble, single-writer, verificado
```

**Por qué esto materializa la expansión:** el freno "un documento debe interpretarse" tiene su clase
(`A4.1`); "recibirlas digitales no existe" → `A5 + A4.2`; "cada hecho debe hallar su contrapartida" →
`A6.1 + A6.2`; "lo ilegible atasca" → `A8.1 + A8.2` (válvula) + `P3` (acción); "reprocesar duplica" →
`A7 + M3`; "un hecho incompleto" → `A6.3 [ABIERTO]`; "la entrada en serie atasca" → `A9`; "la vertical
no declara su cierre" → `A14`; "la vertical no publica ciertos hechos" → `A15`; "nadie mide la
cobertura" → `A12 + P4`. **El bucle excepción → regla → menos excepciones** (`P3 → A6.2/E8 → L10`)
convierte el trabajo que hoy hace una persona en una regla que se afina con cada documento resuelto.

---

## LOS 4 EJES DE LA PARTICIÓN (para la FASE 3b)

> El diseño es **UNO** (el conjunto del sistema); el **plan** que lo materialice declara a qué eje
> pertenece cada clase. Cuatro ejes equilibrados (32 · 32 · 22 · 32). Cada clase cae en **un** eje.

### Eje 1 · `entrada` — 32 clases (contiene el ESLABÓN LIMITANTE)
`A1` `A2` `A3` `A4.1` `A4.2` `A4.3` `A5` `A6.1` `A6.2` `A7` `A8.1` `A8.2` `A9` `A11` `A12` `A13` `A14` `A15`
· `N1` `N2` `N3` `N4` `N5` `N6` `N7` `N8` · `O1` `O2` · `P1` `P2` `P3` `P4` = **32**

### Eje 2 · `libro` — 32 clases
`B1` `B2` `B3` `B4` `B5` `B6` · `C1` `C2` `C3` `C4` `C5` `C6` · `E1` `E2` `E3` `E4` `E5` `E7` `E8` `E9` `E10` `E11`
· `L1` `L2` `L3` `L7` `L8` `L9` `L10` · `M1` `M2` `M3` = **32**

### Eje 3 · `fiscal` — 22 clases
`D1` `D2` `D3` `D4` `D5` `D6` `D7` `D8` `D9` `D12` `D13` `D14` `D15` · `G1` `G2` `G3` `G4` `G6` `G7` `G8` `G9` `G10` = **22**

### Eje 4 · `analitica` — 32 clases
`F1` `F2` `F3` `F4` · `H1` `H2` `H3` `H4` · `I1` `I2` `I3` `I4` · `J1` `J2` `J3` `J4` `J5` `J8` `J9` `J10`
· `K1` `K2` `K3` `K4` `K9` · `Q1` `Q2` `Q3` `Q4` · `R1` `R2` `R3` = **32**

> **Nota de diseño:** la analítica reúne las caras de actor (dueño Q · negocio R · producto K) porque
> todas **leen y narran** lo ya calculado; el `libro` reúne la revisión del asesor (L) porque es donde
> vive la medida maestra (firma, expediente, muestreo). **Reparto 32/32/22/32 = 118 clases.**

---

## CASOS LÍMITE (edge cases pertinentes — el diseño los trata, no los ignora)

| Caso | Cómo lo trata el diseño |
|---|---|
| **Hecho rectificativo** (corrige/anula uno anterior) | `A13` casa por clave natural (`M3`); no borra, **suma**. Plano 2 de corrección. El original queda; `B5` añade el ajuste. |
| **Documento ilegible** | `A4.1` con confianza bajo umbral → `A8.1` (cola asesor) → `A8.2` avisa. El flujo **no se bloquea**. `P3` lo resuelve o descarta con motivo. |
| **Duplicado** (reproceso / republicación) | `A7` + `M3`: la clave natural lo detecta; no se asienta dos veces. Si es rectificativo, no es duplicado. |
| **Operación intracomunitaria** | El hecho se admite igual; el tratamiento fiscal depende del **perfil administrativo** (`D15`) y de los **parámetros** (`D11`) declarados. El sistema no lo asume: si no está declarado → `[ABIERTO]`. `D4`/`D7` alimentan el modelo correspondiente. |
| **Cierre a caballo de medianoche** | Dos fechas (`fechaOperacion` ≠ `fechaValor`) que `C3` **conserva**; la imputación al periodo sigue el **criterio declarado**. Si el hecho llega tras el cierre de su periodo (`C4` irreversible) → se corrige **sumando** (`B5`), nunca reabriendo. |
| **Divisa / multi-moneda** | `E11` declara la moneda por cuenta; `E14` (diferencia de cambio) se **activa sólo si el dueño declara multi-moneda**; `Importe` exige tipo de cambio declarado. Sin declarar → moneda base única, sin E14. |
| **Tercero cliente + proveedor** | **Un solo maestro** (`N1`) con varios **roles**; `N2` lo identifica por número fiscal. Sus saldos por cobrar y por pagar conviven sin duplicar al tercero (conflicto ① resuelto). |
| **Periodo sin hechos** | `A12` calcula cobertura = 0 esperados / 0 recibidos; el sistema **no finge** un cuadre (`C6`): o declara "sin actividad", o avisa si **esperaba** hechos (`A15`). `C4` puede cerrar un periodo vacío; `C5` abre con saldos nulos. |
| **Documento que no cuadra (importe+impuestos)** | `A4.3` lo detecta → `A8.1` cola. Nunca se asienta "casi cuadrado". |
| **Movimiento bancario sin contrapartida** | `E7` lo reconoce/clasifica (juicio); `E9` explica el tránsito; `E8` fija la regla. No se ignora. |
| **Regla aprendida sin ratificar** | `L10` bloquea su acción sobre el volumen hasta el visto bueno del asesor. Vencida sin respuesta → no actúa. |
| **Hecho incompleto** | `A11` detecta campos faltantes → `A6.3 [ABIERTO]` decide (asienta provisional / espera / avisa). No se inventa. |
| **Fuente inactiva o que no publica** | `A15` declara el hueco (abierto + aviso). No se obliga a la fuente, no se asume vacío. |
| **Cifra sin documento que la pruebe** | `L7.verificarEnlace` → `ERROR_CIFRA_SIN_PRUEBA`: la firma no se sostiene sin expediente. |

---

## PREGUNTAS ABIERTAS [ABIERTO] (23 — se nombran, no se cierran)

> Estas 23 piezas son **parámetros declarables**, no huecos de diseño. Cada una ya tiene su clase y su
> punto de consumo; sólo falta que el dueño/asesor declaren el valor. Hasta entonces, la pieza **no actúa**.

| Pieza | Qué declara | Consumida por |
|---|---|---|
| `A6.3 regla-hecho-incompleto` | asienta provisional / espera / avisa | `A8.1`, `P3` |
| `A8.3 dueno-cola-revision` | quién resuelve cada cola y quién escala | `A8.1`, `P3` |
| `A10 catalogo-puertos-documento` | qué fuentes/canales declara cada negocio | `A4.2`, `A5` |
| `B7 criterio-clave-asiento` | cómo se forma la clave del asiento | `M3`, `A14` |
| `C7 criterio-periodo` | `momento_de_uso` / `unidad_de_cierre` | `C3`, `C4` |
| `D10 alcance-fiscal` | hasta dónde llega la capa fiscal | `D1`–`D9` |
| `D11 parametros-fiscales` | bases y tipos | `D1`, `D4`, `D5` |
| `E6 politica-cobro-pago` | plazos que declara el negocio | `N6`, `N8`, `E5` |
| `E14 diferencia-cambio` | ¿multi-moneda? ¿tipo? | `E3`, `I3` (se activa si procede) |
| `F5 parametros-amortizacion` | métodos/coeficientes/años | `F2` |
| `G5 calculo-nomina` | ¿calcula o sólo recibe? | `G1`, `G4` |
| `H5 coste-consumo` | de dónde sale el coste del consumo | `H1`, `H4`, `J2` |
| `H6 solape-custodia-contable` | ¿absorbe o sólo lee? | `H1`, `K3` |
| `I5 criterio-consolidacion` | criterio del conjunto | `I3` |
| `I6 vista-agregada` | consolidador de lectura / proyecto-oficina | `I3` |
| `I7 granularidad-grupo` | hasta dónde llega el grupo | `I1`, `I3` |
| `J6 dimensiones-analiticas` | centros/dimensiones por negocio | `J1`, `J2`, `J10` |
| `J7 criterio-reparto-indirecto` | reparto de no directos | `J5` |
| `K6 catalogo-avisos` | qué avisos, a quién, por qué canal | `K2`, `R1` |
| `K7 frontera-entrega` | forma de entrega al negocio | `R1`, `R2`, `R3` |
| `K8 modelo-licencia` | cómo se vende | `K1`, `K4` |
| `L6 formato-exportacion` | formato que exige el programa del asesor | `L1` |
| `M4 definicion-cierre` | `unidad_de_cierre` — la clave del cerrojo de idempotencia | `A14`, `A7`, `B7`, `C7` |

**Conflictos de validación cruzada resueltos en este diseño:**
① **dos maestros de terceros** → un solo maestro con roles (`N1` + faceta `N2`).
② **tres señales de cobertura** → una métrica única (`A12`); `Q3`/`P4`/`C6` son vistas.
③ **cuatro caminos de corrección** → mapa canónico de 4 planos (tabla en Relaciones).
④ **observadora que emite factura** → se diseña `O1` como emisora; si el dueño declara "solo observa",
   `O1` se degrada a admisión de una factura ya emitida (queda `[ABIERTO]`).
⑤ **la silla del cliente** → `Q` (dueño), `J8` (jefe) y `R` (negocio) se sirven a una o tres sillas
   según declare el dueño; el diseño soporta ambas (`[ABIERTO]`).
⑥ **trabajador humano vs automatización** → declarado: **no existe rol humano**; P1–P4 son el latido y
   el desatasco del PROCESO. La silla humana entra por las dos colas (asesor / dueño).
⑦ **diferencia de cambio** → `E14` sólo existe si el dueño declara multi-moneda (`[ABIERTO]`).

---

## Resumen de la fase

- **Clases:** **118 de dominio** — una por cada hoja atómica del árbol de F2 (los 3 cerrojos
  M1·M2·M3 incluidos), respetando su FORMA (60 REFLEJO · 29 CUSTODIO · 14 PUENTE · 8 MICRO-AGENTE ·
  7 CONVERSOR) — **+ 17 clases de soporte** (tipos del dominio) = **135 clases**. **Ninguna hoja sin clase.**
- **Puertos abiertos:** **16** — hechos de vertical · documento · documento digital · extracto bancario ·
  plan contable · parámetros fiscales · modelo fiscal (+acuse) · exportación al asesor · canal de avisos ·
  nómina · ficha de producto · terceros · consulta del dueño · entrega al negocio · archivo documental ·
  ejecución de cobro/pago. **Cero tecnología nombrada.**
- **Decisiones humanas:** **10** (todas por `SolicitudDecision` / `K9`); **23 piezas `[ABIERTO]`**
  declaradas como parámetros, ninguna estimada.
- **Invariantes:** **14** (partida doble · un hecho=un asiento · cobertura única · no se borra, suma ·
  no produce hechos · la ley es dato · dato ausente=[ABIERTO] · single-writer · append-only · frontera
  única de formatos · no firma/no decide · cierre irreversible · aislamiento · el mínimo se declara).
- **Eslabón limitante:** materializado como la **cadena de admisión** (eje 1): puerto de hechos → contrato
  mínimo → normalizador → captura/extracción/cuadre → resolución de contrapartida (asistida + regla) →
  deduplicación → lote → **válvula de 2 colas** → acción de desatasco → **métrica única de cobertura**,
  con el bucle excepción→regla→ratificación. **La entrada es el corazón, no una sección.**
- **Los 4 ejes:** `entrada` **32** · `libro` **32** · `fiscal` **22** · `analitica` **32** (listas por
  código arriba). Reparto 32/32/22/32 = 118, listo para que la F3b emita el plan.
- **⚠️ Confirmación explícita:** este documento **NO nombra ninguna tecnología, plataforma, framework,
  motor, lenguaje, canal de transporte, almacén, formato concreto ni producto** — los grupos A–R del
  esquema se han traducido a **clases de dominio**, el entorno externo vive en **puertos abiertos**, y
  la traducción a la plataforma queda **íntegramente** para la FASE 3b (adaptador). **PLASMA cumplido.**
