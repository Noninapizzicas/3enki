# FASE 0 — Documento de Identidad

**Proyecto:** Contabilidad (vertical de Enki)
**Estado:** con_identidad
**Declarada:** 2026-09-28
**Tipo derivado:** capacidad_transversal_observadora

---

## 1. Qué es (la cosa concreta)

> "La vertical de contabilidad sería lo que le falta a otras verticales para
> llevar la contabilidad de cada cual."

Una **capacidad transversal observadora**. No produce hechos de negocio: escucha
los eventos que cada negocio ya emite y, a partir de ellos y del cierre,
**reconstruye** su contabilidad — flujo de caja, ventas, consumo, stock, compras.

No es un buscador ni un constructor de hechos: es la pieza que **mira lo que ya
pasó** y lo convierte en contabilidad.

## 2. La diferencia / el filo

> "Sistemas convencionales donde era una persona la que metía los datos al
> ordenador en una db de ventas/compras. El nuevo paradigma puede automatizar
> todo el sistema, pero de tal modo que sea realista y no llegue a colapsar o
> entrar en bucle."

El filo es doble:

1. **Automatización real del sistema entero** — donde antes había una persona
   digitando ventas/compras, ahora los eventos del día reconstruyen todo solo.
2. **Realismo anti-bucle** — automatizar sin colapsar ni realimentarse. La
   palanca son tres cerrojos (ver §5).

La contabilidad no se inventa los hechos: **los lee y recompone**.

## 3. Quién lo paga / el sujeto del sistema

> "Contabilidad no es un negocio, pero el software que opera la contabilidad de
> las empresas sí es un gran negocio."

- **Contabilidad, como vertical interna, no se vende**: su destino declarado es
  **gestión interna primero**.
- **El pagador eventual** es quien compre el **software que opera la
  contabilidad de las empresas** — declarado como "un gran negocio", con
  **miras a** una capa fiscal / producto vendible.

Separación nítida: la *capacidad* es interna hoy; el *producto* es el horizonte.

## 4. Encuentra o construye

No aplica el eje encontrar/construir de un negocio que sale a buscar demanda.
Aquí el eje es **observa / reconstruye**:

- **Observa** lo que ya existe (eventos del día que las verticales emiten).
- **Reconstruye** lo que aún no está escrito (caja, consumo, stock, compras).
- **Reutiliza** lo que ya existe sin duplicarlo: `inventario` (stock, ya
  multi-proyecto), `facturas` (compras/OCR), `escandallo` (coste — se pone
  **por encima**, no se toca).

## 5. El motor que ejecuta

**Enki** (event-driven, Node + MQTT). Contabilidad se activa como **1 vertical
del proyecto**, igual que `nonina` activa `pizzepos+prisma+tienda+www`.

### Los 3 cerrojos anti-bucle

> "Puede automatizar todo el sistema, pero de tal modo que sea realista y no
> llegue a colapsar o entrar en bucle."

1. **Planos separados** — contabilidad emite **CÁLCULOS** (`contabilidad.*`),
   nunca hechos de negocio. Así no puede disparar la operación → no la
   realimenta.
2. **Un solo escritor por parcela** — patrón custodio: un único escritor de la
   parcela contable de cada proyecto.
3. **Idempotencia por clave natural** — **"un cierre = un asiento"**.
   Reprocesar no duplica.

### Aislamiento

Carpeta por proyecto: `data/projects/<slug>/contabilidad/...` (molde del módulo
`inventario` + `PosPersistencia`).

### Las partidas

> "Dividirla en varias partidas que sería aumentar su fuerza: ventas, compras,
> cuentas de gastos, escandallos."

Decisión cerrada: las partidas son **MÓDULOS dentro de la vertical** (no
verticales separadas): **ventas · compras · gastos · tesorería · stock · coste ·
resultado**. Molde de partidas: la vertical `marketing-*` (12 módulos reflejo
puro con `PosPersistencia`).

## 6. La medida del éxito (indicador maestro)

Que la contabilidad **cuadre sin una persona digitando** y **sin colapsar ni
entrar en bucle**: reconstruir a partir de los eventos del día y el cierre el
flujo de caja, el consumo, el stock y las compras de forma **realista** e
**idempotente**.

La señal de fracaso es explícita: el sistema se realimenta (bucle) o revienta
(colapso). La señal de éxito: reconstruye fiel y converge.

## 7. La semilla (arranque del proceso)

El arranque **no es un dato nuevo**: es el **primer proyecto que active la
vertical**. Cuando un negocio ya operativo enciende contabilidad y emite sus
eventos del día + su cierre, la vertical tiene semilla real sobre la que
reconstruir.

### Invariante de la casa

> "Donde hay un freno, hay una oportunidad. Buscamos alternativa; si no existe,
> se crea."

Aquí se aterriza como: si una vertical **no** declara la ficha que la
reconstrucción necesita (p. ej. coste del consumo), no se inventa — se marca
como **pregunta abierta** y se crea la pieza que falte.

## 8. La capa fiscal (frontera nombrada, NO construida)

> "Gestión interna primero, con miras a [capa fiscal]."

**Verificado:** en Enki hoy hay **CERO piezas fiscales** (IVA, Verifactu, factura
electrónica, nóminas, inmovilizado, conciliación). `facturas` es **solo OCR de
intake**. No se diseña aquí; se nombra como horizonte.

---

## Decisión de arquitectura (resumen de fases declaradas)

| Fase | Decisión |
|------|----------|
| F0 | Identidad — contabilidad es una **capacidad transversal observadora**, no una mercancía. |
| Arquitectura | 1 proyecto = N verticales. Contabilidad = 1 vertical activable por config del proyecto. |
| Partidas | Módulos **dentro** de la vertical: ventas, compras, gastos, tesorería, stock, coste, resultado. |
| Aislamiento | Carpeta por proyecto (`data/projects/<slug>/contabilidad/`), molde `inventario` + `PosPersistencia`. |
| Ejecución | Proceso F0→F7 con `prisma-universal` y gates de entregable verificados en disco. |
| Molde de partidas | Vertical `marketing-*` (12 reflejos puros, `PosPersistencia` con dir por vertical). |
| Anti-bucle | 3 cerrojos: planos separados · single-writer por parcela · idempotencia por clave natural. |
| Reutiliza sin duplicar | `inventario` (stock, multi-proyecto) · `facturas` (compras/OCR) · `escandallo` (coste, por encima sin tocar). |

### Hallazgos verificados

- `escandallo` (pizzepos, 372 líneas, receta→coste) es **mono-negocio**: NO sirve
  tal cual para una gran empresa o grupo (falta coste indirecto, multi-sociedad,
  periodos). No se toca: se pone **por encima**.
- Dos lógicas de coste coexisten: `pizzepos/escandallo` (receta) y
  `prisma/costeador` (compuestos/proporciones).
- `marketing-budget` ya declara **"custodia contable"** → solape pendiente de
  decidir (¿se absorbe o se lee?).
- `marketing-*` (12 reflejos puros) está construido pero **NO habilitado** en
  `config.json`.

---

## Preguntas abiertas pendientes

Ninguna se cierra en F0. Se nombran tal cual:

| Campo | Para | Por qué sigue abierta |
|-------|------|------------------------|
| `cuando_reconstruye` | decidir el motor de reconstrucción (tiempo real / en el cierre / ambos) | el dueño no lo declaró |
| `fuente_coste_consumo` | reconstruir consumo de ingredientes y stock | ¿se pide a escandallo/recetas, o cada vertical declara ficha de producto? |
| `alcance_fiscal` | dimensionar la capa fiscal | IVA/Verifactu/factura electrónica hoy son CERO; es un mundo, no un módulo |
| `vista_agregada` | ver todos los negocios juntos | consolidador de solo lectura vs proyecto-oficina |
| `unidad_de_cierre` | fijar la clave natural del asiento y el periodo contable | "un cierre = un asiento" no define qué es un cierre |
| `solape_marketing_budget` | decidir si contabilidad absorbe o solo lee | `marketing-budget` ya declara custodia contable |
| `granularidad_de_grupo` | soportar grupos de empresas / multi-sociedad | el dueño preguntó si sirve para grupo; verificado que escandallo no basta |
