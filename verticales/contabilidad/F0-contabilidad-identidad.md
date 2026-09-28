# FASE 0 — Documento de Identidad

**Vertical:** Contabilidad
**Estado:** con_identidad (borrador — pendiente de validación del dueño)
**Declarada:** 2026-09-28
**Tipo derivado:** capacidad_transversal

---

## 1. Qué es

> "La vertical de contabilidad sería lo que le falta a otras verticales para llevar
> la contabilidad de cada cual."

Cada negocio de Enki (nonina, despacho-pan, the-pirate, 3d…) produce **hechos**:
lo que se agrega al pedido, lo que se quita, lo que se cobra, el cierre de caja.
Contabilidad es la capacidad que **escucha esos hechos y reconstruye** la
contabilidad del negocio — sin que cada vertical tenga que saber nada de
contabilidad.

**No produce hechos de negocio: observa y reconstruye.**

## 2. El filo / la diferencia

A diferencia de un sistema contable convencional — donde una persona teclea los
datos en una base de datos — aquí **el sistema se alimenta solo**: los eventos ya
existen porque el negocio ya los emite. La automatización no inventa nada: lee lo
que ocurrió.

El freno declarado (y su respuesta): automatizar **sin colapsar ni entrar en bucle**.
Se gobierna con tres cerrojos:

1. **Planos separados** — contabilidad emite cálculos (`contabilidad.*`), nunca hechos
   de negocio; no puede disparar la operación.
2. **Un solo escritor por parcela** — cada dato tiene un dueño (patrón custodio).
3. **Idempotencia por clave natural** — "un cierre = un asiento". Llegar dos veces no
   duplica (lección ya pagada en pizzepos).

## 3. Qué aporta / a quién

- **Aporta** la capacidad contable a cada negocio. No vende mercancía.
- **Destino inicial: interno** — llevar la contabilidad de los negocios propios.
- **Con miras**: el software que opera la contabilidad es, en sí, un negocio. Su
  ambición declarada es convertirse en producto vendible. **El diseño no cierra esa
  puerta**, pero la capa fiscal no se construye hasta que haya negocio que la pague.

## 4. Cómo se elabora

- **Vertical de módulos (partidas)**: ventas · compras · gastos · tesorería · stock ·
  coste · resultado. Una partida = un módulo = una parcela pequeña y desacoplada.
- **Reutiliza, no duplica**: `inventario` (stock, ya multi-proyecto), `facturas`
  (compras vía OCR), `escandallo` (coste de receta). El escandallo no se toca: se
  pone **por encima** (no sirve tal cual para un grupo — falta coste indirecto,
  multi-sociedad y periodos).
- **Se ejecuta por el proceso**: `proceso-negocio` (F0→F7) con el motor
  `prisma-universal`. No se construye a mano.

## 5. Dónde vive

- **Como directorio de vertical**: `/home/admin/vertical-contabilidad/` (molde
  `vertical-nichos`), con sus F0/F2/F3… como documentos vivos entre fases.
- **Como capacidad activable**: la vertical se **activa en la config de cada
  proyecto** (`"contabilidad": { "enabled": true }`), igual que pizzepos/prisma/
  tienda/www en nonina. Un proyecto = N verticales.
- **Aislamiento**: **carpeta por proyecto** (`data/projects/<slug>/contabilidad/…`).
  Cada negocio su libro. Un negocio se puede vender limpio.
- **Ver todo junto**: capa de **solo lectura** por encima (consolidador), más adelante
  y solo si hace falta. Nunca datos juntos.

## 6. La medida del éxito

Que el dueño **sepa, sin tocar nada**, qué gana, qué gasta y qué tiene en cada
negocio — y que un negocio pueda sacarse completo. Indicador por proyecto, no por
sensación.

## 7. Invariante

> **Dato ausente = desconocido, nunca inventado.**
> Si falta el precio de un ingrediente o la receta de un producto, contabilidad
> **marca incompleto y sigue** con el resto — con lista de pendientes. Inventar
> sería peor que no saber.

---

## Preguntas abiertas

| Campo | Para | Por qué sigue abierta |
|---|---|---|
| `cuando_reconstruye` | decidir el motor de reconstrucción | tiempo real (informativo) vs en el cierre (oficial) vs ambos |
| `fuente_coste_consumo` | reconstruir consumo y stock | ¿pide a escandallo/recetas de cada vertical, o cada vertical declara ficha de producto? |
| `alcance_fiscal` | dimensionar la capa fiscal | IVA, Verifactu, factura electrónica… hoy **cero** en Enki. Solo cuando haya negocio |
| `vista_agregada` | ver todos los negocios juntos | consolidador propio vs proyecto-oficina (recomendado: solo si duele) |

---

## Decisiones ya cerradas (no reabrir)

| Fase | Decisión |
|---|---|
| Alcance | Gestión **interna** primero, con miras a fiscal |
| Arquitectura | 1 proyecto = N verticales; contabilidad = 1 vertical |
| Partidas | Módulos dentro de la vertical (no verticales separadas) |
| Aislamiento | Carpeta por proyecto |
| Ejecución | Por `proceso-negocio` + `prisma-universal`, con gates |
| Molde de partidas | Vertical `marketing-*` (12 reflejos puros, `PosPersistencia`) |
| Anti-bucle | 3 cerrojos: planos separados · single-writer · idempotencia |
