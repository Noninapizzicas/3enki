# F4 · Tracking de construcción

> **Fase 4** (construir-modulos). 116 módulos = 118 hojas − 2 REUTILIZAR.
> Construidos por el **orden topológico de la espina**, en 14 oleadas.

## La regla que se aplicó (y por qué se rehizo todo)

**1 hoja atómica = 1 clase = 1 módulo.** Prohibido agrupar. El intento anterior
comprimió 118 hojas en 72 módulos sin auditar la transformación y verificando
contra el propio plan (circular). Se borró y se rehízo con el cotejo 1:1.

## Las 5 formas

| Forma | N | Qué es |
|---|---|---|
| **REFLEJO** | 60 | JS determinista: lee, calcula, deriva. Sirve RPCs del bus. |
| **CUSTODIO** | 29 | REFLEJO + `PosPersistencia` + guard de un solo escritor. |
| **PUENTE** | 13 | Traduce entre dos mundos (frontera). Stateless. |
| **MICRO-AGENTE** | 7 | REFLEJO que usa el LLM como herramienta para el juicio. |
| **CONVERSOR** | 7 | Cruza formato ↔ dato. No decide contenido. |

---

## Lecciones cazadas en F4

### 1 · Verificar el CÓDIGO, no los comentarios (oleada 1)
El grep de `PosPersistencia` casaba el **comentario** *"sin PosPersistencia"* →
daba stateless como custodio. Corregido: quitar comentarios antes de buscar.

### 2 · Escribir los ficheros COMPLETOS antes de verificar (oleada 4)
Un sub-agente se quedó sin iteraciones a **7,5/8** (faltaba un `module.json`).
Lección aplicada a todas las oleadas siguientes.

### 3 · El contrato tolerante NO fabrica datos (oleada 4)
`cuenta-terceros`, `declaracion-fuente-faltante`, `aviso-revision` dependían de
módulos aún no construidos → publican `503 DEPENDENCIA_NO_DISPONIBLE` y **no
inventan**. `motor-avisos` cerró el círculo en la oleada 12.

### 4 · `_rpc`/`_invalid`/`_atender` son helpers de la BASE
No redefinir: vienen de `ModuloHibridoReflejo`.

---

## 🔴 HALLAZGO EN VUELO (2026-09-29) — el 6º, y el único que la verificación estática NO podía ver

**Al arrancar la pila en producción, 5 módulos fallaban:**

```
ai-gateway.blueprint.load.failed
  "The \"paths[1]\" argument must be of type string. Received undefined"
```

**Cuáles:** `informe-accionable` · `etiquetado-analitico` · `narrador-estados` ·
`puente-lenguaje-dueno` · `desatasco-entrada` (los 5 MICRO-AGENTE con LLM).

**Causa raíz:** declaraban `"blueprint_driven": true` **SIN `blueprint_path`**.
El ai-gateway intenta leer la ruta (`undefined`) y revienta.

**De dónde vino:** la **plantilla de módulo que usé en F4** incluía el campo
`blueprint_driven` — y lo copié a módulos **que no son blueprint-driven**: su
`index.js` tiene el guion-prompt **embebido** y llama al LLM él mismo
(`llm.complete.request`). **Campo de más, no promesa incumplida.**

**El patrón REAL del repo (medido, no supuesto):** 23 módulos llaman al LLM desde
su JS. Los de `nichos/` (`veredicto-viabilidad`, `clasificador-intencion`,
`sondeo-territorio`… 13) y `prisma/formulador` hacen **exactamente lo mismo** que
los míos: `[index.js, module.json]`, `blueprint_driven` **ausente**, guion
embebido. Es un patrón **legítimo y extendido** — no un defecto.

**El híbrido canónico es OTRA cosa** (`patron/modulo-hibrido.md`):
`sonda`/`destilador`/`recetas` = `index.js` **determinista puro** (sin LLM)
+ `.blueprint.json` con los cajones que el LLM de página ejecuta.

**Arreglo:** quitar el campo residuo (commit `8a3e8e79`). **El `index.js` no se
tocó**: ya hace bien su mitad.

**Y el alcance real: 9 módulos del repo, no 5.** Los otros 4 son **ajenos** y
siguen rotos: `marketing-analytics`, `marketing-audience`, `marketing-campaigns`,
`marketing-content`. **Esos SÍ son híbridos de verdad** (tienen su
`.blueprint.json` válido) → su arreglo es el **contrario**: rellenar el
`blueprint_path` que les falta. Script: `deployment/fix-marketing-blueprint-path.sh`.

---

## 🔴 EL HUECO DE FONDO (la lección que importa)

**Ninguno de los 39 validadores del repo detectaba esta incoherencia.**
`module-loading.validate.js` comprobaba `blueprint_driven` en un sitio
(`!hasIndex`) pero **nunca la pareja `blueprint_driven` ↔ `blueprint_path`**.

Por eso el error solo aparecía **en vuelo**. Y por eso 9 módulos convivieron con
él: **la verificación estática miraba la forma, no esta coherencia.**

**Cerrado:** `scripts/validar-blueprint-path.js` (regla:
`blueprint_driven:true ⟹ blueprint_path declarado Y el fichero existe`).
Verificado por regresión: reinyectando el bug en los 5 → **9 detectados**;
restaurado → 4. **Habría cazado los 5 míos.**

Integración canónica (contrato + validador + runner):
`deployment/integrar-validator-blueprint-path.sh` (idempotente, con sudo;
los ficheros canónicos son de `hermes:www-data`).

---

## Nota de entorno (bloquea trabajo sobre módulos ajenos)

**175 de los 365 `module.json` del repo son de `hermes:www-data` y el usuario
`admin` NO está en `www-data`.** El repo se clonó/desplegó mezclando dos
usuarios. Consecuencias:
- Cualquier edición de módulos ajenos → `Permission denied` (necesita sudo).
- `validate-all` no puede escribir su salida en
  `arquitectura/decisiones/_outputs/` → falla por EACCES, **no por código**.
  Verificado revirtiendo cambios: falla igual. **Es ambiental y preexistente.**
