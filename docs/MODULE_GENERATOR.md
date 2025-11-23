# 🔧 Generador de Módulos Event-Core

**Versión:** 1.0.0

Herramientas para automatizar la creación de módulos Event-Core completos.

---

## 📋 Opciones Disponibles

### 1. Plop (Interactivo)

Ideal para **usuarios humanos** que prefieren un wizard guiado.

```bash
# Opción A: npm script
npm run plop

# Opción B: npx directo
npx plop module

# Opción C: via create-module
npm run create-module:interactive
```

**Características:**
- Preguntas guiadas paso a paso
- Validación de inputs
- Mensajes de ayuda

---

### 2. Script CLI (Programático)

Ideal para **automatización, IAs y scripts**.

```bash
node scripts/create-module.js [opciones]
```

**Opciones:**

| Opción | Descripción | Ejemplo |
|--------|-------------|---------|
| `--name` | Nombre del módulo (requerido) | `--name=inventario` |
| `--description` | Descripción | `--description="Gestión de inventario"` |
| `--author` | Autor | `--author="Mi Equipo"` |
| `--ui` | Incluir UI/Dashboard | `--ui` |
| `--icon` | Emoji del icono | `--icon=🛒` |
| `--persistence` | Incluir persistencia JSON | `--persistence` |
| `--events` | Eventos a publicar | `--events="item.created,item.updated"` |
| `--subscriptions` | Eventos a escuchar | `--subscriptions="*.created,order.completed"` |
| `--apis` | APIs HTTP | `--apis="GET /items,POST /items"` |
| `--dry-run` | Vista previa sin crear | `--dry-run` |
| `--interactive` | Modo interactivo (plop) | `--interactive` |
| `--help` | Mostrar ayuda | `--help` |

---

## 🚀 Ejemplos de Uso

### Ejemplo 1: Módulo Básico

```bash
node scripts/create-module.js \
  --name=productos \
  --description="Gestión de productos"
```

**Genera:**
```
modules/productos/
├── index.js
├── module.json
├── README.md
└── schemas/
    ├── events.json
    └── productos.json
```

---

### Ejemplo 2: Módulo Completo

```bash
node scripts/create-module.js \
  --name=inventario \
  --description="Control de inventario en tiempo real" \
  --author="Equipo Desarrollo" \
  --ui \
  --icon=📦 \
  --persistence \
  --events="inventario.actualizado,inventario.alerta" \
  --subscriptions="producto.creado,producto.eliminado" \
  --apis="GET /items,POST /items,PUT /items/:id,DELETE /items/:id,GET /stats"
```

---

### Ejemplo 3: Dry Run (Vista Previa)

```bash
node scripts/create-module.js \
  --name=test-module \
  --ui \
  --persistence \
  --dry-run
```

**Output:**
```
🔍 DRY RUN - Archivos que se crearían:

📁 modules/test-module/
   ├── index.js
   ├── module.json
   ├── README.md
   ├── schemas/events.json
   └── schemas/test-module.json

📊 Configuración:
   Name: test-module
   UI: true
   Persistence: true
```

---

### Ejemplo 4: Modo Interactivo

```bash
npm run create-module:interactive
# o
node scripts/create-module.js --interactive
```

---

## 🤖 Uso con IA/Automatización

El script CLI está diseñado para ser usado programáticamente:

```javascript
const { execSync } = require('child_process');

// Crear módulo desde código
execSync(`node scripts/create-module.js \
  --name=mi-modulo \
  --description="Módulo creado automáticamente" \
  --ui \
  --apis="GET /data,POST /action"
`, { stdio: 'inherit' });
```

**Desde bash/shell:**

```bash
#!/bin/bash
# Script de automatización

MODULES=("pedidos" "clientes" "facturacion")

for module in "${MODULES[@]}"; do
  node scripts/create-module.js \
    --name=$module \
    --description="Módulo de $module" \
    --ui \
    --persistence
done
```

---

## 📁 Estructura de Templates

Los templates se encuentran en:

```
plop-templates/module/
├── index.js.hbs          # Código principal del módulo
├── module.json.hbs       # Configuración del módulo
├── README.md.hbs         # Documentación
└── schemas/
    ├── events.json.hbs   # Schemas de eventos
    └── main.json.hbs     # Schemas generales
```

### Personalizar Templates

1. Edita los archivos `.hbs` en `plop-templates/module/`
2. Usa sintaxis Handlebars para variables:
   - `{{name}}` - Nombre del módulo
   - `{{description}}` - Descripción
   - `{{#if ui}}...{{/if}}` - Condicionales
   - `{{#each apis}}...{{/each}}` - Loops

---

## 📊 Comparativa de Métodos

| Característica | Plop (Interactivo) | Script CLI |
|----------------|-------------------|------------|
| **Uso humano** | ✅ Ideal | ⚡ Rápido |
| **Automatización** | ❌ No | ✅ Ideal |
| **Validación** | ✅ Completa | ✅ Básica |
| **Preguntas guiadas** | ✅ Sí | ❌ No |
| **Dry-run** | ❌ No | ✅ Sí |
| **Ayuda integrada** | ✅ Contextual | ✅ --help |

---

## 🔧 Comandos npm Disponibles

```bash
# Plop directo
npm run plop

# Script CLI
npm run create-module -- --name=mi-modulo

# Modo interactivo
npm run create-module:interactive
```

---

## ⚠️ Notas Importantes

1. **Nombres en kebab-case:** `mi-modulo`, no `miModulo` o `MiModulo`
2. **No sobrescribe:** Si el módulo existe, se detiene con error
3. **APIs format:** `"METHOD /path"` (ej: `"GET /items"`, `"POST /items/:id"`)
4. **Eventos format:** `"dominio.accion"` (ej: `"producto.creado"`)

---

## 🐛 Troubleshooting

### Error: "El módulo ya existe"

```bash
# Verificar si existe
ls modules/mi-modulo/

# Eliminar si es necesario
rm -rf modules/mi-modulo/
```

### Error: "El nombre debe estar en kebab-case"

```bash
# ❌ Incorrecto
--name=MiModulo
--name=mi_modulo

# ✅ Correcto
--name=mi-modulo
```

---

## 📞 Soporte

- **Templates:** `plop-templates/module/`
- **Plopfile:** `plopfile.js`
- **Script CLI:** `scripts/create-module.js`
- **Módulo referencia:** `modules/metricas/`

---

**Versión:** 1.0.0
**Última actualización:** 2025-11-23
