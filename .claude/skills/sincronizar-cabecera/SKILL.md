---
name: sincronizar-cabecera
description: Mantiene la CABECERA (rebanadas de arquitectura/cabecera/**) al paso del código en cada PR/commit, cazando la deriva SEMÁNTICA que el vigilante determinista no ve — la prosa que contradice al código (una rebanada sellada `verificado:` describiendo código muerto, un comentario que quedó atrás, un trabajo_pendiente ya superado). El REFLEJO (scripts/cabecera/sync-reflejo.js) arma el expediente del diff; el PRISMA de 5 lentes LEE código-vs-prosa y ofrece el PARCHE en positivo, no la queja.
when-to-use: Cuando un PR o commit toca código bajo las `fuentes` de una rebanada y hay que verificar que su prosa sigue siendo CIERTA (no solo que el timestamp cuadre). Úsala tras cambiar un módulo, antes de abrir/actualizar el PR, o cuando cabecera-check cante STALE. NO para verificar números/versiones (eso lo computa doc-sync) ni para staleness por fecha (eso lo vigila validate-cabecera) — esta skill es el peldaño SEMÁNTICO por encima de ambos.
allowed-tools: Read, Glob, Grep, Bash, Edit, Write
---

# sincronizar-cabecera — el PRISMA de frescura semántica

> Una rebanada se selló `verificado: 2026-07-09` describiendo un `CartaDigitalManager`
> con `generatePDF`/`pdfkit`/`cartasStore` — código que el módulo real (un PROYECTOR)
> borró en v2.0. El vigilante lo bendijo porque mide **timestamps y globs**, no
> **significado**. La cura no es otro check determinista (tiene el mismo techo): es una
> lente que **LEE** el código y la prosa, y juzga si la segunda sigue siendo cierta.

## La física del hueco (por qué hace falta el prisma)

```
validate-cabecera (determinista) VE:   ¿cambió la fuente después que la rebanada? (timestamp)
                                        ¿el glob de la fuente casa algún fichero?  (existencia)
                                        ¿el marcador {{...}} resuelve?             (doc-sync)

NO PUEDE VER:                           ¿la prosa DICE lo que el código HACE? (semántico)
                                        └─ y esa es justo la deriva que se cuela:
                                           prosa viva describiendo código muerto.
```

Un sello `verificado:` es una **afirmación humana**, y una afirmación puede mentir.
Un glob no lee. Solo una lente que abre el código y la prosa a la vez cierra el hueco.

## El reparto (híbrido — patrón del repo)

```
REFLEJO (JS, determinista)          scripts/cabecera/sync-reflejo.js --diff BASE --json
  └─ arma el EXPEDIENTE del diff:    rebanadas tocadas · secciones · ficheros_tocados
     no juzga, empareja              · blueprints[trabajo_pendiente] · comentarios_sospechosos

PRISMA (LLM, esta skill)            refracta el veredicto en 5 LENTES, una por modo de fallo
  └─ cada lente LEE código-vs-prosa  y emite deriva EN POSITIVO (el parche que la cierra)
```

## Receta

### 1 · El reflejo arma el expediente

```bash
node scripts/cabecera/sync-reflejo.js --diff "origin/<base>" --json
```

Devuelve `{ expedientes: [ { rebanada, secciones[], ficheros_tocados[], blueprints[], comentarios_sospechosos[] } ] }`.
Si `expedientes` viene vacío → **el diff no toca nada documentado; termina en silencio** (el olvido hace ruido, no falso ruido).

### 2 · El prisma juzga cada expediente — las 5 LENTES

Para cada rebanada afectada: `Read` su sección (por `ficheros_tocados` ↔ `secciones`, empareja tú) y `Read` el código tocado. Aplica **solo las lentes pertinentes** (no el catálogo entero — cada lente arranca con un objetivo afilado o no arranca):

| lente | objetivo afilado | señal de deriva |
|---|---|---|
| **contrato** | ¿los métodos/interfaz/clases que nombra la prosa EXISTEN en el código? | la prosa lista `generatePDF`; `grep` en el módulo no lo encuentra → **muerto** |
| **topics** | ¿los eventos/topics documentados casan con los `publish`/`subscribe` reales? | la prosa emite `carta.generated`; el código emite `cartadigital.publicado` |
| **comentarios** | ¿cada comentario de bloque concuerda con el código INMEDIATAMENTE debajo? | comentario dice `storage/tienda/bundle` `/shop/<slug>`; `const BUNDLE_DIR='/www'` debajo |
| **pendientes** | ¿el `trabajo_pendiente` del blueprint sigue REALMENTE abierto en el código? | item `feature_tienda_auto` "abierto"; el código ya hace `ensure-feature['www']` → **superado** |
| **numeros** | ¿versión/counts de la prosa coinciden? (refuerza doc-sync donde no hay marcador) | constante `this.version` clavada vs `module.json` |

**Cada lente verifica antes de acusar** (adversarial): antes de marcar deriva, `grep`/`Read` el código para confirmar que la prosa de verdad no se sostiene. Un falso positivo cuesta más que un silencio.

### 3 · Emitir en positivo — el parche, no la queja

Por cada deriva confirmada, entrega el **estado deseado construible**: el texto exacto que pondría la prosa al paso del código. No "la sección está stale" sino "reescribe §X así: …".

```
Deriva (lente contrato) en managers-y-blueprints.md §CARTA-DIGITAL MANAGER:
  la prosa describe generateCarta/generatePDF/cartasStore — el módulo v2.24 es un PROYECTOR.
  PARCHE → reescribir la sección: proyecta al vuelo (tarifas+carta-manager+marca+contenido),
           sin snapshots, con los dos frenos (contrato de slots · render). Re-sellar verificado.
```

### 4 · Cerrar

- **En sesión** (commit local): aplica los parches con `Edit` en el mismo commit que tocó el código → la rebanada camina al paso de su fuente (mandato `rebanada-con-el-pr`).
- **En PR** (workflow): ofrece los parches como comentario/sugerencia; el humano aplica.
- Si ninguna lente confirma deriva → **silencio**. Nada que sincronizar es una respuesta válida y frecuente.

## Invariantes (mandatos)

```json
{
  "esquema": "sincronizar-cabecera-v1",
  "mandatos": [
    { "haz": "LEE el código antes de acusar a la prosa — cada lente confirma con grep/Read", "protege": "cero falsos positivos; el silencio se gana leyendo, no asumiendo" },
    { "haz": "ENTREGA el parche (la prosa correcta), no el diagnóstico de staleness", "protege": "expresión en positivo — el estado construible, no la falta" },
    { "haz": "APLICA solo las lentes que el expediente enciende", "protege": "el coste de abrir la lente se paga solo con objetivo afilado" },
    { "haz": "NO selles `verificado:` sin releer la sección contra el código", "protege": "el sello es una afirmación; una afirmación que no se verificó miente (fue el fallo original)" },
    { "haz": "TERMINA en silencio cuando ninguna lente confirma deriva", "protege": "el olvido hace ruido; el no-hallazgo no debe hacer ruido falso" }
  ]
}
```

## Graduar el determinista (complemento, no sustituto)

Esta skill es el peldaño semántico. Debajo, aprieta el barato:
- `validate-cabecera.js` en modo PR es **file-granular**: tocar cualquier sección marca la rebanada "tocada" y calla las otras 13. Sección-granular sería el siguiente apriete determinista.
- El WARN es *testigo*; graduarlo a **freno** (stale = error, check required) donde el drift ya pasó (pizzepos) cierra la fuga del sello barato.

El prisma caza lo semántico; el freno determinista impide el sello vacío. Defensa en dos capas.
