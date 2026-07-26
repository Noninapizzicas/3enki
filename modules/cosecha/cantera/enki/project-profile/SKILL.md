---
name: project-profile
description: "Perfil extendido del proyecto: propósito, temporalidad, recursos, stakeholders, entregables, criterios de éxito y valor. Persiste por proyecto. Escucha project.created para inicializar."
fuente: enki
dominio: sistema
lente_dominio: proyecto
tags: [proyecto, perfil, gestion, proyecto-manager]
---

# Project Profile — perfil extendido del proyecto

Da al proyecto los valores que el esquematizador identificó como ausentes en project-manager.

## Eventos que atiende

| Evento | Descripción |
|---|---|
| `project.created` | Inicializa perfil vacío |
| `project.activated` | Restaura perfil persistido |
| `project-profile.get.request` | Devuelve perfil completo |
| `project-profile.update.request` | Actualiza campos (merge parcial) |

## Estructura del perfil

```json
{
  "proposito": "string",
  "temporalidad": { "inicio": "ISO?", "fin_estimado": "ISO?" },
  "recursos": { "personas": ["id"], "presupuesto": "number" },
  "riesgos": [{ "descripcion": "", "impacto": "", "probabilidad": "" }],
  "stakeholders": [{ "nombre": "", "rol": "", "expectativas": "" }],
  "entregables": [{ "nombre": "", "descripcion": "", "criterios": "" }],
  "criterios_exito": ["string"],
  "valor": "string"
}
```
