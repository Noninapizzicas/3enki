# ESQUEMA MAESTRO — Sistema "CONTABILIDAD"

> **Fase:** 2 · esquematizar-negocio · **Vertical:** `contabilidad` (Enki) · **Entregable gate:** este árbol.
> **Sujeto (de F0):** capacidad transversal **observadora VENDIBLE** — *"la vertical que le falta a las
> demás verticales para llevar la contabilidad de cada cual"*. No produce hechos de negocio: escucha
> los eventos que cada negocio ya emite y, junto con el cierre, **reconstruye** su contabilidad
> (flujo de caja, ventas, consumo, stock, compras). Emite **CÁLCULOS** (`contabilidad.*`).
> **Medida maestra:** que el **asesor la acepte y pueda presentarla** — cuadra sin una persona
> digitando, sin colapsar y sin entrar en bucle.
> **Alcance:** COMPLETO (el de una app de contabilidad profesional). Real, pura, vendible. **NO mínima.**
> **Sin tecnologías: puertos abiertos, agnosticismo.**

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

### El cuello expandido al máximo (frenos → empujones)
| Freno del cuello | Empujón (pieza construible que lo abre) |
|---|---|
| Un documento debe interpretarse (hoy lo digita una persona) | **conversion-documento-a-dato** (extracción-dato + puerto-documento + control-cuadre-documento) |
| "Recibirlas digitales" no existe hoy | **puerto-documento-digital** + **captura-documento** |
| Cada hecho debe hallar su cuenta y su tercero | **resolucion-contrapartida** (contrapartida-asistida + regla-contrapartida) |
| Documento ilegible / dato que no cuadra atasca el flujo | **cola-revision** (encolado-excepcion + aviso-revision) — el flujo NO se bloquea |
| Reprocesar duplicaría asientos (colapso/bucle) | **deduplicacion-hecho** + **clave-natural** (un hecho = un asiento) |
| Un hecho incompleto no se sabe si asentar | `regla-hecho-incompleto` → **ABIERTO** (pregunta al dueño) |
| Un hecho de negocio podría realimentar la operación | **frontera-planos** (sólo emite cálculos, nunca hechos) |
| La entrada en serie atasca el embudo | **lote-admision** (desacople: N hechos en paralelo) |

**Los empujones del cuello son las piezas del grupo A** (abajo): el corazón del esquema, no una sección.

---

## 1 · ÁRBOL DEL SISTEMA — piezas del prisma global

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
  - A8.3 `dueno-cola-revision` — **[ABIERTO]** (¿quién resuelve la cola: asesor o dueño?)
- A9 `lote-admision` — ATÓMICO (desacople del cuello: N hechos en paralelo)
- A10 `catalogo-puertos-documento` — **[ABIERTO]** (qué fuentes/canales declara cada negocio)

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
- C3 `periodificacion` — ATÓMICO (imputa cada hecho a su periodo)
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

### E · TESORERÍA — bancos · conciliación · previsión de caja
- E1 `conciliacion-bancaria` — ATÓMICO · E2 `puerto-extracto` — ATÓMICO
- E3 `cuadre-cobro-pago` — ATÓMICO (un movimiento bancario = un cobro/pago)
- E4 `saldo-tesoreria` — ATÓMICO · E5 `prevision-caja` — ATÓMICO
- E6 `politica-cobro-pago` — **[ABIERTO]** (plazos que declara el negocio)

### F · INMOVILIZADO — altas · amortizaciones · bajas
- F1 `alta-activo` — ATÓMICO · F2 `plan-amortizacion` — ATÓMICO (genera la cuota al cierre)
- F3 `baja-activo` — ATÓMICO · F4 `valor-neto-contable` — ATÓMICO
- F5 `parametros-amortizacion` — **[ABIERTO]** (métodos/coeficientes)

### G · PERSONAL — nóminas · seguros sociales
- G1 `recibo-nomina` — ATÓMICO · G2 `obligacion-seguridad-social` — ATÓMICO
- G3 `asiento-personal` — ATÓMICO · G4 `puerto-nomina` — ATÓMICO
- G5 `calculo-nomina` — **[ABIERTO]** (¿calcula o sólo recibe el hecho?)

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

### J · ANALÍTICA — centros de coste · márgenes · presupuestos · desviaciones
- J1 `etiquetado-analitico` — ATÓMICO · J2 `margen-analitico` — ATÓMICO
- J3 `presupuesto` — ATÓMICO · J4 `desviacion` — ATÓMICO (dispara aviso si se sale)
- J5 `coste-indirecto` — ATÓMICO (cubre lo que la pieza existente no cubre para grupo)
- J6 `dimensiones-analiticas` — **[ABIERTO]** · J7 `criterio-reparto-indirecto` — **[ABIERTO]**

### K · PRODUCTO-SERVICIO — multi-tenant · licencias · onboarding · informes · avisos
- K1 `onboarding-negocio` — ATÓMICO · K2 `motor-avisos` — ATÓMICO (**el requisito 4 del dueño**)
- K3 `informe-rico` — ATÓMICO (contexto y profundidad, no un número pelado) · K4 `activacion-vertical` — ATÓMICO
- K5 `aislamiento-negocio` — **REF** (ya en I4)
- K6 `catalogo-avisos` — **[ABIERTO]** · K7 `frontera-entrega` — **[ABIERTO]** · K8 `modelo-licencia` — **[ABIERTO]**

### L · REVISIÓN-ASESOR — exportación · diálogo · ajuste · firma (la medida maestra)
- L1 `puerto-exportacion` — ATÓMICO (formatos contables estándar hacia el asesor)
- L2 `vista-revisable` — ATÓMICO (todo asiento/cálculo explicado — no caja negra)
- L3 `flujo-firma` — ATÓMICO (marca de revisado/firmado por el asesor; el sistema no firma)
- L4 `asiento-ajuste` — **REF** (B5) · L5 `cola-revision` — **REF** (A8)
- L6 `formato-exportacion` — **[ABIERTO]**

### M · ANTI-BUCLE — los 3 cerrojos transversales (invariantes)
- M1 `frontera-planos` — ATÓMICO (sólo emite cálculos `contabilidad.*`, nunca hechos de negocio)
- M2 `single-writer` — ATÓMICO (un solo escritor por parcela — aplica a todo custodio)
- M3 `clave-natural` — ATÓMICO (idempotencia: reprocesar no duplica)
- M4 `definicion-cierre` — **[ABIERTO]** (`unidad_de_cierre`: la clave de todo el cerrojo 3)

---

## 2 · RELACIONES clave (cómo fluye la cadena)
1. **A** (entrada — el cuello) → **B** (asiento) → **C** (estados/cierre) → **D** (fiscal); **E/F/G/H** alimentan a B desde sus hechos.
2. **A** es la única puerta de hechos: eventos (**A1**) y documentos (**A3–A5**). Todo lo demás **lee de B**.
3. **H2** (frontera-ficha-producto) alimenta **H4/H5** (valoración) → **J2** (márgenes) — el coste enlaza existencias con analítica.
4. **L** (asesor) cierra el bucle: exporta (**L1**), el asesor ajusta (**B5/L4**) y firma (**L3**) → **medida maestra**.
5. **M** es transversal: **M1** garantiza que nada de contabilidad realimenta la operación (anti-bucle);
   **M2/M3** hacen segura la automatización sin operador.
6. **F2** (amortización) y **C4** (cierre) son hechos/momentos que **produce el tiempo**, no un negocio → se generan sin operador.
7. **K2** (motor-avisos) es consumido por **A8.2**, **C6**, **D6**, **E5**, **J4** → los avisos nacen de señales reales, no de una pantalla muda.

---

## 3 · ESLABÓN LIMITANTE — decisión y qué lo gobierna
El cuello es **A · ENTRADA-HECHOS**. Se expande con: **conversion-documento-a-dato** (extrae el dato
sin persona), **puerto-documento-digital** (la recepción digital declarable), **resolucion-contrapartida**
(halla cuenta/tercero con regla declarable/aprendida), **cola-revision** (lo dudoso no atasca),
**deduplicacion-hecho** (anti-bucle), y **lote-admision** (desacople: N en paralelo). El bucle
**resultados reales → regla-contrapartida (A6.2) → contrapartida-asistida (A6.1)** convierte el trabajo
que hoy hace una persona en una regla que se afina con cada documento resuelto. La cadena queda tan
fuerte como lo que mida esta puerta — por eso es el corazón, no una sección.

---

## 4 · PUERTOS ABIERTOS (agnosticismo — cero tecnologías)
- **Hechos de las verticales** (A1): el bus por el que cada negocio publica sus hechos — puerto, no transporte.
- **Documentos** (A3–A5, H2, G4): formas y canales declarables; reemplazables; si falta una, se crea (invariante).
- **Extractos bancarios** (E2): canal declarable.
- **Plan contable** (B1/B6): frontera de codificación (import/export del plan del asesor).
- **Modelos fiscales** (D7): salida al programa del asesor — formato ABIERTO.
- **Procesamiento**: cero tecnologías nombradas — cada pieza expone su puerto (entrada/salida), no su stack.

---

## 5 · PREGUNTAS ABIERTAS AL DUEÑO (las 12 de F0 — cero supuestos)

| # | Campo (F0) | Pregunta abierta | Dónde toca |
|---|---|---|---|
| 1 | `cuando_reconstruye` | ¿reconstruye en tiempo real, en el cierre, o ambos? | A, C |
| 2 | `unidad_de_cierre` | ¿qué es "un cierre" (jornada/día/mes) y cómo se identifica? (clave natural del asiento) | A7, B7, C7, M4 |
| 3 | `fuente_coste_consumo` | ¿de dónde sale el coste del consumo — ficha del producto, receta, otro? | H2, H5, J2 |
| 4 | `alcance_fiscal` | ¿hasta dónde llega la capa fiscal (qué modelos)? es un mundo, no un módulo | D10, D1–D9 |
| 5 | `recepcion_digital_facturas` | ¿por qué canal/formato llegan las "facturas recibidas digitales"? | A5, D9 |
| 6 | `cola_revision` | ¿qué pasa con un documento ilegible o un dato que no cuadra? ¿quién lo resuelve? | A8, L5 |
| 7 | `catalogo_avisos` | ¿qué avisos, a quién y por qué canal? (requisito 4 del dueño) | K2, K6 |
| 8 | `vista_agregada` | ¿consolidador de sólo lectura o proyecto-oficina? | I6 |
| 9 | `granularidad_de_grupo` | ¿hasta dónde llega el grupo (empresas/multi-sociedad/sucursales)? | I5, I7 |
| 10 | `solape_marketing_budget` | ¿contabilidad absorbe o sólo lee lo que ya custodia otra pieza? | H6 |
| 11 | `momento_de_uso` | ¿con qué ritmo se usa (día/mes/cierre)? | C7, K1 |
| 12 | `frontera_primera_entrega` | ¿qué entra en la primera entrega y qué en las siguientes? | K7 |

**Preguntas abiertas propias de este esquema (no estaban en las 12, salen del prisma):**
13. ¿El producto **calcula nóminas** o sólo recibe el hecho de otro sistema? (G5) · 14. ¿Qué **métodos
de amortización** admite? (F5) · 15. ¿Qué **método de valoración** de existencias? (H1) · 16. ¿Qué
**formato de exportación** exige el programa del asesor? (L6) · 17. ¿Bases y **tipos fiscales** de
cada negocio? (D11) · 18. ¿Qué **centros de coste / dimensiones** declara cada negocio? (J6) · 19.
¿El **ajuste** reemplaza o suma? (L4/B5) · 20. ¿Multi-moneda? (I5) · 21. ¿El sistema **ejecuta** cobros/pagos
o sólo los observa? (E) · 22. ¿La nómina se **calcula** o se **recibe**?

> Estas preguntas son el guion de la conversación siguiente. Hasta que se respondan, los valores
> quedan abiertos — **nada se estima** (ley de cero supuestos).

---

## 6 · DISECCIÓN — recuento (el detalle de FORMA va en `pasada-diseccion.md`, otra tarea)
- **Hojas ATÓMICAS (van a disección): 70**
- **Hojas [ABIERTO] (privadas del dueño — no se expanden): 22** (12 de F0 + 10 propias del prisma)
- **Nodos SPAWN (re-prismados en pasada-3): 3** (A4, A6, A8)
- **REF (deduplicadas): 3** (K5→I4, L4→B5, L5→A8)
- Reparto por grupo (atómicas): A 13 · B 6 · C 6 · D 9 · E 5 · F 4 · G 4 · H 4 · I 4 · J 5 · K 4 · L 3 · M 3 (= 70).
- **Total de nodos del árbol: 98** (70 atómicas + 22 abiertas + 3 SPAWN + 3 REF).

> ⚠️ **Salvaguarda de alcance:** las 70 hojas atómicas están **en el umbral exacto de 70**
> declarado en F0. Si la disección o la F3b desbordan (>70), la vertical **se parte por ejes de
> capacidad** (`nucleo` / `fiscal` / `analitica`) — decisión ya prevista por el dueño (F0 §6).

---

## 7 · Estado de la fase
Prisma global **SECO**: 1 ronda global + **13 pasadas-2 por punto** + **1 pasada-3** (el cuello,
expandido hasta que todas sus hojas son atómicas o abiertas). Ninguna hoja sin estado.
El **eslabón limitante** (entrada de hechos) está identificado y expandido al máximo con
frenos → empujones. **Siguiente encadenamiento:** FASE 3 · PLASMA (planificar-construccion →
diseno-oop.md), tras responder/investigar el guion de preguntas abiertas. Fase lista para
`completar_fase { fase:'esquematizado' }`.
