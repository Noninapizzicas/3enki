---
name: reloj
description: Micro-agente del ciclo semanal del radar — orquesta sonda→banco→evaluador→redactor→cartero, elige 1 candidato (M1/M4) y cierra el ciclo con su par de fallo. Semana vacía → avisa y NO envía (M5).
when-to-use: Disparar el ciclo completo del radar (reloj.ciclo.iniciar.request, por scheduler semanal o desde la interfaz del dueño), o diagnosticar por qué un ciclo abortó o dio semana_vacia.
tags: [radar, ciclo, orquestador, M1, M4, M5, reflejo]
lente_dominio: null
---

# reloj — el micro-agente del ciclo semanal (reflejo puro, sin estado)

Módulo REFLEJO sin store ni persistencia que **compone la cadena**
sonda→banco→evaluador→redactor→cartero y cierra el círculo. No guarda estado
(el estado vive en los custodios), no requiere a ningún módulo (solo `_rpc` por
el bus), no redacta, no decide el contenido (M11: el dueño confirma vía interfaz).

## Contrato

- entrada: `reloj.ciclo.iniciar.request { project_id, para?, correlation_id? }`
  (lo dispara scheduler — job cron semanal — o la interfaz del dueño)
- salida: `reloj.ciclo_iniciado` · `reloj.ciclo_completado` ·
  `reloj.ciclo_semana_vacia` (M5) · `reloj.ciclo_abortado` (par de fallo)
- garantía: todo flujo responde — el RPC devuelve SIEMPRE 200 con
  `data.ciclo ∈ { completado, semana_vacia, abortado }` (nunca cuelga el bus)

## La orquesta (10 pasos)

1. `sonda.fuentes.listar` (10s) — sin fuentes → nada que cosechar (determinista)
2. `sonda.recolectar` (600s) — señales; sonda no disponible → aborto etapa sonda.recolectar
3. `banco.anadir { señales }` (dedupe fuente+url, tope 100 → rotación M6) — solo si hay señales
4. `evaluador.evaluar` por candidato NUEVO — FALTA_EVIDENCIA NO es fallo: el banco aparca (M10) y el ciclo sigue
5. `banco.listar { estado: APROBADO }` — solo APROBADO puede ser seleccionado (M1)
6. `_priorizar` (M4, proyección interna) + `_elegir` 1 único — sin elegibles → semana_vacia
7. `banco.seleccionar` (APROBADO → SELECCIONADO)
8. `redactor.redactar` (60s) — si aborta aquí, el borrador ya quedó conservado → reintento el siguiente ciclo
9. `cartero.verificar` (20s) — cualquier estado ≠ `disponible` aborta (canal caído, borrador conservado)
10. `cartero.enviar { borrador, para }` (40s) → ok:true SOLO con ack → `banco.publicar` (SELECCIONADO → PUBLICADO) → `reloj.ciclo_completado`

## Semana vacía (M5) y aborto

- `reloj.ciclo_semana_vacia { motivo }` — `banco_sin_elegibles` (no había nada APROBADO)
  o `todas_sin_evidencia` (se añadieron pero ninguna pasó). **Avisa y NO envía.**
- `reloj.ciclo_abortado { etapa, detalle }` — par de fallo; **lo ya escrito se
  conserva** (candidatos, veredictos, borrador) → reintento el siguiente ciclo.

## Priorización interna (M4)

Regla que vive AQUÍ, jamás en _shared: más criterios con evidencia primero;
desempate por disposición a pagar; estable por id. Espejo deliberado de la
`_prioridadLocal` del banco (5 líneas duplicadas entre islas, cero lógica compartida).
`_elegir` (M1): 1 único candidato por ciclo.

## Pitfalls (verificados en vivo)

- El disparo manual por el portal choca con el guard (NEEDS_CONFIRMATION) — el
  disparo limpio es por el panel del dueño o `reloj.ciclo.iniciar.request` externo.
- `publishAndWait` puede devolver `res:null` en el `.response` del radar → verificar
  por log/disco (eventos `reloj.*` en el journal + estado persistido en los custodios).
- Un barrido sano NO es 15/15: 13 ok / 2 timeout es señal de sistema vivo.
- Si el banco llega vacío al ciclo (restart sin project.activated) → semana_vacia
  `banco_sin_elegibles`; la hidratación lazy de cada custodio lo cura en el ciclo siguiente.
