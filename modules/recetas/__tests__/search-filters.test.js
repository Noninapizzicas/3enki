/**
 * Unit Tests - Search Filters
 *
 * Tests para construcción de SQL y validación de criterios
 */

const SearchFilters = require('../search-filters');
const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

describe('SearchFilters', () => {
  let filters;

  beforeEach(() => {
    filters = new SearchFilters(logger);
  });

  // ==========================================
  // SQL BUILDING
  // ==========================================

  describe('buildFilterSQL', () => {
    test('retorna sql y params como objeto', () => {
      const result = filters.buildFilterSQL('proj_123', {});
      expect(result).toHaveProperty('sql');
      expect(result).toHaveProperty('params');
      expect(Array.isArray(result.params)).toBe(true);
    });

    test('incluye proyecto_id en condición', () => {
      const result = filters.buildFilterSQL('proj_123', {});
      expect(result.sql).toContain('proyecto_id');
      expect(result.params[0]).toBe('proj_123');
    });

    test('filtra por nombre', () => {
      const result = filters.buildFilterSQL('proj_123', { nombre: 'pasta' });
      expect(result.sql).toContain('nombre_lower LIKE');
      expect(result.params).toContain('%pasta%');
    });

    test('filtra por ingredientes (AND logic)', () => {
      const result = filters.buildFilterSQL('proj_123', {
        ingredientes: ['tomate', 'ajo']
      });
      const whereCount = (result.sql.match(/AND ingredientes_nombres LIKE/g) || []).length;
      expect(whereCount).toBe(2);
    });

    test('filtra por ingredientes a excluir', () => {
      const result = filters.buildFilterSQL('proj_123', {
        ingredientes_excluir: ['carne']
      });
      expect(result.sql).toContain('NOT LIKE');
    });

    test('filtra rango de dificultad', () => {
      const result = filters.buildFilterSQL('proj_123', {
        dificultad_min: 5,
        dificultad_max: 8
      });
      expect(result.sql).toContain('dificultad_max >= ?');
      expect(result.sql).toContain('dificultad_min <= ?');
      expect(result.params).toContain(5);
      expect(result.params).toContain(8);
    });

    test('filtra rango de tiempo', () => {
      const result = filters.buildFilterSQL('proj_123', {
        tiempo_min: 15,
        tiempo_max: 30
      });
      expect(result.sql).toContain('tiempo_prep');
      expect(result.params).toContain(15);
      expect(result.params).toContain(30);
    });

    test('filtra rango de coste', () => {
      const result = filters.buildFilterSQL('proj_123', {
        coste_min: 5,
        coste_max: 20
      });
      expect(result.sql).toContain('coste_porcion');
      expect(result.params).toContain(5);
      expect(result.params).toContain(20);
    });

    test('filtra por viabilidad exacta', () => {
      const result = filters.buildFilterSQL('proj_123', { viabilidad: 'alta' });
      expect(result.sql).toContain('viabilidad = ?');
      expect(result.params).toContain('alta');
    });

    test('filtra por características', () => {
      const result = filters.buildFilterSQL('proj_123', {
        caracteristicas: ['vegetariano', 'sin_gluten']
      });
      const count = (result.sql.match(/caracteristicas LIKE/g) || []).length;
      expect(count).toBe(2);
    });

    test('filtra por alérgenos a excluir', () => {
      const result = filters.buildFilterSQL('proj_123', {
        alerge nos_excluir: ['gluten', 'lactosa']
      });
      const count = (result.sql.match(/alerge nos NOT LIKE/g) || []).length;
      expect(count).toBe(2);
    });
  });

  // ==========================================
  // ORDER SQL BUILDING
  // ==========================================

  describe('buildOrderSQL', () => {
    test('ordena por updated_at DESC por defecto', () => {
      const order = filters.buildOrderSQL();
      expect(order).toContain('updated_at');
      expect(order).toContain('DESC');
    });

    test('ordena por nombre', () => {
      const order = filters.buildOrderSQL('nombre', 'asc');
      expect(order).toContain('nombre_lower');
      expect(order).toContain('ASC');
    });

    test('ordena por dificultad', () => {
      const order = filters.buildOrderSQL('dificultad', 'desc');
      expect(order).toContain('dificultad_min');
      expect(order).toContain('DESC');
    });

    test('ordena por tiempo', () => {
      const order = filters.buildOrderSQL('tiempo', 'asc');
      expect(order).toContain('tiempo_prep');
      expect(order).toContain('ASC');
    });

    test('ordena por coste', () => {
      const order = filters.buildOrderSQL('coste', 'desc');
      expect(order).toContain('coste_porcion');
      expect(order).toContain('DESC');
    });

    test('campo inválido usa updated_at', () => {
      const order = filters.buildOrderSQL('invalid_field', 'asc');
      expect(order).toContain('updated_at');
    });

    test('order descendente por defecto', () => {
      const order = filters.buildOrderSQL('nombre', 'invalid');
      expect(order).toContain('DESC');
    });
  });

  // ==========================================
  // CRITERIA VALIDATION
  // ==========================================

  describe('validateCriteria', () => {
    test('criterios válidos pasan validación', () => {
      const validation = filters.validateCriteria({
        nombre: 'pasta',
        dificultad_min: 3,
        dificultad_max: 7
      });
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('dificultad_min < 1 es inválida', () => {
      const validation = filters.validateCriteria({ dificultad_min: 0 });
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    test('dificultad_max > 10 es inválida', () => {
      const validation = filters.validateCriteria({ dificultad_max: 11 });
      expect(validation.valid).toBe(false);
    });

    test('dificultad_min > dificultad_max es inválida', () => {
      const validation = filters.validateCriteria({
        dificultad_min: 8,
        dificultad_max: 5
      });
      expect(validation.valid).toBe(false);
    });

    test('tiempo_min negativo es inválido', () => {
      const validation = filters.validateCriteria({ tiempo_min: -1 });
      expect(validation.valid).toBe(false);
    });

    test('coste_min negativo es inválido', () => {
      const validation = filters.validateCriteria({ coste_min: -5 });
      expect(validation.valid).toBe(false);
    });

    test('coste_min > coste_max es inválido', () => {
      const validation = filters.validateCriteria({
        coste_min: 20,
        coste_max: 10
      });
      expect(validation.valid).toBe(false);
    });

    test('viabilidad inválida rechazada', () => {
      const validation = filters.validateCriteria({ viabilidad: 'excelente' });
      expect(validation.valid).toBe(false);
    });

    test('viabilidad válida aceptada', () => {
      const validation = filters.validateCriteria({ viabilidad: 'media' });
      expect(validation.valid).toBe(true);
    });

    test('case-insensitive en viabilidad', () => {
      const validation = filters.validateCriteria({ viabilidad: 'ALTA' });
      expect(validation.valid).toBe(true);
    });

    test('retorna array de errores cuando hay múltiples', () => {
      const validation = filters.validateCriteria({
        dificultad_min: 15,
        tiempo_min: -5,
        coste_min: 100,
        coste_max: 50
      });
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(2);
    });
  });
});
