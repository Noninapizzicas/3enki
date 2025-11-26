# Auto-UI v2 Alignment Fixes

## Overview

This document summarizes the fixes applied to resolve incongruences between documentation, Plop templates, and the actual Auto-UI v2 implementation.

## Issues Fixed

### 🔴 CRITICAL #1: Layout Structure Incongruences

**Problem:** Three different and incompatible layout structures:
- Plop template: `layout: { type, left_width }`
- Modules: `left_column` / `right_column` with sections
- Engine expected: `left` / `right` or `columns[]`

**Solution:**
1. **Layout Engine** (`auto-ui/engine/layout-engine.js`):
   - Added support for `left_column.sections` / `right_column.sections`
   - Added support for `left_width` / `right_width` variants
   - Now supports all three structures for backward compatibility

2. **Composer** (`auto-ui/engine/composer.js`):
   - Added handling for `layout` as object with `type` property
   - Implemented `groupSectionsByColumn()` to handle sections with `column` property
   - Automatically converts dashboard sections to appropriate layout structure

3. **Plop Template** (`plop-templates/module/module.json.hbs`):
   - Updated to use clean `columns[]` array structure
   - Changed `layout` from object to string
   - Moved `header` outside of sections
   - Changed `mqtt_topic` (singular) to `mqtt_topics` (plural array)

**Example of new structure:**
```json
{
  "type": "dashboard",
  "layout": "two-column",
  "header": { "title": "...", "subtitle": "..." },
  "columns": [
    { "width": "65%", "sections": [...] },
    { "width": "35%", "sections": [...] }
  ]
}
```

### 🔴 HIGH #2: @context Data Source Missing

**Problem:** Documentation mentioned `@context.module.schema` but no data source was registered in the Resolver.

**Solution:**
- Implemented `@context` data source in `auto-ui/engine/index-v2.js`
- Now supports references like `@context.module.schema`, `@context.user.permissions`, etc.
- Uses `getNestedValue()` to traverse context object

**Example usage:**
```json
{
  "schema": "@context.module.schema",
  "user": "@context.user.name"
}
```

### 🟡 MEDIUM #3: @compute Syntax Inconsistency

**Problem:** Documentation used `:` syntax but modules used `.` syntax
- Docs: `@compute:sum(items.price)`
- Real: `@compute.sum(items.price)`

**Solution:**
- Standardized to use `.` (dot) notation everywhere
- Updated files:
  - `auto-ui/ARCHITECTURE.md`
  - `auto-ui/MIGRATION_GUIDE.md`
  - `auto-ui/engine/resolver.js` (comments)
  - `auto-ui/examples/02-dashboard-complex.json`
  - `auto-ui/examples/03-form-validation.json`

**Rationale:** Dot notation is consistent with `@data.field` and `@metrics.field`

### 🟡 MEDIUM #4: Widget Configuration Standards

**Problem:** Mixed use of `mqtt_topic` (singular) vs `mqtt_topics` (plural array)

**Solution:**
- Standardized Plop template to use `mqtt_topics` as array
- Maintains compatibility with existing modules that use singular

**Example:**
```json
{
  "mqtt_topics": ["module.updated", "module.created"]
}
```

## Files Modified

### Engine Files (4)
1. `auto-ui/engine/layout-engine.js` - Multi-structure layout support
2. `auto-ui/engine/composer.js` - Layout object handling and column grouping
3. `auto-ui/engine/index-v2.js` - @context data source
4. `auto-ui/engine/resolver.js` - Comment updates for @compute syntax

### Documentation Files (2)
1. `auto-ui/ARCHITECTURE.md` - @compute syntax correction
2. `auto-ui/MIGRATION_GUIDE.md` - @compute syntax correction

### Template Files (1)
1. `plop-templates/module/module.json.hbs` - Complete layout structure overhaul

### Example Files (2)
1. `auto-ui/examples/02-dashboard-complex.json` - @compute syntax correction
2. `auto-ui/examples/03-form-validation.json` - @compute syntax correction

## Compatibility

All changes maintain backward compatibility:
- Old module structures (credential-manager, dashboard) continue to work
- Layout Engine supports all structure variants
- Composer automatically adapts to different formats
- New modules generated with Plop use the cleanest structure

## Testing Recommendations

1. ✅ Test layout rendering with all three structure types
2. ✅ Verify @context references resolve correctly
3. ✅ Generate new module with Plop and verify structure
4. ✅ Check existing modules (credential-manager, dashboard) still render
5. ✅ Validate @compute functions with dot notation

## Status

✅ **ALL CRITICAL AND HIGH PRIORITY ISSUES RESOLVED**

- 🔴 Layout Structure → **FIXED** (supports all variants)
- 🔴 @context Data Source → **FIXED** (implemented)
- 🟡 @compute Syntax → **FIXED** (standardized to dot notation)
- 🟡 Widget Configuration → **FIXED** (standardized to arrays)

**Conclusion:** Auto-UI v2 templates and implementation are now fully aligned and consistent.
