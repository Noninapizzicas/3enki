---
name: redactor
description: "Skill del conversor del Radar de Nichos (reflejo 0.1.0): custodia el historial de borradores (p6), valida la entrada del cajón redactar y persiste por proyecto. No redacta (cajón LLM) ni decide qué se publica (M11)."
when-to-use: "Operar el módulo redactor: listar/validar/guardar borradores, entender el pipeline candidato→borrador (M9), o depurar la cadena de la newsletter."
tags: [radar, newsletter, borradores, reflejo, blueprint]
---

# Redactor — conversor de newsletters (Radar de Nichos)

## Qué es

Módulo HÍBRIDO del Radar de Nichos: el REFLEJO (JS determinista) custodia el historial de
borradores (p6), valida la entrada del cajón y persiste por proyecto. El CAJÓN del blueprint
(`redactar`, responde:true en `redactor.redactar.request`) es quien REDACT A la newsletter
con la plantilla M9 (ficha visible → veredicto claro → decisión accionable, 5 min, español,
sin clickbait) leyendo la ficha del banco.

Reparto (anti-colisión):
- BLUEPRINT (LLM): redactar — SOLO aquí, nunca en subscribes del reflejo.
- REFLEJO (determinista): listar · validar · borrador.guardar — validación y persistencia.

Garantía: todo borrador que se persiste pasó por la guarda (candidato_id + ficha en validar;
candidato_id + newsletter no vacía en guardar). Dedupe por (project_id, candidato_id) con
version++. Nunca decide qué se publica: eso es del dueño (M11).

## Contrato (module.json / index.js)

- version: 0.1.0 (reflejo-0.1.0) · blueprint_driven: true · blueprint_path: redactor.blueprint.json
- cajones_enabled: true · dependencies: [banco] (la ficha la lee el cajón vía banco)
- Sin interruptor propio: el redactor NO sale al exterior (solo RPC interno al banco).

## RPCs (subscribes del reflejo)

| RPC | Handler | Entrada | Respuesta | Errores |
|---|---|---|---|---|
| redactor.listar.request | onListarRequest | { candidato_id?, estado? } | 200 { borradores[], total } | — |
| redactor.validar.request | onValidarRequest | { candidato_id, ficha } | 200 { valido, candidato_id } | 400 INVALID_INPUT |
| redactor.borrador.guardar.request | onBorradorGuardarRequest | { project_id, candidato_id, newsletter, titulo? } | 200 { borrador } | 400 INVALID_INPUT |
| project.activated | onProjectActivated | { project_id } | restaura /radar/redactor.json | — |

### Detalle de ops (reflejo)

```
_listarBorradores({candidato_id?, estado?})
  borradores ← Map.values() filtrado por candidato_id y estado
  ordena fecha DESC · devuelve { status:200, data:{ borradores, total } }

_validarEntrada({candidato_id, ficha})
  SI !candidato_id                          → 400 INVALID_INPUT field candidato_id
  SI !ficha objeto vacío                    → 400 INVALID_INPUT field ficha
  SINO → { status:200, data:{ valido:true, candidato_id } }

_guardarBorrador({project_id, candidato_id, newsletter, titulo?})
  SI !candidato_id                          → 400 INVALID_INPUT field candidato_id
  SI !newsletter string no vacía            → 400 INVALID_INPUT field newsletter
  clave ← `${project_id}:${candidato_id}`
  borrador ← { id: previo?.id ?? `borrador_${candidato_id}`,
               candidato_id, titulo: input ?? previo ?? 'Newsletter semanal',
               newsletter, version: previo ? previo.version+1 : 1,
               estado: 'LISTO', fecha: nowISO, project_id }
  Map.set(clave) · marcarDirty(pid) · publish redactor.borrador_listo
  → { status:200, data:{ borrador } }
```

Ciclo de vida del borrador: LISTO → (cartero) → ENVIADO / FALLIDO (lo anota el reloj o el cartero).

## Eventos (publishes)

| Evento | Cuándo | Payload |
|---|---|---|
| redactor.borrador_listo | Tras persistir (solo si guardar fue 200) | { borrador } |
| redactor.redactar.failed | El cajón falló | { error, detalle? } |

## Errores canónicos

- 400 INVALID_INPUT: candidato_id ausente · ficha ausente/vacía · newsletter ausente/vacía.
  Siempre con `field` nombrado. Es la guarda anti borrador vacío.

## Reglas vivas (M del plan)

- M9: la newsletter se redacta con la plantilla (ficha visible → veredicto claro → decisión
  accionable; 5 min; español; sin clickbait). La plantilla vive en el módulo
  (data/plantillas/m9.md), no en la cantera.
- M11: el redactor NO decide qué se publica — produce borradores; el dueño aprueba.
- La skill no se activa como lente (sin lente_dominio): es eslabón de pipeline, no monta UI.

## Operar (verificar por disco, no por RPC)

- Historial: leer /radar/redactor.json del proyecto (persistencia real del reflejo).
- Un borrador LISTO esperando envío = el cartero puede tomarlo; un borrador que no aparece
  en disco NO existe (los Map se hidratan por project.activated; post-restart, hasta que el
  proyecto se active, el reflejo responde con lo vacío).

## Pitfalls (verificados en vivo)

- Los blueprints se recargan por invocación sin restart: un fix del cajón aplica en la
  siguiente llamada, no hace falta reiniciar el core.
- La persistencia es por proyecto (snapshot filtra por project_id): multi-tenant aislado;
  un borrador de otro proyecto nunca contamina este Map.
- Si un borrador ya existe para el candidato (misma clave), guardar NO sobreescribe:
  version++ conserva el histórico. El id permanece estable (borrador_<candidato_id>).
- Lo no versionado en repo es efímero: un deploy con rsync --delete barre skills en disco
  que no llegaron al repo. Toda skill de la cantera debe estar commiteada.
