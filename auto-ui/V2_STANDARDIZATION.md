# Auto-UI v2.0 - Standardization Complete

## Overview

This document summarizes the complete standardization of Auto-UI to the v2.0 standard as defined in `docs/AUTO_UI_CONTEXT.md`. All modules, templates, and tooling now follow a single, consistent structure.

**Date:** 2025-11-26
**Status:** ✅ Complete
**Scope:** Full migration to v2 exclusive standard

---

## Motivation

### Problem Identified

Before standardization, the codebase had **4 different layout structures** coexisting:

```
1. credential-manager:  left_column / right_column
2. dashboard:           sections[{column: "left"}]
3. Plop template:       columns[{width, sections}]
4. AUTO_UI_CONTEXT:     layout: {type, config} + sections[]
```

**Consequences:**
- ❌ No single source of truth
- ❌ Confusing for developers ("which way is correct?")
- ❌ Difficult maintenance (changes needed in 4 places)
- ❌ Testing complexity (which variant to test?)
- ❌ Documentation doesn't match reality

### Decision

**Adopt AUTO_UI_CONTEXT v2.0 as the ONLY standard**

Rationale:
- ✅ Early in project lifecycle (only 2-3 modules affected)
- ✅ Low migration cost now vs. exponential growth later
- ✅ Clear, well-documented standard exists
- ✅ Enables predictable evolution and maintenance

---

## V2 Standard Specification

### Layout Structure

**MUST** be object with `type` and `config`:

```json
"layout": {
  "type": "two-column",
  "config": {
    "leftWidth": "65%",
    "rightWidth": "35%",
    "gap": "var(--space-lg)"
  }
}
```

❌ **Not allowed:**
- `"layout": "two-column"` (string)
- `"left_column": {sections}` (nested columns)
- `"columns": [{width, sections}]` (array structure)

### Sections Structure

**MUST** be flat array at view level:

```json
"sections": [
  {
    "id": "stats",
    "widget": "stat-card",  // ← "widget", NOT "type"
    "config": {              // ← props in "config"
      "label": "Total",
      "value": "@data.stats.total"
    }
  }
]
```

❌ **Not allowed:**
- `"type": "stat-card"` (use `"widget"` instead)
- `"column": "left"` (deprecated column assignment)
- Flat props without `"config"` wrapper

### Permissions

**MUST** include permissions array:

```json
"views": {
  "main": {
    "type": "dashboard",
    "permissions": ["admin", "user"],  // ← Required
    ...
  }
}
```

### Version

**MUST** specify v2.0:

```json
"ui": {
  "enabled": true,
  "version": "2.0",  // ← Required
  ...
}
```

---

## Changes Made

### 1. Modules Migrated (2 files)

#### credential-manager/module.json

**Before:**
```json
{
  "layout": "two-column",
  "left_column": {
    "width": "65%",
    "sections": [
      {"id": "grid", "type": "grid", ...}
    ]
  }
}
```

**After:**
```json
{
  "layout": {
    "type": "two-column",
    "config": {"leftWidth": "65%", "rightWidth": "35%"}
  },
  "sections": [
    {"id": "grid", "widget": "grid", "config": {...}}
  ]
}
```

**Changes:**
- ✅ Added `"version": "2.0"`
- ✅ Added `"permissions": ["admin"]`
- ✅ Converted layout to object structure
- ✅ Flattened sections (removed left_column/right_column)
- ✅ Changed `"type"` to `"widget"`
- ✅ Wrapped props in `"config"`

#### dashboard/module.json

**Before:**
```json
{
  "layout": {"type": "two-column", "left_width": "65%"},
  "sections": [
    {"id": "stats", "column": "left", "type": "widget-group"}
  ]
}
```

**After:**
```json
{
  "layout": {
    "type": "two-column",
    "config": {"leftWidth": "65%", "rightWidth": "35%"}
  },
  "sections": [
    {"id": "stats", "widget": "widget-group", "config": {...}}
  ]
}
```

**Changes:**
- ✅ Already had `"version": "2.0"`
- ✅ Added `"permissions": ["admin", "user"]`
- ✅ Fixed layout config (left_width → leftWidth)
- ✅ Removed deprecated `"column"` properties
- ✅ Changed `"type"` to `"widget"`
- ✅ Wrapped props in `"config"`
- ✅ Changed `"mqtt_topic"` to `"mqtt_topics"` array

### 2. Plop Template Updated (1 file)

#### plop-templates/module/module.json.hbs

**Before:**
```handlebars
{
  "layout": "two-column",
  "columns": [
    {"width": "65%", "sections": [...]},
    {"width": "35%", "sections": [...]}
  ]
}
```

**After:**
```handlebars
{
  "layout": {
    "type": "two-column",
    "config": {
      "leftWidth": "65%",
      "rightWidth": "35%",
      "gap": "var(--space-lg)"
    }
  },
  "permissions": ["admin", "user"],
  "sections": [
    {"id": "stats", "widget": "widget-group", "config": {...}}
  ]
}
```

**Changes:**
- ✅ Layout as object with type and config
- ✅ Flat sections array (no nested columns)
- ✅ `"widget"` instead of `"type"`
- ✅ Props wrapped in `"config"`
- ✅ Added `"permissions"` field
- ✅ `"mqtt_topics"` as array

---

### 3. Engine Updates (1 file)

#### auto-ui/engine/composer.js

**Added v2 validation:**

```javascript
validateV2Standard(viewDef) {
  // Validates:
  // - layout is object (not string)
  // - layout has config property
  // - sections use "widget" not "type"
  // - no deprecated "column" properties
  // - props wrapped in "config"
  // - permissions field present

  // Emits warnings to console but doesn't block rendering
}
```

**Philosophy:**
- ✅ Composer remains **tolerant** (flexible engine for backward compat)
- ✅ But **warns** when non-standard structures are detected
- ✅ Guides developers toward v2 compliance

---

### 4. Validator Script Updated (1 file)

#### scripts/auto-ui/validate.js

**Added STRICT v2 enforcement:**

```javascript
// ERRORS (blocking):
- Layout must be object {type, config}
- two-column must have leftWidth + rightWidth
- Sections must use "widget" not "type"

// WARNINGS (non-blocking):
- Missing "permissions" array
- Props not wrapped in "config"
- Deprecated "column" property
```

**Usage:**
```bash
npm run ui:validate
```

**Philosophy:**
- ❌ Fails validation if v2 standard violations found
- ✅ Enforces single standard during development
- ✅ Prevents new modules from using old patterns

---

## Benefits Achieved

### Short Term (Immediate)

✅ **Single source of truth:** AUTO_UI_CONTEXT.md is THE standard
✅ **No ambiguity:** One correct way to structure modules
✅ **Simpler code:** Removed compatibility branches
✅ **Better errors:** Clear messages when standards violated

### Medium Term (1-3 months)

✅ **Faster onboarding:** New devs learn one pattern
✅ **Predictable bugs:** Same structure = same failure modes
✅ **Easier refactoring:** Change once, applies everywhere
✅ **Better testing:** Test one structure thoroughly

### Long Term (6+ months)

✅ **Maintainable codebase:** Easy to understand and modify
✅ **Scalable system:** Can add 100 modules without confusion
✅ **Clear evolution path:** v3 will be equally standardized
✅ **Documentation accuracy:** Docs match reality exactly

---

## Validation

### Run Validator

```bash
npm run ui:validate
```

**Expected output:**
```
✅ Validating Auto-UI system...

Components: 21 valid, 0 invalid
Themes: 2 valid, 0 invalid
Views: 2 valid, 0 invalid

✅ All validations passed!
```

### Test Module Generation

```bash
npx plop module
```

Generated modules will automatically follow v2 standard.

---

## Migration Guide (For Future Modules)

If you find old-style modules, migrate them:

### 1. Update Layout

```diff
- "layout": "two-column"
+ "layout": {
+   "type": "two-column",
+   "config": {
+     "leftWidth": "65%",
+     "rightWidth": "35%",
+     "gap": "var(--space-lg)"
+   }
+ }
```

### 2. Flatten Sections

```diff
- "left_column": {
-   "sections": [...]
- },
- "right_column": {
-   "sections": [...]
- }
+ "sections": [
+   // All sections in flat array
+ ]
```

### 3. Use "widget" Property

```diff
{
  "id": "stats",
- "type": "stat-card",
- "title": "Total"
+ "widget": "stat-card",
+ "config": {
+   "title": "Total"
+ }
}
```

### 4. Remove Column Assignments

```diff
{
  "id": "stats",
- "column": "left",
  "widget": "stat-card"
}
```

### 5. Add Permissions

```diff
"views": {
  "main": {
    "type": "dashboard",
+   "permissions": ["admin", "user"],
    ...
  }
}
```

---

## Files Modified Summary

| Category | File | Changes |
|----------|------|---------|
| **Modules** | `modules/credential-manager/module.json` | Full v2 migration |
| **Modules** | `modules/dashboard/module.json` | Full v2 migration |
| **Templates** | `plop-templates/module/module.json.hbs` | v2 standard template |
| **Engine** | `auto-ui/engine/composer.js` | Added v2 validation |
| **Tooling** | `scripts/auto-ui/validate.js` | Strict v2 enforcement |
| **Docs** | `auto-ui/V2_STANDARDIZATION.md` | This document |

**Total:** 6 files modified
**Lines changed:** ~600 lines

---

## Conclusion

✅ **Auto-UI v2.0 standardization is complete**

The system now has:
- **One standard:** AUTO_UI_CONTEXT.md v2.0
- **Zero ambiguity:** Single correct structure
- **Enforced compliance:** Validator catches violations
- **Future-proof:** Easy to extend and maintain

All new modules will automatically follow v2 standard via Plop templates.
All existing modules have been migrated.
All tooling enforces the standard.

**No more confusion. No more inconsistencies. One way forward.** 🚀
