---
name: pase-cocina
description: >-
  Módulo cara-al-servicio: materializa fichas de pase (snapshot operativo de
  la receta para el servicio en curso), registra incidencias y sustituciones.
  NO toma decisiones reactivas — solo registra; chef/jefe revisan post-servicio.
  Módulo del subsistema-recetario. 5 tools.
fuente: enki
dominio: cocina
tags: [pase-cocina, ficha, servicio, incidencia, sustitucion, recetario]
---

# Pase-cocina

> **Qué es.** El módulo que materializa las fichas de pase durante el servicio.
> Una ficha de pase es un snapshot de la receta en el momento de servirla —
> congela la versión de la receta para que el chef sepa EXACTAMENTE qué se
> estaba sirviendo durante ese servicio, incluso si la receta cambia después.
>
> **NO toma decisiones.** Solo registra. El chef/jefe revisan post-servicio.
>
> Código: `modules/pase-cocina/index.js` · v`1.0.0`

---

## 1 · LÓGICA

### Ficha de pase

Una ficha de pase es un snapshot operativo:

```jsonc
{
  "id": "ficha_abc123",
  "receta_id": "pizza_margarita",
  "version_receta": 3,           // versión congelada al crear la ficha
  "nombre": "Pizza Margarita",
  "servicio": "2026-07-28-cena",
  "estado": "activa",            // activa | cerrada
  "incidencias": [],              // registradas durante el servicio
  "sustituciones": [],           // cambios de emergencia
  "created_at": "2026-07-28T...",
  "created_by": "chef_01"
}
```

### Incidencias (8 tipos canónicos)

| Tipo | Descripción |
|------|-------------|
| `rotura_genero` | Se estropeó materia prima |
| `rotura_equipamiento` | Se rompió un equipo |
| `queja_cliente` | Cliente se quejó del plato |
| `falta_ingrediente` | No hay un ingrediente |
| `error_coccion` | Error en cocción |
| `tiempo_excedido` | Tiempo de servicio excedido |
| `alergia_no_declarada` | Alergia no declarada por el cliente |
| `otro` | Otro |

### Sustituciones

Registran cambios de emergencia de ingredientes:

```jsonc
{
  "ingrediente_original": "mozzarella",
  "ingrediente_sustituto": "cheddar",
  "motivo": "se acabó la mozzarella",
  "cantidad": 0.2,
  "unidad": "kg"
}
```

**NO modifican la receta canónica.** El chef decide post-servicio si incorpora
el cambio al recetario.

---

## 2 · TOOLS (invocables por LLM)

### `pase.ficha.crear`

```jsonc
{
  "project_id": "uuid",
  "receta_id": "pizza_margarita",
  "version_receta": 3,
  "nombre": "Pizza Margarita",
  "servicio": "2026-07-28-cena",
  "user_id": "chef_01"
}
// → 201 { "ficha": { "id": "ficha_abc123", "estado": "activa", ... } }
```

### `pase.incidencia.registrar`

```jsonc
{
  "project_id": "uuid",
  "ficha_pase_id": "ficha_abc123",
  "tipo": "falta_ingrediente",
  "descripcion": "No hay rúcula para la pizza",
  "severidad": "media"       // baja | media | alta | critica
}
// → 201 { "incidencia": { "id": "inc_001", "tipo": "falta_ingrediente", ... } }
```

### `pase.sustitucion.registrar`

```jsonc
{
  "project_id": "uuid",
  "ficha_pase_id": "ficha_abc123",
  "ingrediente_original": "mozzarella",
  "ingrediente_sustituto": "cheddar",
  "motivo": "se acabó la mozzarella",
  "cantidad": 0.2,
  "unidad": "kg"
}
// → 201 { "sustitucion": { "ingrediente_original": "mozzarella", ... } }
```

### `pase.ficha.obtener`

```jsonc
{ "project_id": "uuid", "ficha_pase_id": "ficha_abc123" }
// → 200 { "ficha": { /* completa con incidencias + sustituciones */ } }
```

### `pase.fichas.listar`

```jsonc
{ "project_id": "uuid", "servicio": "2026-07-28-cena", "estado": "activa" }
// → 200 { "fichas": [ /*...*/ ] }
```

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `pase.ficha.creada` | Ficha de pase materializada |
| `pase.incidencia.registrada` | Incidencia reportada durante el servicio |
| `pase.sustitucion.registrada` | Sustitución de emergencia registrada |

### Escucha

| Evento | Handler | Procedencia |
|--------|---------|-------------|
| `project.activated` | `onProjectActivated` | Cachea base_path |
| `project.get.response` | `onProjectGetResponse` | Resuelve path pendiente |
| `fs.read.response` | `onFsReadResponse` | Lectura pendiente |
| `fs.write.response` | `onFsWriteResponse` | Escritura pendiente |

---

## 4 · FLUJO TÍPICO

### Durante el servicio

```
1. CHEF materializa     → pase.ficha.crear { receta, version, servicio }
                          → ficha activa (snapshot congelado)
2. COCINA reporta       → "no hay mozzarella, usamos cheddar"
                          → pase.sustitucion.registrar { original, sustituto, motivo }
3. COCINA reporta       → "tiempo excedido en mesa 4"
                          → pase.incidencia.registrar { tipo, descripcion, severidad }
4. POST-SERVICIO        → chef revisa fichas del servicio
                          → decide si incorpora sustituciones al recetario
```

---

## 5 · INTEGRACIÓN

> **Tools:** `pase.ficha.crear` (materializar), `pase.incidencia.registrar`,
> `pase.sustitucion.registrar`, `pase.ficha.obtener` (consulta),
> `pase.fichas.listar` (consulta).

> **Snapshot operativo:** la ficha congela `version_receta`. Aunque la receta
> cambie, la ficha refleja lo que se sirvió en ese servicio.

> **No reactivo:** pase-cocina solo registra. No toma decisiones automáticas
> (no sugiere sustituciones, no cierra fichas). El chef decide post-servicio.

> **Persistencia:** `data/projects/<slug>/pase-cocina.json`.
