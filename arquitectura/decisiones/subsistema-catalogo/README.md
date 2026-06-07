# Vida de la carta — de crear-carta a precio

Carpeta-hogar del **rediseño del subsistema-catálogo** de pizzepos: catálogo · ingredientes ·
familias · variaciones · canal · precio · composición. Centraliza el trabajo de diseño para no
dispersarlo y para **no contaminar `CLAUDE.md`** (que describe el código real, no objetivos).

> **Estado:** diseño **CERRADO** (D1 + D2 + D3 + persistencia). Código **NO implementado** aún.
> `CLAUDE.md` = realidad del código. Esto = el objetivo al que aterrizar.
> El código es la fuente de verdad; esta carpeta es la guía de aterrizaje.

## La vida de una carta (el flujo)

```
CREAR            menu-generator      texto/dictado → carta JSON (semilla v2: id canónico + familia)
GUARDAR          carta-manager       dueño del DISEÑO (la carta como conjunto). Único escritor.
ENRIQUECER       ingredientes        precio_extra (+ corrige familia). Catálogo = unión por id (derivado).
CLASIFICAR       variaciones         vista por familia + reglas (quitables/añadibles). Derivado puro.
ASIGNAR CANAL    tarifas             canal → carta_id. Personalización por LLM en carta-manager.
COMPONER+TASAR   composers + comandero  el composer tasa contra la carta del canal → item.compuesto.
```

Todo lo de abajo (cuentas, cuentas-canales, cobros, cocina) **confía** en el precio que sale de
comandero — por eso el precio tiene que salir BIEN de ahí (composición + canal coherentes).

## Índice

| Archivo | Qué es |
|---|---|
| `subsistema-catalogo.contract.json` | Las decisiones cerradas (D1/D2/D3/persistencia) + mapa operativo completo + desvío del código actual (checklist de aterrizaje). |
| `schemas/carta-pizzepos.v2.schema.json` | **Costura canónica**: la semilla enriquecida que produce menu-generator. La forma de la que todo deriva. |
| `schemas/item-compuesto.schema.json` | **Costura canónica**: lo que emite un composer tras componer un item (precio ya resuelto contra la carta del canal). |
| `pseudocodigo/` | Pseudocódigo OOP por pieza. Se llena **en orden de dependencia**, una a una. |

## Las decisiones (resumen)

- **D1 — Catálogo.** Reparto sin absorción (carta-manager=diseño · ingredientes=precio_extra+familia ·
  variaciones=vista-por-familia). Semilla **enriquecida** (id canónico + familia en origen). Enlace por id.
  Cero copias materializadas. Modelo **vertical-agnóstico** (ítem/componente/familia).
- **D2 — Canal/precio.** Canal = **carta independiente**. Personalización por **operaciones de LLM** en
  carta-manager (clonar + quita/pon/sube-familia/sube-producto). tarifas = solo asignación carta↔canal.
  Runtime de precio tonto-simple; sin módulo precio nuevo.
- **D3 — Composers.** Composer **autocontenido** (lógica + regla de precio + capa de imagen). Tira de la
  carta del canal activo y **tasa contra ella** → `item.compuesto`. comandero elimina `_resolverPrecioCanal`
  y confía. `ProductoBtn` = composer base (layouts entero/partido).
- **Persistencia.** **JSON por proyecto** (filesystem). 3 gatillos para reconsiderar SQLite
  (catálogo grande · concurrencia real · derivaciones complejas).

## `pseudocodigo/` — OOP por pieza (orden de dependencia)

```
menu-generator → carta-manager → ingredientes → variaciones → tarifas → comandero → composers
```

| Pieza | Naturaleza | Qué hace en el rediseño |
|---|---|---|
| `menu-generator.md` | blueprint | produce la **semilla v2** (id canónico + familia en origen) |
| `carta-manager.md` | blueprint | dueño del **diseño**; save+versionado; manipulación y `clonar` (canal = carta independiente, D2) |
| `ingredientes.md` | JS | autoridad de **precio_extra**; catálogo = **unión por id** (deriva, no copia) |
| `variaciones.md` | JS | **vista por familia** + reglas; **tasa** base+extras (D2: sin módulo precio) |
| `tarifas.md` | JS | **solo** asignación canal↔carta (saneado bajo /pizzepos) |
| `comandero.md` | JS | buffer del ticket; **YA NO tasa** (elimina `_resolverPrecioCanal`, confía en el composer) |
| `composers.md` | front | **autocontenidos**; tiran de la carta del canal y **tasan** ahí; emiten `item.compuesto` |

Cada pieza encaja contra las dos costuras canónicas de `schemas/`.
Estado: **pseudocódigo completo**; pendiente el aterrizaje a código (ver `desvio_codigo_actual` del contrato).
