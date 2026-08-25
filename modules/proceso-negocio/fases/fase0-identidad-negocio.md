# FASE 0 — Identidad del Negocio

> Skill: `identidad-negocio`
> Evento de entrada: `project.created`
> Evento de cierre: `negocio.identificado`

## Qué hace

Descubre la identidad del NEGOCIO del dueño con 9 preguntas abiertas anti-sesgo.
El sujeto es el negocio, nunca el contenedor técnico. El tipo se DERIVA de lo
declarado — emergente, jamás elegido de una lista.

## Qué lee

Nada. Pregunta al dueño directamente.

## Qué crea

Un solo archivo — el perfil del proyecto:

```
state/project_profile.json
```

Contenido escrito con UNA sola llamada `project-profile.update`:

```json
{
  "project_id": "<id>",
  "proposito": "<para qué existe este negocio>",
  "identidad": {
    "que_es": "<qué construye>",
    "que_vende": "<qué ofrece>",
    "como_lo_elabora": "<cómo funciona>",
    "tipo_derivado": "<emergente del sujeto>",
    "preguntas_abiertas": []
  }
}
```

## Cierre

El reflejo `project-profile` hace la transición `sin_identidad → con_identidad`,
sella `declarado_el` y emite `negocio.identificado` con todo el payload.
