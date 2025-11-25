# Auto-UI v2.0 - Migration Guide

## 🚀 Overview

Auto-UI v2.0 is a complete rewrite of the Auto-UI system with powerful new features while maintaining backward compatibility with v1.x.

### What's New in v2.0

✅ **Component System** - Declarative, reusable components
✅ **Layout Engine** - Complex layouts (grid, columns, tabs, accordion)
✅ **Widget Factory** - Rich widgets (stats, charts, tables, activity feeds)
✅ **Resolver** - Dynamic data binding (`@data`, `@metrics`, `@compute`)
✅ **Validator** - Advanced form validation
✅ **Permission System** - Granular access control
✅ **Composer** - Intelligent view composition

---

## 📦 Installation

### Option 1: Use v2 Engine (Recommended for new modules)

```javascript
// In core/gateway/http.js
const AutoUI = require('../../auto-ui/engine/index-v2');

this.autoUI = new AutoUI({
  modulesPath: this.moduleLoader.modulesPath,
  eventBus: this.eventBus,
  logger: this.logger,
  config: {
    enablePermissions: true,
    enableValidation: true,
    enableCaching: true
  }
});
```

### Option 2: Keep v1 Engine (For existing modules)

```javascript
// Keep using the original
const AutoUI = require('../../auto-ui/engine');
```

---

## 🔄 Backward Compatibility

**Good news:** v2 is 100% backward compatible with v1 module definitions!

- All v1 modules will continue to work
- v1 features (basic CRUD, tables, forms) still work
- You can migrate modules gradually

---

## 🆕 Using v2 Features

### 1. Enhanced Module Definition

```json
{
  "name": "my-module",
  "version": "2.0.0",

  "ui": {
    "enabled": true,
    "version": "2.0",
    "title": "My Module",
    "icon": "📦",

    "views": {
      "main": {
        "type": "dashboard",
        "layout": "two-column",

        "permissions": ["admin", "user"],

        "header": {
          "component": "page-header",
          "props": {
            "title": "My Dashboard",
            "subtitle": "@data.user.name",
            "actions": [
              {
                "label": "Create",
                "icon": "➕",
                "variant": "primary",
                "hxGet": "/auto-ui/my-module/form",
                "hxTarget": "#modal-container"
              }
            ]
          }
        },

        "columns": [
          {
            "width": "65%",
            "sections": [
              {
                "widget": "table-advanced",
                "config": {
                  "dataSource": "@api:/modules/my-module/items",
                  "columns": [
                    { "key": "name", "label": "Name", "sortable": true },
                    { "key": "status", "label": "Status", "type": "enum" }
                  ],
                  "sortable": true,
                  "filterable": true,
                  "pagination": true
                }
              }
            ]
          },
          {
            "width": "35%",
            "sections": [
              {
                "widget": "stat-card",
                "config": {
                  "label": "Total Items",
                  "value": "@compute:count(data.items)",
                  "icon": "📊",
                  "color": "var(--primary)"
                }
              },
              {
                "widget": "activity-feed",
                "config": {
                  "dataSource": "@api:/modules/my-module/activity",
                  "limit": 10
                }
              }
            ]
          }
        ]
      },

      "create": {
        "type": "form",
        "mode": "create",
        "permissions": ["admin"],
        "schema": "@context.module.schema",
        "config": {
          "endpoint": "/modules/my-module/items",
          "method": "POST",
          "validation": true
        }
      }
    }
  },

  "schema": {
    "name": {
      "type": "string",
      "label": "Name",
      "required": true,
      "minLength": 3,
      "maxLength": 100
    },
    "email": {
      "type": "email",
      "label": "Email",
      "required": true
    },
    "status": {
      "type": "enum",
      "enum": ["active", "inactive"],
      "required": true
    }
  }
}
```

### 2. Data Binding with Resolver

```json
{
  "value": "@data.user.name",           // From context data
  "value": "@metrics.total",            // From metrics
  "value": "@env.API_URL",              // Environment variable
  "value": "@compute:sum(items.price)", // Computed value
  "value": "@api:/modules/foo/count"    // API call
}
```

### 3. Custom Widgets

```json
{
  "ui": {
    "views": {
      "main": {
        "sections": [
          {
            "widget": "stat-card",
            "config": {
              "label": "Revenue",
              "value": "@compute:sum(sales.amount)",
              "change": "+12.5",
              "trend": "up",
              "icon": "💰"
            }
          },
          {
            "widget": "progress-bar",
            "config": {
              "label": "Completion",
              "value": "@compute:percent(completed, total)",
              "max": 100,
              "color": "var(--success)"
            }
          }
        ]
      }
    }
  }
}
```

### 4. Advanced Layouts

```json
{
  "ui": {
    "views": {
      "main": {
        "type": "dashboard",
        "layout": "tabs",
        "tabs": [
          {
            "label": "Overview",
            "icon": "📊",
            "sections": [...]
          },
          {
            "label": "Details",
            "icon": "📋",
            "sections": [...]
          }
        ]
      }
    }
  }
}
```

**Available Layouts:**
- `single` - Single column
- `two-column` - Two columns with custom widths
- `three-column` - Three columns
- `grid` - Responsive grid
- `sidebar-left` - Sidebar on left
- `sidebar-right` - Sidebar on right
- `flex` - Flexible layout
- `stack` - Vertical stack
- `tabs` - Tabbed interface
- `accordion` - Accordion/collapsible sections

### 5. Permissions

```json
{
  "ui": {
    "views": {
      "main": {
        "permissions": ["admin", "manager"]
      },
      "create": {
        "permissions": {
          "or": [
            "admin",
            { "custom": "isOwner" }
          ]
        }
      }
    },
    "permissions": {
      "view": ["admin", "user"],
      "create": ["admin"],
      "edit": ["admin", "owner"],
      "delete": ["admin"]
    }
  }
}
```

### 6. Validation

```json
{
  "schema": {
    "email": {
      "type": "email",
      "required": true,
      "email": true
    },
    "password": {
      "type": "string",
      "required": true,
      "custom": "strongPassword"
    },
    "confirm_password": {
      "type": "string",
      "required": true,
      "match": "password"
    },
    "age": {
      "type": "number",
      "min": 18,
      "max": 120
    },
    "website": {
      "type": "url",
      "url": true
    }
  }
}
```

---

## 🔧 Custom Components

### Register Custom Component

```javascript
// In module initialization
autoUI.componentSystem.register('custom-widget', {
  metadata: {
    type: 'custom',
    category: 'widgets'
  },

  defaults: {
    variant: 'primary'
  },

  render: (props, context) => {
    return `
      <div class="custom-widget">
        <h3>${props.title}</h3>
        <div>${props.content}</div>
      </div>
    `;
  },

  validate: (props) => {
    if (!props.title) {
      return { valid: false, errors: ['Title is required'] };
    }
    return { valid: true, errors: [] };
  }
});
```

### Use Custom Component

```json
{
  "ui": {
    "views": {
      "main": {
        "sections": [
          {
            "component": "custom-widget",
            "props": {
              "title": "My Widget",
              "content": "Hello World"
            }
          }
        ]
      }
    }
  }
}
```

---

## 📊 Custom Widgets

### Built-in Widgets

- `stat-card` - Metric with icon, value, change indicator
- `progress-bar` - Progress indicator
- `table-advanced` - Table with sorting, filtering, pagination
- `list` - Simple list
- `activity-feed` - Activity timeline
- `chart` - Chart placeholder (Chart.js integration)
- `badge` - Badge/pill
- `alert` - Alert message
- `empty-state` - Empty state placeholder

### Register Custom Widget

```javascript
autoUI.widgetFactory.register('revenue-chart', {
  render: async (data, config, context) => {
    // data: widget data
    // config: widget configuration
    // context: rendering context

    return `
      <div class="revenue-chart">
        <!-- Custom widget HTML -->
      </div>
    `;
  }
});
```

---

## 🔐 Permission System

### Set Current User

```javascript
// In middleware or auth handler
autoUI.permissionSystem.setUser({
  id: 'user-123',
  username: 'john',
  roles: ['admin', 'manager']
});
```

### Check Permissions Programmatically

```javascript
const hasPermission = await autoUI.permissionSystem.check('admin', context);

const permissions = await autoUI.permissionSystem.checkAll({
  canView: 'user',
  canEdit: 'admin',
  canDelete: { custom: 'isOwner' }
}, context);
```

### Custom Permission Resolver

```javascript
autoUI.permissionSystem.registerResolver('canEditOwnPosts', (user, permission, context) => {
  if (!context.data) return false;
  return context.data.authorId === user.id;
});
```

---

## ✅ Validation System

### Custom Validators

```javascript
autoUI.validator.register('apiKey', (value) => {
  if (!/^sk-[A-Za-z0-9]{48}$/.test(value)) {
    return 'Invalid API key format';
  }
  return true;
});
```

### Async Validators

```javascript
autoUI.validator.registerAsync('uniqueEmail', async (value) => {
  const exists = await checkEmailExists(value);
  if (exists) {
    return 'Email already in use';
  }
  return true;
});
```

---

## 🎨 Theming

### Custom Theme

Create `/auto-ui/config/themes/my-theme.json`:

```json
{
  "name": "my-theme",
  "extends": "event-core-dark",
  "colors": {
    "primary": "#FF6B6B",
    "success": "#51CF66"
  }
}
```

### Switch Theme

```javascript
autoUI.loader.setTheme('my-theme');
```

---

## 📈 Performance

### Caching

```javascript
const autoUI = new AutoUI({
  config: {
    enableCaching: true,
    componentCacheSize: 200,
    resolverCacheTTL: 60000,      // 60 seconds
    permissionCacheTTL: 300000    // 5 minutes
  }
});
```

### Clear Cache

```javascript
autoUI.componentSystem.clearCache();
autoUI.resolver.clearCache();
autoUI.permissionSystem.clearCache();
```

---

## 🐛 Debugging

### Enable Debug Logging

```javascript
const autoUI = new AutoUI({
  logger: {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.debug  // Enable debug logs
  }
});
```

### Get Stats

```javascript
const stats = autoUI.getStats();
console.log(stats);
```

---

## 📚 Examples

See `/auto-ui/examples/` for complete working examples:

- `basic-crud.json` - Simple CRUD module
- `dashboard-complex.json` - Complex dashboard with widgets
- `form-validation.json` - Advanced form validation
- `permissions.json` - Permission-controlled UI
- `custom-components.json` - Custom components

---

## 🔄 Migration Checklist

- [ ] Update module.json to v2 format
- [ ] Add `"version": "2.0"` to `ui` section
- [ ] Define `views` instead of relying on defaults
- [ ] Add `permissions` if needed
- [ ] Add validation rules to schema
- [ ] Test with v2 engine
- [ ] Update documentation
- [ ] Train team on new features

---

## 🆘 Getting Help

- Documentation: `/auto-ui/ARCHITECTURE.md`
- Examples: `/auto-ui/examples/`
- Issues: Report at GitHub issues

---

**Version:** 2.0.0
**Last Updated:** 2025-11-25
