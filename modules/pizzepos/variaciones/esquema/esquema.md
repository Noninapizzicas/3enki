# Esquema maestro — variaciones (UI por roles)

> Sujeto: la modificación de un producto al elegirlo (quitar/añadir), con sus reglas,
> motor, captura y resultado. Analizado con el esquematizador (prisma recursivo + disección).
> Ley aplicada: agnosticismo — cero tecnologías nombradas en el análisis; todo entorno es puerto.
>
> **Consolidación lente-jefe v2**: ver `pasada-4-consolidacion-formas-ui.md` — veredicto
> del árbitro 7/7 ops, composición seleccionar→informarse→declarar, formas UI canónicas
> y señales pareadas. Resumen: `configurar`=JEFE · `evaluar`=UTILIZACIÓN (POS, fuera
> del panel) · resto neutro. La declaración del jefe es 1 op → 1 `editor-bloque`
> (las 4 palancas en 1 modal) con señal pareada `carta.editada` (gruesa [ABIERTO H2]).
> El informe REQUIERE transparencia declarado vs derivado [H3]. Lote [ABIERTO H1]: nombrado, no implementado.

```
VARIACIONES
│
├─ REGLAS (qué es posible) ─────────────────────────────── ROL JEFE
│   ├─ Declaración · custodio (la CARTA guarda; el editor es su cara) · ATÓMICO · [HUECO UI]
│   ├─ Vista de reglas vigentes · reflejo-proyección · ATÓMICO · [HUECO UI]
│   ├─ Derivación · reflejo puro · REF ✅ (derivar-opciones)
│   └─ [ABIERTO] permiso de declaración (quién edita) — decisión del dueño
│
├─ MOTOR (juez: valida + precia) ──────────────────────────── neutro
│   └─ Strategy por modo + agregador · reflejo puro · REF ✅ (motor-opciones)
│                                                          · módulo lo sirve en `evaluar` ✅
│
├─ CAPTURA (momento de elegir) ─────────────────────────── ROL UTILIZACIÓN
│   └─ Hoja de elección · conversor · REF ✅ (OpcionesSheet en POS)
│       · emerge del MODO de cada opción (radio/check/chips/libre)
│       · hint de precio; la verdad la fija el motor al añadir
│       · [ABIERTO] segundo canal de utilización → extraer componente (solo si existe)
│
└─ RESULTADO (dictamen que viaja) ─────────────────────────── neutro
    ├─ Validada → composición final + precio desglosado · reflejo-señal ✅
    ├─ Rechazada → motivo nombrado (nunca silencio) · reflejo-señal ✅
    └─ Doble verificación: captura → buffer (comandero.item_agregado) ✅
```

## Los 2 roles que pediste

**ROL JEFE (creación y edición de reglas)** — es un CUSTODIO con cara de edición.
Hoy el dato vive en la carta (`producto.opciones`) y el sistema lo DERIVA cuando la carta
no lo trae. Lo que falta NO es un módulo: es la **cara de edición** de ese campo.
Desde v4.5.0 la escritura existe: op **`configurar`** (delega en `carta.update_product`,
custodio único; resuelve la carta activa sola). Sus 4 palancas son TODO lo configurable
(verbales del dueño): `permite_quitar[]`, `permite_anadir`, `max_ingredientes_extra`,
`extras_sugeridos[{ingrediente_id, precio_extra?}]`.

1. **Editor de opciones por producto** — panel donde el jefe marca qué ingredientes son
   quitables, qué extras se ofrecen (con precio), y el límite máximo. Escribe en
   `producto.opciones` vía la carta (su custodio). Al guardar → `carta.editada` →
   variaciones se reconfigura solo (el flujo ya existe).
2. **Vista de reglas vigentes** — por producto, mostrar lo declarado vs lo derivado
   (transparencia: el jefe ve qué está sirviendo el sistema). Es pintar el `get` que
   ya existe.

**ROL UTILIZACIÓN (añadir/quitar al elegir)** — COMPLETO de punta a punta:
al elegir un producto en el POS, la hoja de elección emerge de las opciones (sin/quitar,
añadir con precio, nota libre), el carrito manda la selección a `evaluar`, el motor
valida y tasa en céntimos, el precio queda fijado server-side, y al agregar al buffer
el módulo re-valida y emite dictamen. Nada que construir; solo pulir si aparece un
segundo canal de venta.

## Recuento

- 3 pasadas (prisma recursivo hasta seco)
- Órganos: 6 · REF (ya existen): 4 · HUECOS reales: **2, ambos UI del rol JEFE**
- `[ABIERTO]`: 2 (permiso de edición; segundo canal de utilización)
- Formas: custodio 1 · conversor 1 · reflejo 4

## Puertos abiertos (cableables por el sitio)

- `fuente_de_reglas` → hoy: la carta (campo `opciones` de cada producto)
- `precios` → hoy: módulo ingredientes (get_precio / precio_extra)
- `captura` → hoy: OpcionesSheet (Svelte) en el POS
- `destino_del_resultado` → hoy: comandero → impresión/ticket vía eventos