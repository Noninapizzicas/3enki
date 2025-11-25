/**
 * Auto-UI Permission System v2.0
 *
 * Sistema de control de acceso granular para UIs
 */

class PermissionSystem {
  constructor(options = {}) {
    this.logger = options.logger || console;

    // Current user context
    this.currentUser = null;

    // Permission cache
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 300000; // 5 min

    // Permission resolvers
    this.resolvers = new Map();

    // Register built-in resolvers
    this.registerBuiltInResolvers();
  }

  // ==========================================
  // User Context
  // ==========================================

  /**
   * Establece el usuario actual
   */
  setUser(user) {
    this.currentUser = user;
    this.clearCache();
    this.logger.info(`[PermissionSystem] User set:`, user?.id || user?.username);
  }

  /**
   * Obtiene el usuario actual
   */
  getUser() {
    return this.currentUser;
  }

  /**
   * Obtiene roles del usuario
   */
  getUserRoles() {
    if (!this.currentUser) return [];

    if (Array.isArray(this.currentUser.roles)) {
      return this.currentUser.roles;
    }

    if (this.currentUser.role) {
      return [this.currentUser.role];
    }

    return [];
  }

  // ==========================================
  // Permission Checking
  // ==========================================

  /**
   * Verifica si el usuario tiene permiso
   *
   * @param {string|Object} permission - Permiso a verificar
   * @param {Object} context - Contexto adicional
   * @returns {Promise<boolean>}
   */
  async check(permission, context = {}) {
    if (!this.currentUser) {
      this.logger.warn('[PermissionSystem] No user set');
      return false;
    }

    try {
      // Si es string simple, verificar roles
      if (typeof permission === 'string') {
        return this.checkRole(permission);
      }

      // Si es array de roles
      if (Array.isArray(permission)) {
        return this.checkRoles(permission);
      }

      // Si es objeto con configuración compleja
      if (typeof permission === 'object') {
        return await this.checkComplex(permission, context);
      }

      return false;

    } catch (error) {
      this.logger.error('[PermissionSystem] Check error:', error);
      return false;
    }
  }

  /**
   * Verifica un rol específico
   */
  checkRole(role) {
    const userRoles = this.getUserRoles();
    return userRoles.includes(role);
  }

  /**
   * Verifica múltiples roles (OR)
   */
  checkRoles(roles) {
    const userRoles = this.getUserRoles();
    return roles.some(role => userRoles.includes(role));
  }

  /**
   * Verifica permiso complejo
   */
  async checkComplex(permission, context) {
    // Operador AND
    if (permission.and) {
      const checks = await Promise.all(
        permission.and.map(p => this.check(p, context))
      );
      return checks.every(result => result === true);
    }

    // Operador OR
    if (permission.or) {
      const checks = await Promise.all(
        permission.or.map(p => this.check(p, context))
      );
      return checks.some(result => result === true);
    }

    // Operador NOT
    if (permission.not) {
      const result = await this.check(permission.not, context);
      return !result;
    }

    // Custom resolver
    if (permission.custom) {
      const resolver = this.resolvers.get(permission.custom);
      if (resolver) {
        return await resolver(this.currentUser, permission, context);
      }
    }

    // Field-level permission
    if (permission.field) {
      return this.checkFieldPermission(permission.field, permission.action, context);
    }

    // Row-level permission (ownership)
    if (permission.ownership) {
      return this.checkOwnership(permission.ownership, context);
    }

    return false;
  }

  /**
   * Verifica permiso a nivel de campo
   */
  checkFieldPermission(field, action, context) {
    if (!context.fieldPermissions) return true;

    const fieldPerms = context.fieldPermissions[field];
    if (!fieldPerms) return true;

    const allowedRoles = fieldPerms[action];
    if (!allowedRoles) return true;

    return this.checkRoles(allowedRoles);
  }

  /**
   * Verifica ownership (el usuario es dueño del recurso)
   */
  checkOwnership(config, context) {
    if (!context.data) return false;

    const userIdField = config.userIdField || 'userId';
    const resourceUserId = context.data[userIdField];

    if (!resourceUserId) return false;

    return resourceUserId === this.currentUser?.id;
  }

  /**
   * Verifica múltiples permisos
   */
  async checkAll(permissions, context = {}) {
    const results = {};

    for (const [key, permission] of Object.entries(permissions)) {
      results[key] = await this.check(permission, context);
    }

    return results;
  }

  // ==========================================
  // UI Filtering
  // ==========================================

  /**
   * Filtra elementos de UI según permisos
   */
  async filterUI(elements, context = {}) {
    if (!Array.isArray(elements)) return elements;

    const filtered = [];

    for (const element of elements) {
      // Si no tiene permisos definidos, incluir
      if (!element.permissions && !element.permission) {
        filtered.push(element);
        continue;
      }

      // Verificar permiso
      const permission = element.permissions || element.permission;
      const hasPermission = await this.check(permission, context);

      if (hasPermission) {
        filtered.push(element);
      }
    }

    return filtered;
  }

  /**
   * Filtra campos de formulario según permisos
   */
  async filterFields(fields, action, context = {}) {
    if (!Array.isArray(fields)) return fields;

    const filtered = [];

    for (const field of fields) {
      // Si no tiene permisos, incluir
      if (!field.permissions) {
        filtered.push(field);
        continue;
      }

      // Verificar permiso para la acción
      const permission = field.permissions[action];
      if (!permission) {
        filtered.push(field);
        continue;
      }

      const hasPermission = await this.check(permission, context);
      if (hasPermission) {
        filtered.push(field);
      }
    }

    return filtered;
  }

  /**
   * Filtra acciones según permisos
   */
  async filterActions(actions, context = {}) {
    const filtered = {};

    for (const [key, action] of Object.entries(actions)) {
      if (!action.permission) {
        filtered[key] = action;
        continue;
      }

      const hasPermission = await this.check(action.permission, context);
      if (hasPermission) {
        filtered[key] = action;
      }
    }

    return filtered;
  }

  // ==========================================
  // Permission Resolvers
  // ==========================================

  /**
   * Registra un resolver personalizado
   */
  registerResolver(name, resolver) {
    if (typeof resolver !== 'function') {
      throw new Error('Resolver must be a function');
    }

    this.resolvers.set(name, resolver);
    this.logger.info(`[PermissionSystem] Registered resolver: ${name}`);

    return this;
  }

  /**
   * Registra resolvers built-in
   */
  registerBuiltInResolvers() {
    // Admin check
    this.registerResolver('isAdmin', (user) => {
      const roles = Array.isArray(user.roles) ? user.roles : [user.role];
      return roles.includes('admin') || roles.includes('administrator');
    });

    // Owner check
    this.registerResolver('isOwner', (user, permission, context) => {
      if (!context.data) return false;
      const userIdField = permission.userIdField || 'userId';
      return context.data[userIdField] === user.id;
    });

    // Creator check
    this.registerResolver('isCreator', (user, permission, context) => {
      if (!context.data) return false;
      const creatorField = permission.creatorField || 'createdBy';
      return context.data[creatorField] === user.id;
    });

    // Authenticated
    this.registerResolver('isAuthenticated', (user) => {
      return user && user.id;
    });

    // Has any role
    this.registerResolver('hasAnyRole', (user, permission) => {
      const userRoles = Array.isArray(user.roles) ? user.roles : [user.role];
      const requiredRoles = permission.roles || [];
      return requiredRoles.some(role => userRoles.includes(role));
    });

    // Has all roles
    this.registerResolver('hasAllRoles', (user, permission) => {
      const userRoles = Array.isArray(user.roles) ? user.roles : [user.role];
      const requiredRoles = permission.roles || [];
      return requiredRoles.every(role => userRoles.includes(role));
    });

    // Time-based permission
    this.registerResolver('timeWindow', (user, permission) => {
      const now = new Date();
      const start = permission.start ? new Date(permission.start) : null;
      const end = permission.end ? new Date(permission.end) : null;

      if (start && now < start) return false;
      if (end && now > end) return false;

      return true;
    });

    // IP-based permission
    this.registerResolver('ipWhitelist', (user, permission, context) => {
      if (!context.ip) return false;
      const whitelist = permission.whitelist || [];
      return whitelist.includes(context.ip);
    });
  }

  // ==========================================
  // Permission Decorators
  // ==========================================

  /**
   * Agrega información de permisos a un objeto
   */
  async decorateWithPermissions(obj, permissionConfig, context = {}) {
    if (!obj || typeof obj !== 'object') return obj;

    const permissions = {};

    for (const [action, permission] of Object.entries(permissionConfig)) {
      permissions[action] = await this.check(permission, context);
    }

    return {
      ...obj,
      _permissions: permissions
    };
  }

  /**
   * Decora múltiples objetos
   */
  async decorateManyWithPermissions(objects, permissionConfig, context = {}) {
    if (!Array.isArray(objects)) return objects;

    return await Promise.all(
      objects.map(obj => this.decorateWithPermissions(obj, permissionConfig, {
        ...context,
        data: obj
      }))
    );
  }

  // ==========================================
  // Caching
  // ==========================================

  /**
   * Obtiene del cache
   */
  getCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.value;
  }

  /**
   * Guarda en cache
   */
  setCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Limpia cache
   */
  clearCache() {
    this.cache.clear();
    this.logger.info('[PermissionSystem] Cache cleared');
  }

  // ==========================================
  // Audit Logging
  // ==========================================

  /**
   * Registra un intento de acceso
   */
  logAccess(permission, granted, context = {}) {
    if (!this.logger.audit) return;

    this.logger.audit({
      type: 'permission_check',
      user: this.currentUser?.id,
      permission,
      granted,
      context,
      timestamp: new Date().toISOString()
    });
  }

  // ==========================================
  // Utilities
  // ==========================================

  /**
   * Obtiene estadísticas
   */
  getStats() {
    return {
      resolvers: this.resolvers.size,
      cacheSize: this.cache.size,
      currentUser: this.currentUser?.id || null
    };
  }

  /**
   * Verifica si el usuario es admin
   */
  isAdmin() {
    return this.checkRole('admin');
  }

  /**
   * Verifica si el usuario está autenticado
   */
  isAuthenticated() {
    return !!this.currentUser;
  }
}

module.exports = PermissionSystem;
