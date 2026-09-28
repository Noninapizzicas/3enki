# ESQUEMA MAESTRO — Sistema "CONTABILIDAD"

> **Fase:** 2 · esquematizar-negocio · **Vertical:** `contabilidad` · **Entregable gate:** este árbol.
> **Sujeto (de F0):** capacidad transversal **observadora VENDIBLE** — *"la vertical que le falta a las
> demás verticales para llevar la contabilidad de cada cual"*. No produce hechos de negocio: escucha
> los eventos que cada negocio ya emite y, junto con el cierre, **reconstruye** su contabilidad
> (flujo de caja, ventas, consumo, stock, compras). Emite **CÁLCULOS** (`contabilidad.*`).
> **Medida maestra:** que el **asesor la acepte y pueda presentarla** — cuadra sin una persona
> digitando, sin colapsar y sin entrar en bucle.
> **Alcance:** COMPLETO (el de una app de contabilidad profesional). Real, pura, vendible. **NO mínima.**
> **Sin tecnologías: puertos abiertos, agnosticismo.** Cero stack nombrado — cada pieza expone su
> puerto (entrada/salida), no su implementación. La única mención tecnológica admisible es el nombre
> de la vertical.
>
> **Este árbol es la CONSOLIDACIÓN de 16 pasadas:** 1 ronda global + 13 pasadas-2 por punto +
> 1 pasada-3 (el cuello) + **8 prismas de interlocutor** (dueño · asesor · administración · clientes ·
> proveedores · bancos · empleados · verticales) + **3 prismas de rol** (jefe · trabajador · cliente).

---

## 0 · El flujo declarado y el ESLABÓN LIMITANTE

**Flujo (F0):** hechos que cada negocio **ya emite** (ventas por eventos — camino ya construido) →
**digitalizar/recibir facturas → procesarlas → actualizar stock** → reconstrucción a partida doble
(asiento) → mayor/balanza → estados → fiscal → **cierre** → exportación/presentación al asesor.

**ESLABÓN LIMITANTE = LA ENTRADA DE LOS HECHOS (A · su normalización a asiento).**
Es *el paso cuya capacidad y programación restringen al conjunto*. **Por qué aquí y no en el cierre:**
- El camino de las **ventas por eventos ya está construido** → los hechos estructurados no son cuello.
- El **cierre** (C) es periódico y **determinista**: es un hito **aguas abajo** que sólo puede cuadrar
  **si la entrada está completa** → su capacidad la fija la entrada, no él.
- La **entrada** es **continua, heterogénea y con juicio**: cada factura (digitalizada o recibida
  digital), cada extracto y cada nómina llegan como **documento** que **hoy digita una persona**; hay
  que interpretarlos, hallar su contrapartida y decidir si están completos.
- Es **el único punto donde se rompe la promesa "sin operador"** y su calidad decide la medida maestra
  (que el asesor lo acepte y cuadre sin nadie digitando). Si la entrada no se normaliza sola, **nada
  aguas abajo cuadra** por perfectos que sean diario, mayor y estados.

> ⚠️ **El prisma del actor `verticales` REFUERZA este cuello — y lo agrava.** Ahí contabilidad es
> **SUBORDINADA**: lee, **no obliga**. La vertical productora emite como ya sabe (su formato, su
> granularidad, cuando quiere) y **contabilidad no puede imponerle** un formato único, ni obligarla a
> producir un hecho que no tenía, ni a declarar su unidad de cierre. Todo lo que el cuello necesita
> (contrato mínimo del hecho, cobertura, rectificativos, anclaje del cierre) **vive en la frontera de
> contabilidad**, nunca en la vertical. Esto no cambia el cuello: lo confirma como el punto donde la
> asimetría se paga. Por eso el grupo A crece (A11–A15) con las piezas que **adaptan** sin obligar.

### El cuello expandido al máximo (frenos → empujones)
| Freno del cuello | Empujón (pieza construible que lo abre) |
|---|---|
| Un documento debe interpretarse (hoy lo digita una persona) | **conversion-documento-a-dato** (extraccion-dato + puerto-documento + control-cuadre-documento) |
| "Recibirlas digitales" no existe hoy | **puerto-documento-digital** + **captura-documento** |
| Cada hecho debe hallar su cuenta y su tercero | **resolucion-contrapartida** (contrapartida-asistida + regla-contrapartida) |
| Documento ilegible / dato que no cuadra atasca el flujo | **cola-revision** (encolado-excepcion + aviso-revision) — el flujo NO se bloquea |
| Reprocesar duplicaría asientos (colapso/bucle) | **deduplicacion-hecho** + **clave-natural** (un hecho = un asiento) |
| Un hecho incompleto no se sabe si asentar | `regla-hecho-incompleto` → **ABIERTO** (pregunta al dueño) |
| Un hecho de negocio podría realimentar la operación | **frontera-planos** (sólo emite cálculos, nunca hechos) |
| La entrada en serie atasca el embudo | **lote-admision** (desacople: N hechos en paralelo) |
| **La vertical emite a su manera** y no se le puede imponer formato | **contrato-hecho-minimo** (A11) + **puerto-evento-vertical** (A1) — la homogeneización vive en la frontera |
| **La vertical emite tarde, fuera de orden o republica** | **hecho-rectificativo** (A13) + **deduplicacion-hecho** (A7) |
| **La vertical no declara su unidad de cierre** | **anclaje-cierre-vertical** (A14) — puerto construible, cuelga de `unidad_de_cierre` |
| **La vertical no publica ciertos hechos** (p.ej. consumo) | **declaracion-fuente-faltante** (A15) — se DECLARA el hueco, no se obliga a la vertical |
| **Nadie mide si la entrada se cubre** | **completitud-cobertura** (A12) + `tasa-cobertura-entrada` (P4) |

**Los empujones del cuello son las piezas del grupo A** (abajo): el corazón del esquema, no una sección.

---

## 1 · ÁRBOL POR GRUPOS (A–M globales + extensiones · N–R emergidos de actores)

> **Convención de estado:** `ATÓMICO` (hoja final) · `SPAWN` (nodo re-prismado cuyos hijos son las hojas) ·
> `REF` (deduplicada, ya vive en otro grupo) · `[ABIERTO]` (dato del dueño/actor, no se estima).
> **FORMA:** en esta vertical ninguna pasada declaró la forma
> (REFLEJO/CUSTODIO/AGENTE/PUENTE/CONVERSOR) de cada hoja → **FORMA: pendiente-diseccion** para TODAS
> las hojas (el detalle va en `pasada-diseccion.md`, otra tarea). **No se inventa.**

### A · ENTRADA-HECHOS — LA PUERTA (**ESLABÓN LIMITANTE**)
- A1 `puerto-evento-vertical` — ATÓMICO (puerto: hechos ya emitidos por las verticales)
- A2 `normalizador-hecho` — ATÓMICO (forma homogénea del hecho; una sola puerta de formato)
- A3 `captura-documento` — ATÓMICO (admite el documento: digitalizado o recibido)
- A4 `conversion-documento-a-dato` — SPAWN
  - A4.1 `extraccion-dato` — ATÓMICO (abre el documento → importes/fechas/tercero/líneas/impuestos)
  - A4.2 `puerto-documento` — ATÓMICO (formas declarables; el adaptador lo pone el sitio)
  - A4.3 `control-cuadre-documento` — ATÓMICO (si importe+impuestos no cuadran → cola, no se asienta mal)
- A5 `puerto-documento-digital` — ATÓMICO (recepción digital declarable; si no existe, se crea)
- A6 `resolucion-contrapartida` — SPAWN
  - A6.1 `contrapartida-asistida` — ATÓMICO (propone cuenta/tercero/periodo con el plan declarado)
  - A6.2 `regla-contrapartida` — ATÓMICO (regla declarable/aprendida: "este proveedor → esta cuenta")
  - A6.3 `regla-hecho-incompleto` — **[ABIERTO]** (¿asienta provisional / espera / avisa?)
- A7 `deduplicacion-hecho` — ATÓMICO (clave natural del hecho/documento → no duplica)
- A8 `cola-revision` — SPAWN
  - A8.1 `encolado-excepcion` — ATÓMICO (lo dudoso va a cola, el flujo continúa)
  - A8.2 `aviso-revision` — ATÓMICO (empujón al motor-avisos: "esto necesita revisión")
  - A8.3 `dueno-cola-revision` — **[ABIERTO]** (¿quién resuelve la cola: asesor, dueño o trabajador?)
- A9 `lote-admision` — ATÓMICO (desacople del cuello: N hechos en paralelo)
- A10 `catalogo-puertos-documento` — **[ABIERTO]** (qué fuentes/canales declara cada negocio)
- **A11 `contrato-hecho-minimo`** — ATÓMICO ⟨verticales⟩ (lista mínima de campos que un hecho debe traer para asentarse: tercero, fecha, importe, impuestos, forma de pago, clave natural. Es el contrato VISTO DESDE LA FUENTE: no un formato impuesto, un mínimo exigible)
- **A12 `completitud-cobertura`** — ATÓMICO ⟨verticales⟩ (mide qué hechos publicó una vertical y cuáles NO llegaron — "falta un documento" pasa a ser señal medible)
- **A13 `hecho-rectificativo`** — ATÓMICO ⟨verticales⟩ (el hecho posterior que corrige o anula uno anterior; contabilidad no borra, añade — espejo de `asiento-ajuste` B5, pero del lado del hecho)
- **A14 `anclaje-cierre-vertical`** — ATÓMICO ⟨verticales⟩ (declara POR VERTICAL qué es "un cierre" y cómo se identifica; ancla la clave natural — su puerto es construible; su contenido pende de `unidad_de_cierre`, dato del dueño)
- **A15 `declaracion-fuente-faltante`** — ATÓMICO ⟨verticales⟩ (detecta que una vertical no publica un hecho que se necesita y lo DECLARA — abierto + aviso; NO obliga a la vertical a producirlo)

### B · LIBRO-NÚCLEO — partida doble (plan · diario · mayor)
- B1 `catalogo-cuentas` — ATÓMICO (plan contable declarable/importable del asesor)
- B2 `escritor-diario` — ATÓMICO (single-writer: un solo escritor por parcela)
- B3 `mayor-balanza` — ATÓMICO (saldos por cuenta derivados del diario)
- B4 `traza-asiento` — ATÓMICO (inmutabilidad: quién y cuándo creó cada asiento)
- B5 `asiento-ajuste` — ATÓMICO (la corrección del asesor se suma encima, nunca borra)
- B6 `puerto-plan-contable` — ATÓMICO (frontera de codificación del plan: import/export)
- B7 `criterio-clave-asiento` — **[ABIERTO]** (se cierra con `unidad_de_cierre`)

### C · ESTADOS-CIERRE — balance · resultados · cierre · periodificación
- C1 `balance-situacion` — ATÓMICO · C2 `cuenta-resultados` — ATÓMICO
- C3 `periodificacion` — ATÓMICO (imputa cada hecho a su periodo; conserva fecha operación y fecha valor)
- C4 `cierre-ejercicio` — ATÓMICO (cierra el periodo con ajustes; irreversible salvo ajuste)
- C5 `apertura-ejercicio` — ATÓMICO (abre el siguiente desde el cierre anterior)
- C6 `aviso-cuadre` — ATÓMICO (no finge el cuadre: si falta cobertura, avisa)
- C7 `criterio-periodo` — **[ABIERTO]** (`momento_de_uso` / `unidad_de_cierre`)

### D · CAPA-FISCAL — IVA · IRPF/IS · retenciones · modelos · Verifactu · e-factura
- D1 `liquidacion-iva` — ATÓMICO (devengado/soportado derivado del libro) · D2 `modelo-303` — ATÓMICO
- D3 `modelo-390` — ATÓMICO · D4 `retenciones` — ATÓMICO · D5 `estimacion-is-irpf` — ATÓMICO
- D6 `calendario-fiscal` — ATÓMICO (plazos declarables → aviso proactivo)
- D7 `generador-modelo` — ATÓMICO (salida al programa del asesor) · D8 `registro-verifactu` — ATÓMICO
- D9 `factura-electronica` — ATÓMICO (formato estructurado)
- D10 `alcance-fiscal` — **[ABIERTO]** · D11 `parametros-fiscales` — **[ABIERTO]** (bases/tipos)
- **D12 `estado-presentacion-fiscal`** — ATÓMICO ⟨administración⟩ (ciclo de vida de cada obligación: pendiente → generada → presentada → justificada → atrasada; sin él el calendario avisa pero nadie sabe en qué punto está cada modelo)
- **D13 `acuse-presentacion`** — ATÓMICO ⟨administración⟩ (recoge y liga el justificante/acuse que devuelve la administración a su modelo y a su asiento — cierra el bucle hacia fuera)
- **D14 `rectificacion-declaracion`** — ATÓMICO ⟨administración⟩ (corrección POSTERIOR a la presentación: complementaria/sustitutiva; ≠ `asiento-ajuste` B5)
- **D15 `perfil-administrativo`** — ATÓMICO ⟨administración⟩ (qué administraciones y obligaciones aplican al negocio: territorio y régimen; ≠ `parametros-fiscales` D11, que son tipos y bases)

### E · TESORERÍA — bancos · conciliación · previsión de caja
- E1 `conciliacion-bancaria` — ATÓMICO · E2 `puerto-extracto` — ATÓMICO
- E3 `cuadre-cobro-pago` — ATÓMICO (un movimiento bancario = un cobro/pago)
- E4 `saldo-tesoreria` — ATÓMICO · E5 `prevision-caja` — ATÓMICO
- E6 `politica-cobro-pago` — **[ABIERTO]** (plazos que declara el negocio)
- **E7 `partida-no-identificada`** — ATÓMICO ⟨bancos⟩ (movimiento del extracto sin contrapartida en el libro — comisión, interés, devolución: se reconoce y se asienta, no se ignora)
- **E8 `regla-movimiento-bancario`** — ATÓMICO ⟨bancos⟩ (regla declarable/aprendida que clasifica el movimiento bancario recurrente: "esta comisión → esta cuenta")
- **E9 `partida-conciliatoria`** — ATÓMICO ⟨bancos⟩ (partidas en tránsito que explican el desfase saldo banco ↔ saldo contable: cheque no cobrado, cobro no apuntado)
- **E10 `informe-conciliacion`** — ATÓMICO ⟨bancos⟩ (el documento de cuadre; la prueba de que el cuadre cuadra)
- **E11 `maestro-cuentas-bancarias`** — ATÓMICO ⟨bancos⟩ (catálogo declarable de cuentas y su moneda; sin él "el banco" es un solo número falso)
- **E12 `diferencia-cambio`** — **[ABIERTO]** ⟨bancos⟩ (diferencia por moneda distinta de la base; se activa SÓLO si el dueño declara multi-moneda)

### F · INMOVILIZADO — altas · amortizaciones · bajas
- F1 `alta-activo` — ATÓMICO · F2 `plan-amortizacion` — ATÓMICO (genera la cuota al cierre)
- F3 `baja-activo` — ATÓMICO · F4 `valor-neto-contable` — ATÓMICO
- F5 `parametros-amortizacion` — **[ABIERTO]** (métodos/coeficientes)

### G · PERSONAL — nóminas · seguros sociales
- G1 `recibo-nomina` — ATÓMICO · G2 `obligacion-seguridad-social` — ATÓMICO
- G3 `asiento-personal` — ATÓMICO · G4 `puerto-nomina` — ATÓMICO
- G5 `calculo-nomina` — **[ABIERTO]** (¿calcula o sólo recibe el hecho?)
- **G6 `lineas-nomina`** — ATÓMICO ⟨empleados⟩ (desglose bruto / retención / cotización del trabajador / neto; hace la nómina EXPLICABLE, no un número pelado)
- **G7 `acceso-nomina`** — ATÓMICO ⟨empleados⟩ (aislamiento de la nómina como dato personal: cada uno ve la suya)
- **G8 `pagos-a-cuenta-empleado`** — ATÓMICO ⟨empleados⟩ (anticipos y adelantos: no todo es sueldo fijo)
- **G9 `conceptos-extra-nomina`** — ATÓMICO ⟨empleados⟩ (dietas, retribución en especie, finiquitos, pagas extra)
- **G10 `liquidacion-baja-empleado`** — ATÓMICO ⟨empleados⟩ (cierre de la cuenta del trabajador con su finiquito/indemnización, para que no quede un acreedor abierto)

### H · EXISTENCIAS — inventario valorado
- H1 `valoracion-existencia` — ATÓMICO (capa de valor sobre el inventario existente)
- H2 `frontera-ficha-producto` — ATÓMICO (puerto declarable del coste; si falta, se crea)
- H3 `ajuste-inventario` — ATÓMICO (regulariza merma/rotura con asiento y aviso)
- H4 `variacion-stock-valorada` — ATÓMICO (entrada por compra / salida por consumo)
- H5 `coste-consumo` — **[ABIERTO]** (`fuente_coste_consumo`) · H6 `solape-custodia-contable` — **[ABIERTO]**

### I · GRUPO — multi-sociedad · consolidación
- I1 `marca-sociedad` — ATÓMICO · I2 `eliminacion-intercompany` — ATÓMICO
- I3 `consolidacion` — ATÓMICO · I4 `aislamiento-negocio` — ATÓMICO (multi-tenant sin fuga)
- I5 `criterio-consolidacion` — **[ABIERTO]** · I6 `vista-agregada` — **[ABIERTO]** · I7 `granularidad-grupo` — **[ABIERTO]**

### J · ANALÍTICA / MANDO — centros de coste · márgenes · desviaciones · cuadro de conjunto
- J1 `etiquetado-analitico` — ATÓMICO · J2 `margen-analitico` — ATÓMICO
- J3 `presupuesto` — ATÓMICO · J4 `desviacion` — ATÓMICO (dispara aviso si se sale)
- J5 `coste-indirecto` — ATÓMICO (cubre lo que la pieza existente no cubre para grupo)
- J6 `dimensiones-analiticas` — **[ABIERTO]** · J7 `criterio-reparto-indirecto` — **[ABIERTO]**
- **J8 `cuadro-mando-contable`** — ATÓMICO ⟨jefe⟩ (agregación de conjunto: caja · resultado · margen · desviación · ejercicio, sin bajar al asiento)
- **J9 `comparador-periodos`** — ATÓMICO ⟨jefe⟩ (ejercicio vs ejercicio, mes vs mes, real vs presupuesto; reutiliza `presupuesto` J3 y `desviacion` J4, no los duplica)
- **J10 `tablero-margen-dimension`** — ATÓMICO ⟨jefe⟩ (cruce de `margen-analitico` J2 × `dimensiones-analiticas` J6 bajo lente de conjunto: por centro, familia o sociedad)

### K · PRODUCTO-SERVICIO — multi-tenant · licencias · onboarding · informes · avisos
- K1 `onboarding-negocio` — ATÓMICO · K2 `motor-avisos` — ATÓMICO (**produce** el aviso — requisito 4 del dueño)
- K3 `informe-rico` — ATÓMICO (contexto y profundidad, no un número pelado) · K4 `activacion-vertical` — ATÓMICO
- K5 `aislamiento-negocio` — **REF** (ya en I4)
- K6 `catalogo-avisos` — **[ABIERTO]** · K7 `frontera-entrega` — **[ABIERTO]** · K8 `modelo-licencia` — **[ABIERTO]**
- **K9 `cola-declaraciones-criterio`** — ATÓMICO ⟨jefe⟩ (UNA sola cola donde el jefe fija/ratifica todos los criterios: cierra los criterios de B1/B7 · C7 · E6 · F5 · J6 · D11 · I5 que hoy están pendientes sin pieza que los recoja declarativamente)

### L · REVISIÓN-ASESOR — exportación · diálogo · ajuste · firma (la medida maestra)
- L1 `puerto-exportacion` — ATÓMICO (formatos contables estándar hacia el asesor)
- L2 `vista-revisable` — ATÓMICO (todo asiento/cálculo explicado — no caja negra)
- L3 `flujo-firma` — ATÓMICO (marca de revisado/firmado por el asesor; el sistema NO firma)
- L4 `asiento-ajuste` — **REF** (B5) · L5 `cola-revision` — **REF** (A8)
- L6 `formato-exportacion` — **[ABIERTO]**
- **L7 `expediente-documental`** — ATÓMICO ⟨asesor⟩ (cada cifra con el documento origen ARCHIVADO y ENLAZADO: la prueba que sostiene la firma ante una inspección — L2 explica, el expediente CONSERVA la prueba)
- **L8 `control-calidad-muestreo`** — ATÓMICO ⟨asesor⟩ (qué exige ojo humano: alto importe, sin regla, contrapartida nueva, cuadre dudoso — excepción + muestra, no revisar todo)
- **L9 `cambio-desde-ultima-revision`** — ATÓMICO ⟨asesor⟩ (delta: asientos nuevos, ajustes y reglas cambiadas desde su último visto bueno)
- **L10 `ratificacion-regla-aprendida`** — ATÓMICO ⟨asesor⟩ (el asesor ratifica o bloquea la regla aprendida ANTES de que actúe sobre el volumen — cubre `regla-contrapartida` A6.2 y `regla-movimiento-bancario` E8)

### M · ANTI-BUCLE — los 3 cerrojos transversales (invariantes)
- M1 `frontera-planos` — ATÓMICO (sólo emite cálculos `contabilidad.*`, nunca hechos de negocio)
- M2 `single-writer` — ATÓMICO (un solo escritor por parcela — aplica a todo custodio)
- M3 `clave-natural` — ATÓMICO (idempotencia: reprocesar no duplica)
- M4 `definicion-cierre` — **[ABIERTO]** (`unidad_de_cierre`: la clave de todo el cerrojo 3)

---

### N · TERCEROS — maestro fiscal único de clientes y proveedores ⟨clientes + proveedores⟩
- N1 `maestro-terceros` — ATÓMICO (ficha única de cliente/proveedor: identificación fiscal, condiciones de pago/cobro, historial de facturas y cobros. **Hueco real del esquema**: A6.1 propone "cuenta/tercero" y el tercero no existía)
- N2 `padron-terceros` — ATÓMICO (identidad única del tercero por su número fiscal — un proveedor escrito de tres formas sigue siendo uno; unificación de identidad)
- N3 `cuenta-proveedor` — ATÓMICO (mayor auxiliar del tercero: cada factura de compra viva y su saldo)
- N4 `estado-cuenta-proveedor` — ATÓMICO (el extracto confrontable con el proveedor — conciliación de saldos)
- N5 `cruce-factura-recepcion` — ATÓMICO (cotejo pedido ↔ recepción ↔ factura antes de asentar; lo que no cuadra → cola)
- N6 `vencimiento-pago` — ATÓMICO (fecha de vencimiento por factura → alimenta `prevision-caja` E5 y `motor-avisos` K2)
- N7 `rappel-pronto-pago` — ATÓMICO (descuentos/rappels/anticipos que ajustan el coste real de la compra a lo realmente pagado)
- N8 `antiguedad-de-saldos` — ATÓMICO (lo pendiente clasificado por vencimiento — quién y cuánto está vencido; espejo de N6 del lado del cobro; alimenta reclamación y `politica-cobro-pago` E6)

### O · FACTURACIÓN EMITIDA (venta) ⟨clientes⟩
- O1 `emision-factura-venta` — ATÓMICO (la cara emitida: serie/numeración, datos fiscales del emisor y del cliente, desglose de impuestos; ≠ `registro-verifactu` D8, que es el registro interno no alterable, y ≠ `factura-electronica` D9, que es el formato estructurado)
- O2 `factura-rectificativa` — ATÓMICO (corrección comercial POSTERIOR a la emisión: abono/devolución/descuento, que no borra nada; ≠ ajuste interno B5)

### P · CONTROL DEL PROCESO (entrada) ⟨trabajador⟩
- P1 `panel-proceso-contable` — ATÓMICO (latido del pipeline: qué entra, qué se procesa, qué está en cola, qué falla — el "display de cocina" de la contabilidad)
- P2 `historial-proceso-contable` — ATÓMICO (registro append-only de lo procesado y lo fallado con su rastro; ≠ `traza-asiento` B4, que es del ASIENTO, no del PROCESO de la entrada)
- P3 `desatasco-entrada` — ATÓMICO (resolver/reencolar/descartar una excepción con su motivo — la ACCIÓN que completa `cola-revision` A8, que sólo encola)
- P4 `tasa-cobertura-entrada` — ATÓMICO (proporción de hechos que entran sin intervención vs caen a cola — la métrica que PRUEBA la promesa "sin una persona digitando")

### Q · CONSULTA DEL DUEÑO (puerta *pull*) ⟨dueño⟩
- Q1 `consulta-cuentas-bajo-demanda` — ATÓMICO (el dueño pregunta cuando quiere y el sistema contesta; sin cadencia impuesta — distinto del cuadro del jefe, que sí impone cadencia y agregación)
- Q2 `puente-lenguaje-dueño` — ATÓMICO (traductor bidireccional: su pregunta → consulta contable; cálculo → cifra en su idioma — caja, deuda, resultado, "¿puedo pagar X?")
- Q3 `sello-cobertura` — ATÓMICO (marca de completitud de lo consultado, fuera de ciclo: si falta cobertura lo dice ANTES de que decida — ≠ `aviso-cuadre` C6, que sólo avisa al cierre)
- Q4 `marca-borrador-validado` — ATÓMICO (estado del dato que ve: en curso / revisado / firmado — para no decidir sobre un borrador vivo como si fuera definitivo)

### R · ENTREGA AL NEGOCIO (rol cliente) ⟨rol cliente⟩
- R1 `aviso-al-negocio` — ATÓMICO (el aviso ENTREGADO y confirmado al negocio cliente; cara de entrega — completa `motor-avisos` K2, que sólo PRODUCE)
- R2 `informe-accionable` — ATÓMICO (todo informe que recibe el cliente lleva QUÉ HACER con él; refuerza `informe-rico` K3 y lo quita de adorno)
- R3 `narrador-estados` — ATÓMICO (traduce balance/resultado al LENGUAJE del negocio cliente: "esto es lo que te ha pasado y lo que viene")

---

## 2 · RELACIONES clave (cómo fluye la cadena)

1. **A** (entrada — el cuello) → **B** (asiento) → **C** (estados/cierre) → **D** (fiscal); **E/F/G/H** alimentan a B desde sus hechos.
2. **A** es la única puerta de hechos: eventos (**A1**, contrato **A11**) y documentos (**A3–A5**). Todo lo demás **lee de B**. El contrato mínimo (**A11**) es la cara vista desde la fuente; la cobertura (**A12**) mide si la puerta se llenó.
3. **A13–A14** cierran el lado de la fuente: el rectificativo casa con su original por **M3**, y el anclaje del cierre (**A14**) fija, por vertical, la clave de idempotencia que hoy cuelga de `unidad_de_cierre`.
4. **N** (terceros) es el **maestro fiscal** que A6.1 necesitaba: **N1/N2** dan identidad al tercero; **N3/N8** abren las cuentas auxiliares (por pagar / por cobrar); **N5** coteja antes de asentar; **N6** alimenta la previsión de caja.
5. **O** (facturación emitida) es la cara que ve el cliente: **O1** emite y **O2** rectifica; ambas se apoyan en **D8/D9** (registro y formato) sin confundirse con ellos.
6. **H2** (frontera-ficha-producto) alimenta **H4/H5** (valoración) → **J2** (márgenes) — el coste enlaza existencias con analítica. **N5/N7** (compra verificada y rappels) fijan el coste real de entrada.
7. **L** (asesor) cierra el bucle: exporta (**L1**), el asesor revisa por muestra (**L8**), ratifica reglas (**L10**), ajusta (**B5/L4**) y firma (**L3**) → **medida maestra**. **L7** conserva la prueba; **L9** da el delta entre revisiones.
8. **D12–D13** cierran el bucle fiscal hacia fuera: el modelo sale (**D7**) y el acuse vuelve ligado (**D13**); lo mal declarado se rectifica (**D14**), no se borra.
9. **J8–J10** son la lente del jefe sobre J (agregación, comparación y margen por dimensión); **K9** es la puerta declarativa única que cierra los criterios abiertos.
10. **P** hace observable y operable la entrada (**P1/P2**), da la acción de desatasco (**P3**) y prueba la promesa con la métrica de cobertura (**P4**).
11. **Q** es la cara *pull* del dueño (mirar cuando quiere, con sello de cobertura y de estado) y **R** la cara de entrega al negocio (aviso entregado, informe accionable, estados narrados).
12. **M** es transversal: **M1** garantiza que nada de contabilidad realimenta la operación (anti-bucle); **M2/M3** hacen segura la automatización sin operador.
13. **F2** (amortización) y **C4** (cierre) son hechos/momentos que **produce el tiempo**, no un negocio → se generan sin operador (**§Q58** pregunta si contabilidad debe autoproducirlos).
14. **K2** (motor-avisos) es consumido por **A8.2**, **C6**, **D6**, **E5**, **J4** y **R1** → los avisos nacen de señales reales y **se entregan** (no pantalla muda).

---

## 3 · ESLABÓN LIMITANTE — decisión y qué lo gobierna
El cuello es **A · ENTRADA-HECHOS**. Se expande con: **conversion-documento-a-dato** (extrae el dato
sin persona), **puerto-documento-digital** (la recepción digital declarable), **resolucion-contrapartida**
(halla cuenta/tercero con regla declarable/aprendida), **cola-revision** (lo dudoso no atasca),
**deduplicacion-hecho** (anti-bucle), y **lote-admision** (desacople: N en paralelo). El bucle
**resultados reales → regla-contrapartida (A6.2) → contrapartida-asistida (A6.1)** convierte el trabajo
que hoy hace una persona en una regla que se afina con cada documento resuelto. Y **la asimetría con la
vertical subordinada** añade su borde propio: **A11–A15** adaptan la fuente sin obligarla. La cadena
queda tan fuerte como lo que mida esta puerta — por eso es el corazón, no una sección.

---

## 4 · PIEZAS QUE SOLO EMERGEN DESDE UN ACTOR

> Estas piezas **no se ven desde la vista global**: el prisma del sistema por dentro no las revela
> porque sólo cobran existencia cuando se mira desde la silla de quien tiene que poder
> *mirar, revisar, declarar, cobrar, pagar, conciliar, entregar o controlar*. Se listan aquí **por actor**
> (corte transversal), aunque en §1 ya están integradas en su grupo funcional. **No se duplican por estar
> en dos vistas: son las mismas hojas, vistas dos veces.**

### 4.1 · Por actor

| Actor (silla) | Piezas nuevas | Cuántas |
|---|---|---|
| **dueño del negocio** (relacional · canal *consulta*) | `consulta-cuentas-bajo-demanda` (Q1) · `puente-lenguaje-dueño` (Q2) · `sello-cobertura` (Q3) · `marca-borrador-validado` (Q4) | **4** |
| **asesor / contable** (canal *revisión*) | `expediente-documental` (L7) · `control-calidad-muestreo` (L8) · `cambio-desde-ultima-revision` (L9) · `ratificacion-regla-aprendida` (L10) | **4** |
| **administración** (canal *presentación*) | `estado-presentacion-fiscal` (D12) · `acuse-presentacion` (D13) · `rectificacion-declaracion` (D14) · `perfil-administrativo` (D15) | **4** |
| **clientes** (canal *facturación*) | `emision-factura-venta` (O1) · `factura-rectificativa` (O2) · `antiguedad-de-saldos` (N8) · `maestro-terceros` (N1) | **4** |
| **proveedores** (canal *facturación*) | `padron-terceros` (N2) · `cuenta-proveedor` (N3) · `estado-cuenta-proveedor` (N4) · `cruce-factura-recepcion` (N5) · `vencimiento-pago` (N6) · `rappel-pronto-pago` (N7) | **6** |
| **bancos** (canal *extractos*) | `partida-no-identificada` (E7) · `regla-movimiento-bancario` (E8) · `partida-conciliatoria` (E9) · `informe-conciliacion` (E10) · `maestro-cuentas-bancarias` (E11) · `diferencia-cambio` (**E12 [ABIERTO]**) | **6** |
| **empleados** (canal *nómina*) | `lineas-nomina` (G6) · `acceso-nomina` (G7) · `pagos-a-cuenta-empleado` (G8) · `conceptos-extra-nomina` (G9) · `liquidacion-baja-empleado` (G10) | **5** |
| **las otras verticales** (canal *bus de eventos* — FUENTE) | `contrato-hecho-minimo` (A11) · `completitud-cobertura` (A12) · `hecho-rectificativo` (A13) · `anclaje-cierre-vertical` (A14) · `declaracion-fuente-faltante` (A15) | **5** |
| **ROL jefe** (interna · decide y declara) | `cuadro-mando-contable` (J8) · `comparador-periodos` (J9) · `tablero-margen-dimension` (J10) · `cola-declaraciones-criterio` (K9) | **4** |
| **ROL trabajador** (interna · opera hoy) | `panel-proceso-contable` (P1) · `historial-proceso-contable` (P2) · `desatasco-entrada` (P3) · `tasa-cobertura-entrada` (P4) | **4** |
| **ROL cliente** (interna · recibe · el negocio) | `aviso-al-negocio` (R1) · `informe-accionable` (R2) · `narrador-estados` (R3) | **3** |
| **TOTAL** | | **49 piezas emergidas de actores (48 ATÓMICAS + 1 [ABIERTO])** |

### 4.2 · Validación cruzada — piezas que varios actores comparten (REFUERZOS)

| Necesidad | Piezas que la tocan desde varias sillas | Lectura |
|---|---|---|
| **Maestro único del tercero** | `maestro-terceros` (clientes · N1) + `padron-terceros` (proveedores · N2) | **Refuerzo fuerte** → son la MISMA necesidad (identidad fiscal única). Se mantienen como dos facetas (ficha funcional + identidad por número fiscal), pero **deben ser un solo maestro** o habrá dos terceros contradictorios (ver conflicto ①). |
| **Vencimientos (cobro y pago)** | `antiguedad-de-saldos` (clientes · N8) + `vencimiento-pago` (proveedores · N6) | **Simétricas** → una sola lógica de "vencimientos" con dos lados (por cobrar / por pagar); ambas alimentan `prevision-caja` E5 y `motor-avisos` K2. |
| **Regla aprendida y su clasificación** | `regla-contrapartida` (A6.2) + `regla-movimiento-bancario` (bancos · E8) + `ratificacion-regla-aprendida` (asesor · L10) | **Refuerzo**: todas las reglas aprendidas deben pasar por **UNA** ratificación (L10), no por tres puertas distintas. |
| **Medir la cobertura** | `completitud-cobertura` (verticales · A12, por fuente) + `sello-cobertura` (dueño · Q3, por consulta) + `aviso-cuadre` (C6, al cierre) | **Refuerzo con riesgo** → tres señales de completitud deben beber de **una misma métrica de cobertura** (ver conflicto ②). |
| **Informe con contexto y acción** | `informe-rico` (K3) + `puente-lenguaje-dueño` (dueño · Q2) + `narrador-estados` (rol cliente · R3) + `informe-accionable` (rol cliente · R2) | **Refuerzo**: un núcleo de informe rico servido en **idiomas distintos** (dueño: caja/deuda; cliente: lenguaje de negocio). No se fusionan los traductores; sí comparten el núcleo. |
| **Agregar lo económico** | `cuadro-mando-contable` (jefe · J8) + `comparador-periodos` (J9) + `tablero-margen-dimension` (J10) vs `margen-analitico` J2 / `desviacion` J4 / `presupuesto` J3 | **Refuerzo sin duplicar**: el jefe reutiliza J, añade la lente de conjunto. |
| **Aislar** | `aislamiento-negocio` (I4, entre negocios) + `acceso-nomina` (empleados · G7, dentro del negocio) | **Refuerzo**: dos ejes de aislamiento (tenant ↔ persona); se complementan, no se sustituyen. |
| **Contrato de la fuente** | `contrato-hecho-minimo` (A11) + `puerto-evento-vertical` (A1) + `catalogo-puertos-documento` (A10) | **Refuerzo**: el contrato es la cara declarada del puerto. |
| **Qué es "un cierre"** | `anclaje-cierre-vertical` (A14) + `definicion-cierre` (M4 [ABIERTO]) + `criterio-clave-asiento` (B7 [ABIERTO]) + F0 `unidad_de_cierre` | **Refuerzo**: UNA declaración debe alimentar los cuatro. A14 es el puerto construible; los otros tres cierran con la misma respuesta. |
| **Corrección que no borra** | `asiento-ajuste` (B5) + `hecho-rectificativo` (A13) + `factura-rectificativa` (O2) + `rectificacion-declaracion` (D14) | **Refuerzo ordenado**: cuatro planos de corrección (interno / del hecho / comercial / fiscal) — coherentes si NO se confunden (ver conflicto ③). |

### 4.3 · Validación cruzada — CONFLICTOS detectados

- **① Dos maestros de terceros.** `maestro-terceros` (N1, desde clientes) y `padron-terceros` (N2, desde proveedores) describen la misma necesidad. Si se construyen como dos fichas, un mismo tercero que es cliente y proveedor a la vez quedará duplicado y sus saldos no cuadrarán. **Decisión de padre:** un solo maestro con dos facetas, o se justifica por qué no.
- **② Tres señales de cobertura.** `completitud-cobertura` (A12, por fuente/vertical), `sello-cobertura` (Q3, por consulta del dueño) y `aviso-cuadre` (C6, al cierre) pueden **contradecirse** si cada una calcula "lo que falta" a su manera. **Decisión:** una sola métrica de cobertura; las tres son sus vistas.
- **③ Cuatro caminos de corrección que no deben confundirse.** `asiento-ajuste` B5 (interno contable) · `hecho-rectificativo` A13 (del hecho fuente) · `factura-rectificativa` O2 (comercial, posterior a emisión) · `rectificacion-declaracion` D14 (fiscal, posterior a presentación). Son **cuatro planos distintos**; tratarlos como uno solo rompería trazabilidad o fiscalidad. **Decisión:** mapa canónico que ligue los cuatro (una rectificativa comercial puede provocar un ajuste interno y, si ya se declaró, una rectificación fiscal — pero son tres actos, no uno).
- **④ Observadora que emite factura.** `emision-factura-venta` (O1) pide que el sistema **emita** un documento — y el sujeto se declara **observador** que no produce hechos de negocio. **Conflicto de identidad, no resuelto:** ¿el sistema emite la factura o sólo observa una emitida? (ya abierto como §Q21 y refrendado por el prisma de clientes). Hasta responder, O1 es ATÓMICO pero su encaje en la identidad "observadora" queda **[ABIERTO]**.
- **⑤ La silla del cliente: ¿el negocio o el dueño?** F0 dice *"el NEGOCIO, no un dueño concreto"*; el ROL cliente es el negocio que **recibe**; el interlocutor `clientes` es **quien es facturado** (otro). Si el cliente-que-recibe coincide con el dueño/jefe en la misma persona, las caras Q (dueño), J8 (jefe) y R (cliente) se sirven a **una sola silla**; si no, a **tres**. **No declarado** → decide si estas tres caras son una o varias.
- **⑥ Trabajador humano vs automatización.** El ROL trabajador (P1–P4) es ambiguo por mandato: la promesa es "sin operador", pero `dueno-cola-revision` (A8.3) sigue `[ABIERTO]`. Si el trabajador es humano y hay **varios a la vez**, choca con **M2 single-writer** (concurrencia sobre la misma cola). **Decisión raíz:** ¿quién ocupa la silla? (ver §Q65).
- **⑦ `diferencia-cambio` (E12) depende de multi-moneda.** Si el dueño no declara multi-moneda (§Q20), E12 no existe y `maestro-cuentas-bancarias` (E11) asume moneda base única. **Conflicto latente** hasta esa respuesta.

---

## 5 · PUERTOS ABIERTOS (agnosticismo — cero tecnologías)

- **Hechos de las verticales** (A1, A11): el canal por el que cada negocio publica sus hechos — puerto, no transporte. **La vertical manda; contabilidad se adapta.**
- **Documentos** (A3–A5, H2, G4): formas y canales declarables; reemplazables; si falta una, se crea (invariante).
- **Extractos bancarios** (E2): canal declarable, un adaptador por banco.
- **Cuentas bancarias y su moneda** (E11): catálogo declarable.
- **Plan contable** (B1/B6): frontera de codificación (import/export del plan del asesor).
- **Modelos fiscales** (D7): salida al programa del asesor — formato ABIERTO. Retorno por el puerto del acuse (D13).
- **Maestro de terceros** (N1/N2): puerto declarable de identidad fiscal (clientes y proveedores).
- **Facturación emitida** (O1): puerto del documento que ve el cliente (serie, datos fiscales, desglose).
- **Proceso de la entrada** (P1–P4): cara de control observable; su transporte es un puerto, no un stack.
- **Consulta del dueño** (Q1): puerta *pull* declarable — desde dónde consulta no está declarado.
- **Entrega al negocio** (R1–R3, K7): canal y forma de entrega del informe/aviso, declarables.
- **Declaración de criterios** (K9): la cola declarativa declarable (dónde y cómo fija el jefe los criterios).
- **Procesamiento**: cero tecnologías nombradas — cada pieza expone su puerto (entrada/salida), no su implementación.

---

## 6 · PREGUNTAS ABIERTAS AL DUEÑO (guion COMPLETO — tabla única, cero supuestos)

> **Ley de cero supuestos:** lo no declarado no se estima. Cada fila cierra (o abre) el dato de una
> pieza. La columna **"También desde"** registra **qué otras sillas** hicieron la misma pregunta
> (validación cruzada del guion: una pregunta repetida por varios actores es una pregunta que muerde).

| # | Origen | Pregunta abierta | Nodos que toca | También desde |
|---|---|---|---|---|
| **1** | F0 | `cuando_reconstruye` — ¿reconstruye en tiempo real, en el cierre, o ambos? | A, C | verticales · trabajador · bancos |
| **2** | F0 | `unidad_de_cierre` — ¿qué es "un cierre" (jornada/día/mes) y cómo se identifica? (clave natural del asiento) | A7, A14, B7, C7, M4 | verticales · trabajador |
| **3** | F0 | `fuente_coste_consumo` — ¿de dónde sale el coste del consumo (ficha, receta, otro)? | H2, H5, J2 | verticales · existencias |
| **4** | F0 | `alcance_fiscal` — ¿hasta dónde llega la capa fiscal (qué modelos)? es un mundo, no un módulo | D10, D1–D9 | administración |
| **5** | F0 | `recepcion_digital_facturas` — ¿por qué canal/formato llegan las "facturas recibidas digitales"? | A5, D9 | administración · clientes · proveedores |
| **6** | F0 | `cola_revision` — ¿qué pasa con un documento ilegible o un dato que no cuadra? ¿quién lo resuelve? | A8, L5 | asesor · trabajador · dueño |
| **7** | F0 | `catalogo_avisos` — ¿qué avisos, a quién y por qué canal? (requisito 4 del dueño) | K2, K6 | dueño · jefe · rol cliente |
| **8** | F0 | `vista_agregada` — ¿consolidador de sólo lectura o proyecto-oficina? | I6 | jefe |
| **9** | F0 | `granularidad_de_grupo` — ¿hasta dónde llega el grupo (empresas/multi-sociedad/sucursales)? | I5, I7 | jefe |
| **10** | F0 | `solape_marketing_budget` — ¿contabilidad absorbe o sólo lee lo que ya custodia otra pieza? | H6 | verticales · rol cliente |
| **11** | F0 | `momento_de_uso` — ¿con qué ritmo se usa (día/mes/cierre)? | C7, K1 | dueño · jefe · trabajador |
| **12** | F0 | `frontera_primera_entrega` — ¿qué entra en la primera entrega y qué en las siguientes? | K7 | rol cliente |
| **13** | prisma global | ¿El producto **calcula nóminas** o sólo recibe el hecho de otro sistema? (consolida la duplicada "¿nómina se calcula o se recibe?") | G5 | empleados · asesor |
| **14** | prisma global | ¿Qué **métodos/coeficientes de amortización** admite? | F5 | inmovilizado |
| **15** | prisma global | ¿Qué **método de valoración** de existencias (FIFO / coste medio / otro)? | H1 | existencias |
| **16** | prisma global | ¿Qué **formato de exportación** exige el programa del asesor? | L6 | asesor |
| **17** | prisma global | ¿Bases y **tipos fiscales** de cada negocio? | D11 | administración |
| **18** | prisma global | ¿Qué **centros de coste / dimensiones** declara cada negocio? | J6 | jefe |
| **19** | prisma global | ¿El **ajuste** reemplaza o suma? (forma del camino de ajuste) | L4/B5 | asesor |
| **20** | prisma global | ¿**Multi-moneda**? ¿conversión y a qué tipo? | I5, E12 | bancos · grupo |
| **21** | prisma global | ¿El sistema **ejecuta** cobros/pagos o sólo los **observa**? | E | clientes · bancos · empleados |
| **22** | dueño | ¿Desde **dónde y en qué forma** consulta el dueño sus cuentas? (el canal se declara; su forma no) | Q1 | — |
| **23** | dueño | ¿Hasta dónde quiere **bajar al detalle** cuando algo no le cuadra? | Q1, L2, B3 | — |
| **24** | dueño | ¿Qué **cifra le hace decidir** (caja mínima, deuda máxima)? — umbrales de decisión | Q1, E5 | jefe |
| **25** | dueño + jefe + asesor | ¿**Quién declara/ratifica los criterios** contables: el jefe (ROL), el asesor (import), o ambos y en qué orden? | K9, B1/B6, I6 | — |
| **26** | asesor | ¿Revisa **por excepción y muestra** o exige el libro entero? | L8 | — |
| **27** | asesor | ¿**Ratifica cada regla aprendida** o sólo revisa el resultado? | L10, A6.2, E8 | — |
| **28** | asesor | ¿**Nivel de la firma**: por periodo, por estado o por documento? | L3 | — |
| **29** | asesor + jefe | El **plan contable**, ¿lo importa el asesor o lo declara el negocio? | B1, B6 | — |
| **30** | administración | **Territorio**: ¿administración estatal, foral o autonómica? | D15 | — |
| **31** | administración | **Régimen de IVA**: ¿general, simplificado, recargo de equivalencia? | D15, D1 | — |
| **32** | administración | **Sujeto fiscal**: ¿IS (sociedad) o IRPF (persona física), y cuál aplica a cada negocio? | D5, D15 | — |
| **33** | administración | ¿Qué **justificante/acuse** devuelve la administración y cómo se liga al modelo? | D13 | — |
| **34** | administración + asesor | ¿El sistema **presenta** el modelo, o sólo **prepara** para que presente el asesor? | D7, D13, L3 | — |
| **35** | clientes + rol cliente | ¿Quién es **el cliente exacto** (actor múltiple, no fijado en F0)? ¿Coincide con el dueño del negocio o es un tercero? | N1, R | — |
| **36** | clientes | **Pagador ≠ receptor fiscal**: ¿el que paga es siempre el mismo tercero que el facturado? | N1, O1 | — |
| **37** | clientes | **Series y numeración** de factura: ¿por negocio, por canal o única? | O1 | — |
| **38** | clientes | **Ticket vs factura**: ¿se emite ticket, factura o ambos según el caso? | O1 | — |
| **39** | clientes + proveedores | ¿**Dónde se declara la condición de pago/cobro por tercero** (plazos por cliente/proveedor)? | N1, E6 | — |
| **40** | proveedores | ¿La factura de compra se **coteja** contra pedido/recepción o se asienta directo? | N5 | — |
| **41** | proveedores | ¿Existen **rappels / descuentos / pronto-pago / anticipos** a proveedor? | N7 | — |
| **42** | proveedores | ¿Hay **retención de IRPF a proveedores** (profesionales)? | D4, N7 | — |
| **43** | proveedores | ¿**Quién confirma el saldo** con el proveedor — dueño o asesor? | N4 | — |
| **44** | proveedores | ¿La compra de existencias pasa por **albarán de recepción** o sólo por factura? | N5, H4 | — |
| **45** | bancos (+ familia recepción) | ¿Por qué **canal/formato** llega cada **extracto** (descarga, conexión directa, papel)? | E2 | — |
| **46** | bancos | ¿La **conciliación** se corre al día o al cierre? | E1, C7 | — |
| **47** | bancos | ¿Comisiones e intereses se **reclasifican solos** o pasan por revisión humana? | E7, E8 | — |
| **48** | bancos | ¿Hay **domiciliación de recibos** (cargos por mandato) o sólo transferencias? | E1, E3 | — |
| **49** | bancos | ¿**Cuántas cuentas bancarias** por negocio y en qué **monedas**? | E11, E12 | — |
| **50** | empleados | ¿De dónde **vienen** los datos de nómina (qué puerto/origen)? | G4 | — |
| **51** | empleados | ¿Qué **convenio / tipos de cotización** aplican? | G2 | — |
| **52** | empleados | ¿Hay **dietas, anticipos, pagas extra, retribución en especie**? | G8, G9 | — |
| **53** | empleados | ¿**Quién paga el neto**: emite la orden la contabilidad, o paga el banco y ella observa? | G3, E | — |
| **54** | empleados | ¿**Quién puede ver una nómina** (el empleado, el asesor, el dueño)? | G7 | — |
| **55** | empleados | ¿Cuántos **tipos de relación laboral** declara el negocio (fijo, temporal, autónomo dependiente)? | G | — |
| **56** | verticales | ¿**Qué hechos emite HOY cada vertical y con qué campos**? (contrato-hecho-minimo) | A11, A1 | — |
| **57** | verticales | ¿**Qué vertical publica el movimiento de stock** (inventario lo custodia, la vertical lo emite, o ambos)? | A1, H4 | — |
| **58** | verticales | ¿Se emite un **hecho de cierre explícito** por vertical, o el cierre lo infiere contabilidad? | A14, C4 | — |
| **59** | verticales | ¿Existen **hechos sin vertical productora** (amortización, nómina, hecho del tiempo) que contabilidad deba **autoproducir**? | C4, F2, G1 | — |
| **60** | verticales | Si una vertical está **inactiva o no publica**: ¿se marca hueco de cobertura o se asume vacío? | A12, A15 | — |
| **61** | jefe | ¿Qué **desviación/sangría** dispara aviso y con qué **umbral** lo fija el jefe? | J4, K6 | — |
| **62** | jefe | ¿El jefe ve el **margen por dimensión** o basta el global? | J6, J10 | — |
| **63** | rol cliente | ¿**Cómo se vende** (licencia por negocio / por uso / empaquetada con proyectos)? | K8 | — |
| **64** | rol cliente | ¿El cliente **elige sus avisos** o los recibe fijos? | R1, K6 | — |
| **65** | rol cliente | ¿El cliente tiene **voz post-entrega** (confirma/valora el valor recibido) o sólo recibe? | R | — |
| **66** | rol trabajador **[RAÍZ]** | ¿Existe un **trabajador-humano**, o el trabajador **es la automatización**? (la pregunta que decide si P1–P4 describen un rol humano o un rol-motor) | A8.3, P1–P4, M2 | — |
| **67** | rol trabajador | ¿**Cuándo es "hoy"**? el ritmo del trabajo (pendientes/cola) — sin ritmo no se fija la cara de "pendientes" | P, C7 (=#11) | — |
| **68** | rol trabajador | ¿Qué hace el trabajador con un **hecho incompleto** mientras espera — asienta provisional / espera / avisa? | A6.3, P3 | — |
| **69** | rol trabajador | ¿El **desatasco escala** al asesor/jefe cuando no se puede resolver solo? | P3, A8.3, L5 | — |
| **70** | rol trabajador | ¿**Quién atiende** los avisos de cuadre que fallan (`aviso-cuadre` avisa, pero a quién y quién actúa)? | C6, P1 | — |
| **71** | rol trabajador | ¿Hay **turnos / concurrencia** de trabajadores sobre la misma cola? (choca con single-writer) | P, M2 | — |
| **72** | global + actores | ¿El sistema **emite** facturas o sólo las **observa**? (encaje de la emisión en la identidad "observadora") | O1, D8, D9 | clientes · capa-fiscal |

**Total: 72 preguntas abiertas** (12 de F0 + 10 del prisma global, una de ellas consolidada → 9 únicas → **21 base** + **51 nuevas** de los prismas de interlocutor y de rol).

> Estas preguntas son el guion de la conversación siguiente. Hasta que se respondan, los valores
> quedan abiertos — **nada se estima** (ley de cero supuestos).

---

## 7 · DISECCIÓN — recuento (el detalle de FORMA va en `pasada-diseccion.md`, otra tarea)

**Recuento de hojas y nodos:**

| Concepto | Cifra |
|---|---|
| **Hojas ATÓMICAS (van a disección)** | **118** |
| **Hojas [ABIERTO] (privadas del dueño/actor — no se expanden)** | **23** (22 base + `diferencia-cambio` E12) |
| **Nodos SPAWN (re-prismados en pasada-3)** | **3** (A4, A6, A8) |
| **REF (deduplicadas)** | **3** (K5→I4, L4→B5, L5→A8) |
| **TOTAL de nodos del árbol** | **147** |

**Reparto por grupo (atómicas):**

| Grupo | Atómicas | Grupo | Atómicas |
|---|---|---|---|
| A · ENTRADA-HECHOS | 18 | J · ANALÍTICA/MANDO | 8 |
| B · LIBRO-NÚCLEO | 6 | K · PRODUCTO-SERVICIO | 5 |
| C · ESTADOS-CIERRE | 6 | L · REVISIÓN-ASESOR | 7 |
| D · CAPA-FISCAL | 13 | M · ANTI-BUCLE | 3 |
| E · TESORERÍA | 10 | N · TERCEROS ⟨actores⟩ | 8 |
| F · INMOVILIZADO | 4 | O · FACTURACIÓN EMITIDA ⟨actores⟩ | 2 |
| G · PERSONAL | 9 | P · CONTROL DEL PROCESO ⟨actores⟩ | 4 |
| H · EXISTENCIAS | 4 | Q · CONSULTA DEL DUEÑO ⟨actores⟩ | 4 |
| I · GRUPO | 4 | R · ENTREGA AL NEGOCIO ⟨actores⟩ | 3 |
| | | **TOTAL** | **118** |

**Desglose de apertura [ABIERTO] (23):** A6.3, A8.3, A10 · B7 · C7 · D10, D11 · E6, E12 · F5 · G5 ·
H5, H6 · I5, I6, I7 · J6, J7 · K6, K7, K8 · L6 · M4.

**FORMA:** ninguna pasada de esta vertical declaró la forma (REFLEJO / CUSTODIO / MICRO-AGENTE / PUENTE /
CONVERSOR) de las hojas → **FORMA: pendiente-diseccion** para las 118 atómicas (se resuelve en la
disección, no aquí; **no se inventa**).

---

## 8 · ⚠️ SALVAguARDA DE ALCANCE

**El total de hojas atómicas es 118 — DESBORDA el umbral de 70 fijado en F0.**
- Base global (prisma del sistema por dentro): **70** (umbral exacto).
- Aportadas por los 12 prismas de actor: **+48 atómicas** (de las 49 piezas nuevas, una —`diferencia-cambio`— queda `[ABIERTO]`).
- **Total: 118 atómicas = 168 % del umbral.**

**Decisión de F0 ya prevista:** si la fase desborda el umbral, **la vertical se PARTE por ejes de
capacidad** (`nucleo` / `fiscal` / `analitica`). El propio esquema da la traza natural de la partición:
- **`nucleo`** — A (entrada-hechos) · B (libro) · C (estados/cierre) · E (tesorería) · N (terceros) ·
  O (facturación) · P (control de proceso) · L (revisión) · M (anti-bucle).
- **`fiscal`** — D (capa-fiscal, incl. D12–D15 de administración) + las retenciones de G/D.
- **`analitica`** — J (analítica/mando, incl. J8–J10) · I (grupo) · H (existencias valoradas en su
  parte de coste) · K9 (criterios) · **más las caras de actor** (Q consulta · R entrega · K producto).

> **DECISIÓN DEL DUEÑO (2026-09-28): SE PARTE EN CUATRO VERTICALES.** La traza de arriba era la
> sugerencia del esquema (3 ejes); el dueño eligió **cuatro equilibradas** — mejor reparto de oleadas
> y modularidad comercial (`fiscal` vendible como añadido).

## 8b · ✅ PARTICIÓN DECIDIDA — cuatro verticales

| Vertical | Hojas | Grupos que agrupa |
|---|---|---|
| **`contabilidad-entrada`** | **32** | A entrada-hechos (18) · N terceros (8) · O facturación emitida (2) · P control del proceso (4) |
| **`contabilidad-libro`** | **32** | B libro-núcleo (6) · C estados-cierre (6) · E tesorería (10) · L revisión-asesor (7) · M anti-bucle (3) |
| **`contabilidad-fiscal`** | **22** | D capa-fiscal (13) · G personal (9) |
| **`contabilidad-analitica`** | **32** | F inmovilizado (4) · H existencias (4) · I grupo (4) · J analítica/mando (8) · K producto-servicio (5) · Q consulta-dueño (4) · R entrega-al-negocio (3) |

**`contabilidad-entrada` contiene el eslabón limitante** (grupo A) — es la puerta del sistema y la
primera oleada natural.

**Por qué cuatro y no tres:** oleadas del mismo tamaño (32/32/22/32) → cada una se construye y
verifica en un ciclo comparable. La de tres dejaba `núcleo` con 64 y `fiscal` con 13, cargando el
eje más pesado por módulo (regulación, modelos, plazos) en el grupo pequeño.

**Modularidad comercial:** `fiscal` se puede vender como añadido, o el núcleo sin fiscal — encaja
con el alcance declarado *"vendible sola o empaquetada con proyectos concretos"*.

**Coste de partir:** NO multiplica el proceso. Es **UN** proceso (F3 → F3b → un plan) y el
**plan declara a qué vertical pertenece cada módulo**. La construcción va **por oleadas**.

---

## 9 · Estado de la fase
Prisma **SECO** y **CONSOLIDADO**: 1 ronda global + **13 pasadas-2 por punto** + **1 pasada-3** (el
cuello, expandido hasta que todas sus hojas son atómicas o abiertas) + **8 prismas de interlocutor** +
**3 prismas de rol**. Ninguna hoja sin estado. El **eslabón limitante** (entrada de hechos) está
identificado, expandido con frenos → empujones, y **reforzado** por la asimetría con la vertical
subordinada. La validación cruzada de actores está hecha: refuerzos y **7 conflictos** declarados.
Disección **completa**: las 118 hojas con su FORMA (60 REFLEJO · 29 CUSTODIO · 14 PUENTE ·
8 MICRO-AGENTE · 7 CONVERSOR). **Salvaguarda de alcance RESUELTA** (§8 + §8b): el dueño decidió
partir en **cuatro verticales** (`entrada` 32 · `libro` 32 · `fiscal` 22 · `analitica` 32).
**Siguiente encadenamiento:** responder el guion de **72 preguntas abiertas** (por tandas temáticas)
y resolver los **7 conflictos de validación cruzada** antes de la FASE 3 · PLASMA
(planificar-construccion → diseno-oop.md) — que será **UN** diseño OOP para el conjunto, con la
partición declarada en el plan. Fase lista para su cierre de gate.
