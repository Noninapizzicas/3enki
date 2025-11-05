/**
 * TODO List Module
 *
 * Simple task management module with UI
 */

class TodoListModule {
  constructor() {
    this.core = null;
    this.logger = null;
    this.eventBus = null;

    // In-memory storage (replace with database in production)
    this.todos = [
      {
        id: '1',
        title: 'Implementar UI System',
        description: 'Crear sistema de interfaces gráficas para módulos',
        status: 'in_progress',
        priority: 'high',
        dueDate: '2025-11-10',
        tags: 'desarrollo, ui, importante',
        createdAt: new Date('2025-11-01').toISOString(),
        updatedAt: new Date('2025-11-04').toISOString()
      },
      {
        id: '2',
        title: 'Escribir documentación',
        description: 'Documentar el sistema de UI para desarrolladores',
        status: 'pending',
        priority: 'medium',
        dueDate: '2025-11-12',
        tags: 'documentación',
        createdAt: new Date('2025-11-02').toISOString(),
        updatedAt: new Date('2025-11-02').toISOString()
      },
      {
        id: '3',
        title: 'Testear sistema completo',
        description: 'Realizar pruebas end-to-end del sistema UI',
        status: 'pending',
        priority: 'high',
        dueDate: '2025-11-08',
        tags: 'testing, qa',
        createdAt: new Date('2025-11-03').toISOString(),
        updatedAt: new Date('2025-11-03').toISOString()
      }
    ];

    this.nextId = 4;
  }

  /**
   * Lifecycle: onLoad
   * Se ejecuta cuando el módulo es cargado
   */
  async onLoad(core) {
    this.core = core;
    this.logger = core.logger;
    this.eventBus = core.eventBus;

    if (this.logger) {
      this.logger.info('todo-list.initialized', {
        module: 'todo-list',
        version: '1.0.0',
        todos_count: this.todos.length
      });
    }
  }

  /**
   * GET /todos - List all todos
   */
  async handleListTodos({ query }) {
    const { status, priority, limit } = query;

    let filtered = [...this.todos];

    // Apply filters
    if (status) {
      filtered = filtered.filter(t => t.status === status);
    }

    if (priority) {
      filtered = filtered.filter(t => t.priority === priority);
    }

    // Apply limit
    if (limit) {
      filtered = filtered.slice(0, parseInt(limit));
    }

    this.logger.debug('todo-list.list', {
      count: filtered.length,
      filters: { status, priority, limit }
    });

    return {
      todos: filtered,
      total: filtered.length
    };
  }

  /**
   * GET /todos/:id - Get a single todo
   */
  async handleGetTodo({ params }) {
    const { id } = params;

    const todo = this.todos.find(t => t.id === id);

    if (!todo) {
      throw new Error(`Todo ${id} not found`);
    }

    this.logger.debug('todo-list.get', { id });

    return todo;
  }

  /**
   * POST /todos - Create a new todo
   */
  async handleCreateTodo({ body }) {
    const todo = {
      id: String(this.nextId++),
      title: body.title,
      description: body.description || '',
      status: body.status || 'pending',
      priority: body.priority || 'medium',
      dueDate: body.dueDate || null,
      tags: body.tags || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.todos.push(todo);

    this.logger.info('todo-list.created', { id: todo.id, title: todo.title });

    // Publish event
    if (this.eventBus) {
      await this.eventBus.publish('todo.created', {
        todoId: todo.id,
        title: todo.title
      });
    }

    return {
      success: true,
      todo,
      message: 'Tarea creada exitosamente'
    };
  }

  /**
   * PUT /todos/:id - Update a todo
   */
  async handleUpdateTodo({ params, body }) {
    const { id } = params;

    const index = this.todos.findIndex(t => t.id === id);

    if (index === -1) {
      throw new Error(`Todo ${id} not found`);
    }

    const oldStatus = this.todos[index].status;

    // Update todo
    this.todos[index] = {
      ...this.todos[index],
      ...body,
      id, // Prevent ID change
      updatedAt: new Date().toISOString()
    };

    this.logger.info('todo-list.updated', { id, title: this.todos[index].title });

    // Publish event if status changed
    if (this.eventBus && body.status && body.status !== oldStatus) {
      await this.eventBus.publish('todo.status_changed', {
        todoId: id,
        oldStatus,
        newStatus: body.status
      });

      if (body.status === 'completed') {
        await this.eventBus.publish('todo.completed', {
          todoId: id,
          title: this.todos[index].title
        });
      }
    }

    return {
      success: true,
      todo: this.todos[index],
      message: 'Tarea actualizada exitosamente'
    };
  }

  /**
   * DELETE /todos/:id - Delete a todo
   */
  async handleDeleteTodo({ params }) {
    const { id } = params;

    const index = this.todos.findIndex(t => t.id === id);

    if (index === -1) {
      throw new Error(`Todo ${id} not found`);
    }

    const todo = this.todos[index];
    this.todos.splice(index, 1);

    this.logger.info('todo-list.deleted', { id, title: todo.title });

    // Publish event
    if (this.eventBus) {
      await this.eventBus.publish('todo.deleted', {
        todoId: id,
        title: todo.title
      });
    }

    return {
      success: true,
      message: 'Tarea eliminada exitosamente'
    };
  }

  /**
   * GET /stats/total - Get total count
   */
  async handleGetStatsTotal() {
    return {
      value: this.todos.length,
      label: 'Total'
    };
  }

  /**
   * GET /stats/pending - Get pending count
   */
  async handleGetStatsPending() {
    const count = this.todos.filter(t => t.status === 'pending').length;
    return {
      value: count,
      label: 'Pendientes'
    };
  }

  /**
   * GET /stats/completed - Get completed count
   */
  async handleGetStatsCompleted() {
    const count = this.todos.filter(t => t.status === 'completed').length;
    return {
      value: count,
      label: 'Completadas',
      change: 12 // Example: 12% increase
    };
  }

  /**
   * Cleanup when module is unloaded
   */
  async cleanup() {
    this.logger.info('todo-list.cleanup');
  }
}

module.exports = TodoListModule;
