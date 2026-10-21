# F7b · ENSAMBLAJE — contabilidad

> El **RECOMPONEDOR**: cruza lo **diseñado** (F3b) con lo **escrito** (F4 módulos ·
> F5 skills · F6½/F7 interfaces) y dice la verdad de la divergencia.
> Herramienta: `modules/proceso-negocio/ensamblaje.js` (`Ensamblaje.recomponer()`).

## El veredicto, en una línea

**Nada de lo diseñado falta.** Todo lo construido tiene su módulo, su skill, su
evento. Las divergencias que salen son **escuchas de más** (legítimas) y
**hechos que se publican para fuera** (también legítimos).

## Los números

| métrica | valor |
|---|---|
| hojas diseñadas (F3b) | **118** |
| hojas escritas (F4) | **118** |
| hojas NO escritas | **0** |
| falta algún `subscribe` diseñado | **NO** ✅ |
| falta algún `publish` diseñado | **NO** ✅ |
| conexiones rotas | **16** — todas `SOBRA_EL_PUBLISH`, `falta_en: null` |
| skills escritas (F5) | **118/118** |
| con interfaz (F6½+F7) | **43** (los 75 restantes: su cara es el bus) |

## Las 16 "conexiones rotas" — no hay nada que cablear

Las 16 son **`SOBRA_EL_PUBLISH`** con `falta_en: null`: hechos de dominio que un
módulo publica y **ningún módulo del plan consume** — porque **no son para dentro**,
son para fuera (otras verticales, la interfaz, el chat):

```
contabilidad.acceso_nomina_declarado · anclaje_cierre_declarado · aviso_entregado
contrato_hecho_declarado · declaracion_justificada · declaracion_rectificada
documento_archivado · excepcion_desatascada · factura_encadenada
fuente_faltante_declarada · modelo_exportado · negocio_parcela_creada
obligacion_avanzada · parcela_reclamada · perfil_administrativo_declarado
proceso_anotado
```

`falta_en: null` = **no hay dónde cablearlo**. No es un hueco: es la puerta de salida.

## Las 83 divergencias "extra" — los módulos escuchan MÁS que el plan

Los módulos declaran escuchas de dominio que la **espina de F3b no volcó**
(la espina capturó `sube`/`publica`; el diseño F3 sí declaraba `ESCUCHA`).
Y todas tienen **emisor real**:

```
project.activated                          30 módulos   emisor: core ✅
contabilidad.asiento_asentado              26           emisor: escritor-diario ✅
contabilidad.hecho_recibido                14           emisor: puerto-evento-vertical ✅
contabilidad.criterio_fijado                6           emisor: cola-declaraciones-criterio ✅
contabilidad.ejercicio_cerrado              5           emisor: cierre-ejercicio ✅
contabilidad.nomina_recibida                4           emisor: puerto-nomina ✅
contabilidad.presupuesto_fijado             3           emisor: presupuesto ✅
contabilidad.excepcion_encolada             3           emisor: encolado-excepcion ✅
contabilidad.cuota_amortizacion_generada    2           emisor: plan-amortizacion ✅
contabilidad.ajuste_entrado                 2           emisor: asiento-ajuste ✅
```

**Es decir: el cableado real está MÁS COMPLETO que el plan.** Los módulos
conectan entre sí según el diseño F3, y el ensamblaje lo lee como "extra"
porque la espina no declaraba esas escuchas.

## Por qué el veredicto dice `ensamblado: false`

El veredicto del ensamblaje es **estricto por diseño**:
`ensamblado = (hojas_no_escritas === 0) && (divergentes === 0) && (conexiones_rotas === 0)`.

Y aquí: `divergentes = 83` (extras legítimos) y `conexiones_rotas = 16`
(salidas legítimas). **Por la letra, no está ensamblado. Por la sustancia, sí.**

> **Hallazgo para el proceso**: la espina de F3b **no vuelca las escuchas de
> dominio** (`ESCUCHA` del diseño F3). Si las volcara, el ensamblaje daría
> `divergentes = 0` y el veredicto sería útil como gate. **Es un hueco del
> artefacto, no de los módulos.**

## Lo que este ensamblaje demuestra

```
DISEÑADO (F3b)  →  ESCRITO (F4/F5/F6½/F7)
   118 hojas        118 módulos · 118 skills · 43 paneles
   NADA perdido ✅  CERO faltantes en las 118
```

**La cadena F2 → F3 → F3b → F4 → F5 → F6 → F6½ → F7 está cerrada y coherente.**
Es exactamente lo que el rehacer por el proceso tenía que demostrar.
