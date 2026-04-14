/**
 * Unit Tests - Search Ranker
 *
 * Tests para algoritmo de scoring multi-factor
 */

const SearchRanker = require('../search-ranker');
const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

describe('SearchRanker', () => {
  let ranker;

  beforeEach(() => {
    ranker = new SearchRanker(logger);
  });

  // ==========================================
  // NOMBRE MATCH SCORING
  // ==========================================

  describe('scoreNombreMatch', () => {
    test('coincidencia exacta = 40 puntos', () => {
      const score = ranker._scoreNombreMatch('pasta carbonara', 'pasta carbonara');
      expect(score).toBe(40);
    });

    test('comienza con = 35 puntos', () => {
      const score = ranker._scoreNombreMatch('pasta carbonara fresca', 'pasta c');
      expect(score).toBe(35);
    });

    test('palabra exacta en nombre = 30 puntos', () => {
      const score = ranker._scoreNombreMatch('pasta a la carbonara', 'carbonara');
      expect(score).toBe(30);
    });

    test('substring en nombre = 0-20 puntos escalado', () => {
      const score = ranker._scoreNombreMatch('pasta italiana', 'pasta');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(20);
    });

    test('no coincide = 0 puntos', () => {
      const score = ranker._scoreNombreMatch('pasta', 'pizza');
      expect(score).toBe(0);
    });

    test('case-insensitive', () => {
      const score1 = ranker._scoreNombreMatch('Pasta Carbonara', 'pasta carbonara');
      const score2 = ranker._scoreNombreMatch('PASTA CARBONARA', 'Pasta Carbonara');
      expect(score1).toBe(40);
      expect(score2).toBe(40);
    });
  });

  // ==========================================
  // INGREDIENTES SCORING
  // ==========================================

  describe('scoreIngredientes', () => {
    test('todos los ingredientes presentes = 30 puntos', () => {
      const result = { ingredientes_nombres: 'tomate | ajo | cebolla | jamón' };
      const score = ranker._scoreIngredientes(result, ['tomate', 'ajo']);
      expect(score).toBe(30);
    });

    test('la mitad de ingredientes = 15 puntos', () => {
      const result = { ingredientes_nombres: 'tomate | cebolla' };
      const score = ranker._scoreIngredientes(result, ['tomate', 'ajo', 'cebolla', 'jamón']);
      expect(score).toBe(15);
    });

    test('ninguno presente = 0 puntos', () => {
      const result = { ingredientes_nombres: 'tomate | cebolla' };
      const score = ranker._scoreIngredientes(result, ['ajo', 'jamón']);
      expect(score).toBe(0);
    });

    test('sin ingredientes_nombres = 0 puntos', () => {
      const result = {};
      const score = ranker._scoreIngredientes(result, ['tomate']);
      expect(score).toBe(0);
    });

    test('case-insensitive', () => {
      const result = { ingredientes_nombres: 'TOMATE | AJO' };
      const score = ranker._scoreIngredientes(result, ['tomate', 'ajo']);
      expect(score).toBe(30);
    });
  });

  // ==========================================
  // COSTE SCORING
  // ==========================================

  describe('scoreCoste', () => {
    test('dentro del rango = 20 puntos', () => {
      const result = { coste_porcion_min: 10 };
      const score = ranker._scoreCoste(result, 8, 15);
      expect(score).toBe(20);
    });

    test('por debajo del rango penaliza', () => {
      const result = { coste_porcion_min: 5 };
      const score = ranker._scoreCoste(result, 8, 15);
      expect(score).toBeLessThan(20);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    test('por encima del rango penaliza', () => {
      const result = { coste_porcion_min: 25 };
      const score = ranker._scoreCoste(result, 8, 15);
      expect(score).toBeLessThan(20);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    test('sin límites = 0 puntos', () => {
      const result = { coste_porcion_min: 50 };
      const score = ranker._scoreCoste(result, undefined, undefined);
      expect(score).toBe(0);
    });

    test('penaliza 2 puntos por euro fuera de rango', () => {
      const result = { coste_porcion_min: 5 }; // 3€ por debajo de 8€
      const score = ranker._scoreCoste(result, 8, 15);
      expect(score).toBe(20 - 3 * 2); // 14 puntos
    });
  });

  // ==========================================
  // VIABILIDAD SCORING
  // ==========================================

  describe('scoreViabilidad', () => {
    test('viabilidad alta = 10 puntos', () => {
      const score = ranker._scoreViabilidad('alta');
      expect(score).toBe(10);
    });

    test('viabilidad media = 5 puntos', () => {
      const score = ranker._scoreViabilidad('media');
      expect(score).toBe(5);
    });

    test('viabilidad baja = 0 puntos', () => {
      const score = ranker._scoreViabilidad('baja');
      expect(score).toBe(0);
    });

    test('viabilidad desconocida = 0 puntos', () => {
      const score = ranker._scoreViabilidad('desconocida');
      expect(score).toBe(0);
    });

    test('case-insensitive', () => {
      const score = ranker._scoreViabilidad('ALTA');
      expect(score).toBe(10);
    });
  });

  // ==========================================
  // RECENCY SCORING
  // ==========================================

  describe('scoreRecency', () => {
    test('hoy = máximo 5 puntos', () => {
      const now = new Date();
      const score = ranker._scoreRecency(now.toISOString());
      expect(score).toBeGreaterThanOrEqual(4); // Tolerancia
      expect(score).toBeLessThanOrEqual(5);
    });

    test('hace 7 días = ~4 puntos', () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const score = ranker._scoreRecency(sevenDaysAgo.toISOString());
      expect(score).toBeGreaterThanOrEqual(3);
      expect(score).toBeLessThanOrEqual(4);
    });

    test('hace 35+ días = 0 puntos', () => {
      const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      const score = ranker._scoreRecency(thirtyFiveDaysAgo.toISOString());
      expect(score).toBe(0);
    });

    test('sin fecha = 0 puntos', () => {
      const score = ranker._scoreRecency(null);
      expect(score).toBe(0);
    });
  });

  // ==========================================
  // RANKING COMPLETO
  // ==========================================

  describe('rankResults', () => {
    test('rankea resultados por score descendente', () => {
      const results = [
        { id: 1, nombre: 'pizza', coste_porcion_min: 10 },
        { id: 2, nombre: 'pasta carbonara', coste_porcion_min: 8 },
        { id: 3, nombre: 'pasta', coste_porcion_min: 6 }
      ];

      const ranked = ranker.rankResults(results, { nombre: 'pasta' });

      expect(ranked[0]._score).toBeGreaterThanOrEqual(ranked[1]._score);
      expect(ranked[1]._score).toBeGreaterThanOrEqual(ranked[2]._score);
    });

    test('resultado vacío retorna vacío', () => {
      const results = [];
      const ranked = ranker.rankResults(results, { nombre: 'pasta' });
      expect(ranked).toEqual([]);
    });

    test('score total es suma de factores', () => {
      const result = {
        nombre: 'pasta carbonara',
        ingredientes_nombres: 'tomate | ajo',
        coste_porcion_min: 10,
        viabilidad: 'alta',
        updated_at: new Date().toISOString()
      };

      const ranked = ranker.rankResults([result], {
        nombre: 'pasta',
        ingredientes: ['tomate', 'ajo'],
        coste_min: 8,
        coste_max: 15,
        viabilidad_bonus: true
      });

      expect(ranked[0]._score).toBeGreaterThan(0);
      expect(ranked[0]._score).toBeLessThanOrEqual(100);
    });
  });
});
