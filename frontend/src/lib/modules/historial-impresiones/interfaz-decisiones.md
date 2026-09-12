# historial-impresiones — decisiones de interfaz (F7)

> PRÁCTICA (2ª iteración — tras catalogo-modelos): cada fila documenta la cadena
> **evento → contexto → forma → elemento → atributos** y el **por qué**.
> Este documento ES el dataset de patrones para futuras automatizaciones de la fase 7
> (generación de paneles específicos con stores MQTT).
> Fuente de verdad: `modules/historial-impresiones/index.js` (handlers reales),
> `esquema-jefe/esquema-jefe.md` (F6) y `historial-impresiones.blueprint.json` (F6½).
> Construido como ingeniero de interfaz de Enki sobre el patrón de
> catalogo-modelos (`CatálogoModelosPanel.svelte` + `stores/catalogo.ts`).

## Matiz estructural: el jefe es LECTOR (NO escritor)

`historial-impresiones` es un **CUSTODIO puro** (append-only). A diferencia de
catalogo-modelos (donde el jefe registra modelos), aquí **el registro llega solo** por
`impresion.completada` (`onImpresionCompletada`, fire-and-forget) o por RPC de
`ciclo-impresion`. Por eso el panel **NO tiene gesto de alta del jefe**: es una
**cinta cronológica** de impresiones pasadas que se refresca en vivo por la señal de
**ESCRITURA del sistema** `historial.impresion_registrada`. El único `señal-refresh`
del jefe es esa — `listar` es lectura pura, sin señal propia.

| op | evento (RPC) | contexto | forma | elemento | atributos | por qué |
|---|---|---|---|---|---|---|
| listar | historial.listar.request → .response | muchos registros cronológicos, más reciente primero; cada uno: fecha · modelo_id/nombre · material · filamento_usado · tiempo · resultado · registrado_en | cinta cronológica (ref-select/cinta) | filas de tarjeta (li.fila) | fecha · modelo_nombre (chip 🧊) · material (🧵) · filamento (🪡) · tiempo (⏱) · resultado (chip-color) | el gesto rey del jefe es MIRAR la memoria del taller; el registro entra por evento, más reciente arriba |
| total (listar → total) | historial.listar.request → .response | cuántas impresiones hay registradas del proyecto | cabecera de pulso (cinta-estado) | chip-pulso | {$totalRegistros} impresiones | el jefe sabe cuánto trabajo ha pasado por el taller de una pasada |
| estado vacío | historial.listar.request → {registros:[],total:0} | store sin entradas aún (no hay error: respuesta 200) | cinta-estado aviso | .vacio (icono 🧭 + texto) | "sin impresiones registradas aún — el ciclo de impresión las registrará" | hueco nombrado, nunca inventado; orienta sin gesto que no existe |
| refresco vivo | (señal) historial.impresion_registrada | una impresión del proyecto acaba de completarse | señal-refresh | la cinta re-lee (debounce 60ms) + confirmación viva 🆕 | la fila nueva aparece arriba del todo, sin recargar (R3) | el jefe NO tiene botón de recargar: el historial crece solo por el evento del sistema |

## Señal-refresh (tiempo real, nunca recarga)

| evento publicado | refresh_on | elemento que late | por qué |
|---|---|---|---|
| historial.impresion_registrada | listar | cinta (registro nuevo arriba) + chip-pulso total + confirmación viva | la señal de ESCRITURA del sistema re-lee la cinta (R3); el jefe ve crecer la memoria sin tocar nada |
| historial.registrar.failed | (no aplica al jefe) | — | solo importaría en un registro manual [ABIERTO]; el flujo normal (impresion.completada) no falla por UI |

## Cadena completa por op

```
HISTORIAL.IMPRESION_REGISTRADA (señal de ESCRITURA del sistema)
   │   └──> re-lee listar (R3, debounce 60ms) → fila nueva arriba de la cinta + total++
   │
HISTORIAL.LISTAR (RPC, ROL JEFE — LECTOR puro)
   │   └──> cinta cronológica: fecha · modelo · material · filamento · tiempo · resultado
   │        estados: cargando → vacío ("sin impresiones registradas aún") → datos
   │        cabecera de pulso: n impresiones (total) · huecos como "desconocido"
   │
HISTORIAL.REGISTRAR (RPC, ROL NEUTRO/SISTEMA — NO es gesto del jefe)
   └──> lo invoca ciclo-impresion (historial.registrar.request) o entra por impresion.completada
        → NOTA: el panel del jefe NO lo expone como botón (ley de cero supuestos: solo lo que hay)
```

## Decisiones de arquitectura de la práctica

1. **Store MQTT reflejo (no cálculo).** `stores/historial.ts` sigue el molde canónico:
   `initialState` + `historialStore` (writable) + derivados + acción
   (`loadHistorial` vía `mqttRequest('historial', 'listar', {project_id})`)
   + `initHistorialSubscriptions` (subscribe → debounce → refresh) + `resetHistorial`.
   La UI no tiene lógica de negocio: solo escribe al recibir una lectura RPC (R2).

2. **Panel específico, no BlueprintForm.** `HistorialImpresionesPanel.svelte` reemplaza
   el envoltorio genérico: cinta cronológica + cabecera de pulso + estados + confirmación
   viva, con lenguaje visual color/icono/texto (🖨️/🧭 entidad, chip-color por resultado,
   chips de material/filamento, pulso total). SIN botón de alta (jefe LECTOR).

3. **Filtro por rol declarado en el blueprint.** `listar` = rol jefe → cinta LECTORA;
   `registrar` = rol neutro/sistema → se excluye del árbol del jefe. El jefe NO DECLARA.

4. **Refresco por señal de ESCRITURA del sistema (R3), nunca recarga.** No hay botón de
   recargar. `historial.impresion_registrada` re-lee la cinta; el par de fallo
   `historial.registrar.failed` se ignora (solo relevante para un registro manual [ABIERTO]
   que el dueño no ha decidido). Ley de cero supuestos: no se materializa lo que no hay.

5. **Multi-tenant.** El store lee `sessionProjectId`; al cambiar de proyecto
   `resetHistorial()` vacía (sin datos ajenos) y re-carga el activo.

## Dataset de patrones (aprendizaje para automatizar F7)

| forma UI | disparo | elementos recurrentes | plantilla de decisión |
|---|---|---|---|
| cinta cronológica | muchos registros ordenados por fecha, más reciente primero | fila = tarjeta con fecha + cuerpo + chips; pulso total arriba; estados vacío/cargando/datos | ref-label del blueprint (`modelo_nombre`) alimenta la fila; `registrado_en`/`fecha` para el eje temporal |
| cabecera de pulso | saber cuánto hay de una pasada | chip con `total` | listar → total: el contador del jefe |
| señal-refresh de ESCRITURA del sistema | el jefe NO escribe, la señal la emite otro | subscribe → debounce → re-lectura; confirmación viva 🆕 | el refresco lo da la señal del bus, nunca una recarga manual (R3) |
| estado vacío (sin gesto) | store sin entradas, jefe sin escritura | icono + mensaje que orienta + subtexto | hueco nombrado; NO se inventa un botón de alta que el rol no tiene |

**Ley de cero supuestos:** el panel materializa solo lo que el esquema/blueprint declaran.
`registrar` es rol neutro/sistema (no gesto del jefe) → no hay formulario; el jefe es
LECTOR → cinta pura. Los campos obligatorios salen de `listar.args[].required`
(solo `project_id`, que lo provee la sesión) y los atributos mostrados de las columnas
reales de `_listar`.

> Diferencia con catalogo-modelos (1ª iteración): allí el jefe tenía escritura
> (`registrar` rol jefe → modal de alta). Aquí el jefe es LECTOR y la escritura es del
> sistema → la composición del panel se reduce a VER (listar) + SABER (total) + REFRESCARSE
> (señal). Esa es la 2ª lección de la práctica: la presencia/ausencia del gesto de escritura
> del jefe condiciona toda la forma del panel.
