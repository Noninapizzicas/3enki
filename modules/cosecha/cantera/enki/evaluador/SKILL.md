---
name: evaluador
description: Reflejo puro (sin estado, sin egress) que dictamina fichas del radar contra los 6 criterios fijos. Regla determinista: por criterio, evidencia no vacía → CON_EVIDENCIA; vacía → FALTA_EVIDENCIA. Algún criterio faltante → veredicto FALTA_EVIDENCIA (M10, el banco aparca). Los 6 con evidencia → dictamen PASA propuesto con detalle transparente por criterio. NO decide si el contenido vale (M11: la decisión final la confirma el dueño). Lee la ficha vía RPC banco.obtener.request.
when-to-use: Cuando el radar necesite dictaminar un candidato del banco (si tiene suficiente evidencia en la ficha), mostrar la vista transparente de un candidato con su detalle por criterio, o entender por qué un candidato quedó aparcado en observación (criterios_faltantes). Eslabón de juicio del ciclo: reloj → sonda → banco → evaluador → redactor → cartero.
tags: [radar, nichos, dictamen, criterios, evidencia, reflejo, sin-estado, m10, m11]
lente_dominio: radar
---

# evaluador — el juez determinista del radar

## Qué es

Reflejo puro del sistema Radar de Nichos. Dictamina fichas de candidatos contra los 6 criterios fijos de la FASE 2 §2, SIN estado propio y SIN salir al exterior (no necesita interruptor: sin egress → sin interruptor). Es el eslabón de JUICIO del ciclo:

```
reloj (semanal) → sonda (cosecha) → banco (custodia) → evaluador.evaluar → evaluador.veredicto_emitido
→ banco aplica transición → redactor (solo APROBADO) → cartero → ciclo_completado
```

## Contrato

- **entrada** = `evaluador.evaluar.request { project_id, candidatoId }` (reloj / interfaz) · `evaluador.ficha.request { project_id, candidatoId }`
- **salida** = `evaluador.veredicto_emitido { project_id, candidatoId, veredicto, detalle, criterios_faltantes? }` · `evaluador.evaluar.failed { project_id, candidatoId, code, message }`
- **garantía** = dictamen determinista sobre la ficha; NO inventa evidencia — una ficha sin dato nunca viaja a la newsletter
- **no hace** = NO decide si el contenido vale (M11: el dueño confirma la decisión final); NO persiste nada (el banco custodia la ficha y aplica la transición)

## FORMA: REFLEJO PURO

Sin persistencia. Única dependencia: RPC `banco.obtener.request` (el banco es el custodio de la ficha). Sin egress al exterior → sin interruptor propio.

## Los 6 criterios fijos (orden estable)

1. `DOLOR_RECURRENTE` — el nicho tiene un dolor que se repite
2. `DISPOSICION_A_PAGAR` — el segmento paga por resolverlo
3. `AUDIENCIA_ACCESIBLE` — se puede llegar a la audiencia
4. `EVIDENCIA_DE_DEMANDA` — hay demanda demostrada
5. `COMPETENCIA_NO_SATURADA` — hueco frente a la competencia
6. `ACCIONABLE` — se puede actuar sobre el nicho

**El dictamen se decide SOLO sobre estos 6.** Cualquier criterio extra presente en la ficha se refleja en el detalle con `extra: true` (transparencia) pero NO decide.

## Regla de dictamen (determinista)

```
PARA cada criterio de los 6:
    entrada = ficha.criterios[c] || {}
    evidencia = entrada.evidencia (array) || []
    estado = evidencia.length > 0 ? CON_EVIDENCIA : FALTA_EVIDENCIA
    faltantes += c si FALTA_EVIDENCIA

veredicto = faltantes.length > 0 ? 'FALTA_EVIDENCIA' : 'PASA'
payload = { project_id, candidatoId, veredicto, detalle }
si faltantes: payload.criterios_faltantes = faltantes
```

- **FALTA_EVIDENCIA** → el banco APARCA (M10): candidato a EN_OBSERVACION con `aparcado_en` y `motivo: falta_evidencia`. No viaja al redactor.
- **PASA** → dictamen propuesto (transparente, detalle por criterio). El dueño confirma la decisión final vía la interfaz (M11).

## RPCs que atiende

| request | handler | respuesta |
|---|---|---|
| `evaluador.evaluar.request` | onEvaluarRequest | 200 `{ candidatoId, veredicto, criterios_faltantes, detalle }` |
| `evaluador.ficha.request` | onFichaRequest | 200 `{ candidato, detallePorCriterio }` (vista M11) |

## Eventos que publica

- `evaluador.veredicto_emitido` — `{ project_id, candidatoId, veredicto, detalle, criterios_faltantes? }`. El banco escucha y aplica la transición de estado.
- `evaluador.evaluar.failed` — par de fallo canónico: `{ project_id, candidatoId, code, message }`. El reloj/interfaz saben que la evaluación no cerró.

## Errores canónicos

- `503 DEPENDENCIA_NO_DISPONIBLE` — banco no respondió a `banco.obtener.request`
- `404 RESOURCE_NOT_FOUND` — candidato no encontrado (`candidato_no_encontrado`)
- `400 INVALID_INPUT` — falta `project_id` o `candidatoId`

Ambos errores emiten `evaluador.evaluar.failed` antes de devolver el error (cada flujo cierra su círculo).

## Pitfalls aprendidos en vivo

1. **22 candidatos aparcados con el MISMO veredicto = señal de entrada, no fallo del evaluador.** El ciclo del 14-08: los 22 llegaron a EN_OBSERVACION con `motivo: falta_evidencia` porque la ficha entró con `ficha.criterios` VACÍO — la sonda extrajo señales crudas (titulo/url/sector) pero NO enriqueció la ficha con evidencia por criterio. El evaluador cumplió su contrato: sin evidencia → FALTA_EVIDENCIA. Un aparcamiento masivo uniforme significa que falta enriquecer la extracción (fix futuro apuntado: engagement del hilo — votos/comentarios/antigüedad — antes del guardar en la sonda).
2. **El evaluador NUNCA inventa evidencia.** Si la ficha no trae dato, el criterio es FALTA_EVIDENCIA. Una ficha sin dato no viaja a la newsletter — eso es la garantía, no un defecto.
3. **No confundir el veredicto con la decisión.** El evaluador dictamina PASA/FALTA; la decisión final (aprobar/publicar) la confirma el dueño por la interfaz (M11). La interfaz y el reloj consumen `evaluador.veredicto_emitido`; el banco aplica la transición.
4. **Dependencia única y explícita**: si `banco.obtener.request` no responde, el evaluador no puede dictaminar — emite `evaluar.failed` y NO responde 200. Verificar el banco primero ante un `failed` en el journal.

## Verificación del entregable

- `node --check index.js` limpio (reflejo puro)
- Gate `validate-hibridos --module evaluador` PASS
- Smoke en vivo:
  - Candidato con ficha vacía → `FALTA_EVIDENCIA` con los 6 `criterios_faltantes` y banco en EN_OBSERVACION
  - Candidato con ficha con los 6 criterios con evidencia → `PASA` con detalle completo
  - `evaluador.ficha.request` → devuelve `candidato` + `detallePorCriterio` (transparencia M11, el dueño ve TODO antes de confirmar)
