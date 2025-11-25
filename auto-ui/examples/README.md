# Auto-UI v2.0 - Examples

This directory contains complete, working examples showcasing different features of Auto-UI v2.0.

## 📚 Examples

### 1. Basic CRUD (`01-basic-crud.json`)

**Features:**
- Simple task management
- Auto-generated table with sorting, filtering, pagination
- CRUD operations (Create, Read, Update, Delete)
- Form validation
- Real-time updates via MQTT

**Use Case:** Perfect starting point for any simple data management module.

---

### 2. Complex Dashboard (`02-dashboard-complex.json`)

**Features:**
- Two-column layout
- Multiple widgets: stat-cards, charts, tables, activity feeds
- Data binding with `@compute` functions
- Permission-based access
- Tabbed interface
- Progress indicators

**Use Case:** Analytics dashboard, monitoring systems, admin panels.

**Demonstrates:**
- Layout engine (two-column, grid, tabs)
- Widget factory (stat-card, chart, table-advanced, activity-feed)
- Data resolver (`@compute`, `@api`, `@metrics`)
- Permissions system

---

### 3. Form Validation (`03-form-validation.json`)

**Features:**
- Comprehensive validation rules
- Async validation (username/email uniqueness)
- Custom validators (strong password, phone, etc.)
- Conditional validation
- Field dependencies
- Pattern matching
- Type checking

**Use Case:** User registration, profile editing, complex forms.

**Demonstrates:**
- All validator types
- Custom validators
- Async validators
- Conditional validation
- Error messages customization

---

## 🚀 How to Use

### 1. Copy Example to Modules

```bash
cp auto-ui/examples/01-basic-crud.json modules/tasks/module.json
```

### 2. Implement Handlers

Create the module handler file:

```javascript
// modules/tasks/index.js
class TasksModule {
  async handleList(req, res) {
    const tasks = await this.storage.getAllTasks();
    return { data: tasks };
  }

  async handleCreate(req, res) {
    const task = await this.storage.createTask(req.body);
    await this.eventBus.publish('task.created', task);
    return { data: task };
  }

  // ... other handlers
}
```

### 3. Access UI

Navigate to: `http://localhost:3001/auto-ui/tasks`

---

## 🎯 Learning Path

**Beginner:**
1. Start with `01-basic-crud.json`
2. Modify schema fields
3. Add/remove columns from table
4. Customize form fields

**Intermediate:**
5. Move to `02-dashboard-complex.json`
6. Add new widgets
7. Change layouts
8. Add data binding with `@compute`

**Advanced:**
9. Study `03-form-validation.json`
10. Create custom validators
11. Add permission rules
12. Build custom components

---

## 🔧 Customization Tips

### Adding a New Widget

```json
{
  "widget": "stat-card",
  "config": {
    "label": "Your Metric",
    "value": "@data.yourValue",
    "icon": "📊"
  }
}
```

### Changing Layout

```json
{
  "layout": "grid",  // or: two-column, tabs, accordion
  "config": {
    "columns": 3,
    "minWidth": "250px"
  }
}
```

### Adding Validation

```json
{
  "fieldName": {
    "type": "string",
    "required": true,
    "minLength": 3,
    "maxLength": 50,
    "pattern": "^[A-Z]",
    "custom": "yourValidator"
  }
}
```

### Adding Permissions

```json
{
  "views": {
    "main": {
      "permissions": ["admin", "user"]
    },
    "create": {
      "permissions": {
        "or": [
          "admin",
          { "custom": "isOwner" }
        ]
      }
    }
  }
}
```

---

## 🐛 Troubleshooting

### Module Not Showing in Dashboard

✅ Check: `"ui.enabled": true`
✅ Check: `"ui.version": "2.0"`
✅ Restart server after changes

### Validation Not Working

✅ Check: Schema has proper validation rules
✅ Check: `config.validation: true` in form view
✅ Check: Custom validators are registered

### Widgets Not Rendering

✅ Check: Widget name is correct
✅ Check: `dataSource` is valid
✅ Check: Data format matches widget expectations

### Permissions Blocking Access

✅ Check: User has required roles
✅ Check: Permission config is correct
✅ Use `autoUI.permissionSystem.check()` to debug

---

## 📖 More Resources

- **Architecture:** `/auto-ui/ARCHITECTURE.md`
- **Migration Guide:** `/auto-ui/MIGRATION_GUIDE.md`
- **API Reference:** See individual system docs

---

## 💡 Ideas for More Examples

Want to contribute? Here are ideas:

- E-commerce product catalog
- Blog/CMS interface
- Project management board (Kanban)
- Calendar/scheduling system
- File manager
- Real-time chat interface
- Settings panel with tabs
- Wizard/multi-step form

---

**Happy Building! 🚀**
