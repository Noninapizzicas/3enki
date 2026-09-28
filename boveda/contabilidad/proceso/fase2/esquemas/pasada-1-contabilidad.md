# PASADA 1 · Prisma global del SUJETO "CONTABILIDAD"

> **Fase 2 · esquematizar-negocio** · vertical `contabilidad` · vertical del sistema.
> **Sujeto (de F0):** capacidad transversal **observadora VENDIBLE** — *"la vertical que le
> falta a las demás verticales para llevar la contabilidad de cada cual"*. No produce hechos
> de negocio: escucha los eventos que cada negocio ya emite y, junto con el cierre,
> **reconstruye** su contabilidad (flujo de caja, ventas, consumo, stock, compras). Emite
> **CÁLCULOS** (`contabilidad.*`), nunca hechos de negocio.
> **Medida maestra:** que el **asesor la acepte y pueda presentarla** — cuadra sin una
> persona digitando, sin colapsar y sin entrar en bucle.
> **Alcance:** COMPLETO (el de una app de contabilidad profesional). Real, pura, vendible.
> **Sin tecnologías: puertos abiertos, agnosticismo.**

---

## Prisma de los 5 huecos (ronda 1 — el sujeto ENTERO)

### 1 · IDENTIDAD — ¿qué es exactamente el sujeto?
Una **capa contable transversal** que se activa por config sobre cualquier negocio y cuya
materia prima son **hechos que ya ocurrieron** (eventos que las otras verticales publican +
el **cierre**). Su trabajo es **reconstruir**, no producir: convierte hechos dispersos en un
sistema **vivo, actualizado, dinámico y funcional** — partida doble (diario/mayor), estados,
cierre, fiscal, tesorería, inmovilizado, personal, existencias, grupo, analítica.
Es **producto multi-tenant** (lo usa el *negocio*, no un dueño concreto) y **vendible sola o
empaquetada**. El **asesor se MANTIENE**: la herramienta automatiza, él revisa, corrige,
presenta y firma → hace falta salida **legible/revisable**, **exportación** y **camino de
asiento de ajuste**.

### 2 · RESTRICCIONES — ¿qué limita al sistema?
- **Nace observadora:** no puede emitir hechos de negocio → no puede realimentar la operación.
  (Freno/garantía que a la vez es su filo.)
- **Cuadra sin una persona digitando:** la entrada de hechos (eventos + documentos) debe
  normalizarse sola → **la puerta de entrada gobierna todo lo demás**.
- **No puede colapsar ni entrar en bucle:** exige los **3 cerrojos** — planos separados,
  **un solo escritor por parcela**, **idempotencia por clave natural** ("un cierre = un asiento").
- **El asesor se mantiene:** toda salida debe ser revisable y exportable, con trazabilidad intacta.
- **Fiscal = cero hoy en el sistema:** IVA/Verifactu/factura electrónica/nóminas/inmovilizado/
  conciliación no existen → la capa fiscal es un **mundo**, no un módulo (`alcance_fiscal` ABIERTO).
- **Fuentes heterogéneas:** los eventos son limpios; los documentos (facturas, extractos,
  nóminas) llegan como **documento** y hay que interpretarlos → ahí aparece el trabajo humano
  que hoy existe (digitación) y que hay que eliminar.
- **Multi-tenant:** cada negocio aislado en su parcela, sin fugas entre negocios.

### 3 · CONTRATO — ¿qué intercambia / compromete?
- **Con el negocio (usuario):** reconstruye sus cuentas de forma continua y viva; a cambio el
  negocio activa la vertical y consulta.
- **Con el asesor/contable:** entrega **estados legibles + exportables** y **acepta su asiento
  de ajuste** sin romper trazabilidad; a cambio el asesor revisa, corrige, presenta y firma.
- **Con la Administración (Hacienda / Seguridad Social):** produce los **modelos** (el asesor
  los firma y presenta).
- **Con clientes y proveedores:** facturación de venta/compra, cobros y pagos.
- **Con bancos:** recibe extractos → conciliación.
- **Con empleados:** nómina y seguros sociales.
- **Con las otras verticales:** recibe **hechos** (es su fuente de datos) y devuelve
  **cálculos** (`contabilidad.*`) — jamás al revés.

### 4 · NO-OBJETIVOS — ¿qué NO quiere ser?
- **NO produce hechos de negocio** (nunca dispara la operación — eso sería el bucle).
- **NO sustituye al asesor** (automatiza; no firma ni presenta por él).
- **NO** es una app que se alimenta de **digitación**, ni una **foto** que queda desfasada.
- **NO** es una herramienta de **adorno** ni justificada por la comodidad en sí.
- **NO** es una versión **mínima / descafeinada**.
- **NO inventa el dato que falta:** lo marca **pregunta abierta** y, si no existe la pieza,
  **se crea** (invariante de la casa: *donde hay un freno, hay una oportunidad*).

### 5 · PREGUNTAS ABIERTAS (ley de cero supuestos — nada se estima)
Las **12 declaradas en F0** (se reproducen enteras en `esquema.md §7`):
`cuando_reconstruye` · `unidad_de_cierre` · `fuente_coste_consumo` · `alcance_fiscal` ·
`recepcion_digital_facturas` · `cola_revision` · `catalogo_avisos` · `vista_agregada` ·
`granularidad_de_grupo` · `solape_marketing_budget` · `momento_de_uso` · `frontera_primera_entrega`.

---

## ESLABÓN LIMITANTE — identificado por MÍ (no lo da el F0)

**Flujo declarado:** hechos ya emitidos (ventas por eventos) → **digitalizar/recibir facturas →
procesarlas → actualizar stock** → reconstrucción a partida doble (asiento) → estados → fiscal →
cierre → presentación al asesor.

**ESLABÓN LIMITANTE = LA ENTRADA DE LOS HECHOS (su normalización a asiento).**
Es *el paso cuya capacidad y programación restringen al conjunto*. Razon: el camino de las
**ventas por eventos ya está construido** (el dueño lo declara hecho) → no es cuello. El
**cierre** es periódico y determinista: es un **hito aguas abajo**, y sólo puede cuadrar **si la
entrada está completa** → depende de la entrada. La **entrada**, en cambio, es **continua,
heterogénea y con juicio**: cada factura (digitalizada o recibida digital), cada extracto y cada
nómina llegan como **documento** que *hoy digitaliza una persona*, y hay que interpretarlos,
clasificarlos, resolver su contrapartida y decidir si están completos. Ese punto es **el único
donde la promesa "sin operador" se rompe**, y su calidad decide la medida maestra (que el asesor
lo acepte y cuadre sin nadie digitando). Si la entrada no se normaliza sola, **nada aguas abajo
cuadra** por mucho que diario/mayor/estados sean perfectos.

### El cuello expandido al máximo (frenos → empujones)
| Freno del cuello | Empujón (pieza construible que lo abre) |
|---|---|
| Un documento debe interpretarse (hoy lo digita una persona) | **conversion-documento-a-dato** (conversor de frontera: documento → hecho normalizado) |
| "Recibirlas digitales" no existe hoy en el sistema | **puerto-documento-digital** (recepción digital declarable) + **captura-documento** |
| Cada hecho debe hallar su cuenta y su tercero | **resolucion-contrapartida** (a qué cuenta/tercero/período) |
| Documento ilegible o que no cuadra atasca el flujo | **cola-revision** (buffer de excepciones; sin operador no se bloquea el resto) |
| Reprocesar duplicaría asientos (colapso/bucle) | **deduplicacion-hecho** (idempotencia por clave natural: *un hecho = un asiento*) |
| Un hecho incompleto no se sabe si asentar | `regla-hecho-incompleto` → **ABIERTO** (pregunta al dueño) |
| Un hecho de negocio podría realimentar la operación | **frontera-planos** (solo emite cálculos, nunca hechos) |
| La entrada en serie atasca el embudo | **entrada por lotes/hilos** (desacople: N hechos en paralelo) |

**Los empujones del cuello son las piezas del grupo A** (abajo), el corazón del esquema, y se
detallan en `pasada-2-entrada-hechos.md` y `pasada-3-entrada-hechos-expandido.md`.

---

## SUB-PRODUCTOS que salen de la ronda 1 (cada uno → su pasada-2)
Cada bloque declarado en F0 se re-prisma como un **punto** (módulo/partida dentro de la vertical):
1. **`entrada-hechos`** — la puerta: eventos de las verticales + documentos (facturas/extractos/nóminas)
   → hecho normalizado. **ES EL ESLABÓN LIMITANTE.**
2. **`libro-nucleo`** — partida doble: plan contable, diario, mayor, balanza, asiento, ajuste, traza.
3. **`estados-cierre`** — balance, cuenta de resultados, cierre de ejercicio, ajustes, periodificación.
4. **`capa-fiscal`** — IVA (303/390), IRPF/IS, retenciones, modelos, Verifactu, factura electrónica.
5. **`tesoreria`** — bancos, conciliación bancaria, cobros/pagos, previsión de caja.
6. **`inmovilizado`** — altas, amortizaciones, bajas, inventario de bienes.
7. **`personal`** — nóminas, seguros sociales, retenciones de nómina.
8. **`existencias`** — inventario valorado, consumo→stock, entrada por compra, conteo.
9. **`grupo`** — multi-sociedad, cuentas intercompany, consolidación, vista agregada.
10. **`analitica`** — centros de coste, márgenes, presupuestos, desviaciones, coste indirecto.
11. **`producto-servicio`** — multi-tenant, licencias, onboarding, informes, avisos, información rica.
12. **`revision-asesor`** — exportación, diálogo con el programa del asesor, asiento de ajuste, firma.
13. **`anti-bucle`** — los 3 cerrojos transversales (frontera de planos, single-writer, idempotencia).

> **Interlocutores y roles:** fuera de esta ronda (los entrega otra pasada: `pasada-interlocutor-*`
> y `pasada-rol-*`). Aquí sólo se esquematiza el sistema por dentro.
