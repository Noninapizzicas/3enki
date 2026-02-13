#!/usr/bin/env node
/**
 * Test con carta REAL — foto de menú de restaurante
 * Simula lo que la IA extraería del OCR de la imagen
 *
 * Uso: node modules/pizzepos/menu-generator/test-carta-real.js
 */

const MenuGeneratorModule = require('./index');

// ==========================================
// Texto extraído de la foto de la carta real
// (esto es lo que el OCR + IA produciría)
// ==========================================

const CARTA_REAL_TEXTO = `
ENTRANTES
Alitas de Pollo (6 unidades) 3.00
Nuggets de Pollo (6 unidades) 3.00
Aros de Cebolla (8 unidades) 2.70
Ensaladilla Rusa 3.00
Patatas Fritas 2.80
Patatas Cheddar (patatas fritas, bacón, queso cheddar, salsa blanca turca) 4.50
Patatas Yooset (patatas fritas, queso cheddar, salsa blanca turca, KEBAB) 4.70
Finger de Pollo (carne de pollo con un toque picante) 3.50
Pizza al Pesto (base, salsa al pesto) 5.00

ENSALADAS
Pinocho (lechuga, tomate, olivas, tapenas, atún) 4.50
Especial (lechuga, tomate, york, emmental, espárragos) 4.50
Marinera (lechuga, atún, bocas de mar, salsa rosa) 4.50
Loli (lechuga, tomate, kebab de pollo, salsa blanca turca, pan frito) 4.50

HAMBURGUESAS
Sola (pan y carne) 2.70
Natural (ternera, lechuga, tomate) 3.00
Sabrosa (ternera, lechuga, cebolla) 3.20
Ratón (ternera, lechuga, tomate, queso) 3.20
Vegetal (pollo, lechuga, tomate) 3.30
Completa (ternera, lechuga, tomate, queso, bacón, cebolla) 3.50
Vegetal Completa (pollo, lechuga, tomate, bacón, cebolla, queso) 3.80
Krispinocho (pollo rebozado de copos de avena, picante, lechuga, tomate) 4.00
Hamburguesa FB (2 hamburguesas 100 grs. de carne de vacuno, pan brioche, queso cheddar, bacón, cebolla, salsa mostaza) 8.00

FRANKFURT
Natural 3.00
Ratón 3.20
Completa 3.50

SANDWICH
Mixto (york y queso) 2.50
Vegetal (lechuga, tomate, espárragos, alcachofas, cebolla) 3.00
Salmón (lechuga, tomate, cebolla, salmón) 3.50

BOCADILLOS
Turco (lechuga, tomate, cebolla, kebab pollo, salsa blanca turca) 3.50
Catalana (tomate, jamón serrano) 3.50
Noruego (tomate, lechuga, salmón ahumado) 3.50
Mallorquín (sobrasada, queso fresco) 3.00
Bacón (bacón, queso fundido, tomate) 3.00
Vegetal (atún, mahonesa, tomate, huevo duro) 3.00
Pechuga (pechuga de pollo, lechuga, tomate, mahonesa) 3.50

PIZZAS — NUESTRAS FAVORITAS
La base de todas las pizzas están elaboradas con tomate y mozzarela de primerísima calidad
Tamaños: Individual / Mediana / Familiar

1. VENECIA (base, york, bacón, olivas) 7.80 / 10.00 / 13.00
2. MARGARITA (base, york, salami, tapenas) 7.80 / 10.00 / 13.00
3. MARINERA (base, atún, anchoas, gambas, olivas) 8.40 / 10.80 / 14.00
4. 4 ESTACIONES (base, york, champiñón, anchoas, olivas) 8.40 / 10.80 / 14.00
5. VEGETAL (base, espárragos, champiñón, alcachofa) 7.80 / 10.00 / 13.00
6. TROPICAL (base, york, piña, maíz) 7.80 / 10.00 / 13.00
7. RATÓN (base, roquefort, emmental) 8.40 / 10.80 / 14.00
8. PINOCHO (base, huevo, salami, champiñón, tapenas) 8.40 / 10.80 / 14.00
9. BARBACOA (base, carne picada, bacón, salsa barbacoa) 7.80 / 10.80 / 13.00
10. GARCÍA (base, york, bacón, atún, champiñón, huevo) 8.90 / 11.80 / 15.00
11. ALEMANA (base, frankfurt, york) 7.80 / 10.00 / 13.00
12. MURCIANA (base, pimiento verde, cebolla, champiñón) 7.80 / 10.80 / 13.00
13. PEPPERONI (base, pepperoni, york) 7.80 / 10.80 / 13.00
14. MARU (base, york, bacón, pimiento verde, cebolla, emmental) 8.90 / 11.80 / 15.00
15. ESPECIAL RIQUI (base, atún, bacón, carne picada, emmental) 8.40 / 10.80 / 14.00
16. CARBONARA (base sin tomate, bacón, cebolla, emmental, nata) 8.40 / 10.80 / 14.00
17. MALLORQUINA (base, sobrasada, queso fresco) 7.80 / 10.00 / 13.00
18. TURCA (base, kebab de pollo, salsa blanca turca) 7.80 / 10.80 / 13.00
19. NORUEGA (base, salmón, queso fresco) 8.40 / 10.80 / 14.00
20. IBÉRICA (base, jamón serrano, queso parmesano) 8.40 / 10.80 / 14.00
21. TELEGRAMA (base, salsa barbacoa, carne de kebab, cebolla, mozzarella, emmental, huevo duro) 8.90 / 11.80 / 15.00

PIZZA AL GUSTO — Crea tu propia pizza con tus ingredientes favoritos
Pizza base: tomate, mozzarella, orégano 6.00 / 7.00 / 9.20
Ingredientes extra: 0.60 / 1.00 / 1.20

PASTA
Lasaña 5.50
Tallarines a la Carbonara 4.50
Canelones 4.50
Spaguetti Bolognesa 4.50

POSTRES
Tarta Queso al Horno 4.50
Tarta de Pistacho 4.50
Tarta de Lotus 4.50
Tarta Kinder 4.50
Chocopizza 6.00
`;

// ==========================================
// Simular respuesta AI estructurada
// (lo que DeepSeek/Claude devolvería tras recibir el texto)
// ==========================================

function simulateAIResponse() {
  return JSON.stringify({
    nombre_carta: "Carta Restaurante",
    categorias: [
      { id: "entrantes", nombre: "Entrantes", orden: 1 },
      { id: "ensaladas", nombre: "Ensaladas", orden: 2 },
      { id: "hamburguesas", nombre: "Hamburguesas", orden: 3 },
      { id: "frankfurt", nombre: "Frankfurt", orden: 4 },
      { id: "sandwich", nombre: "Sandwich", orden: 5 },
      { id: "bocadillos", nombre: "Bocadillos", orden: 6 },
      { id: "pizzas", nombre: "Pizzas", orden: 7 },
      { id: "pasta", nombre: "Pasta", orden: 8 },
      { id: "postres", nombre: "Postres", orden: 9 }
    ],
    productos: [
      // ENTRANTES
      { id: "entrantes_alitas_de_pollo", nombre: "Alitas de Pollo", categoria: "entrantes", precio: 3.00, ingredientes: [{ nombre: "Pollo", emoji: "🍗" }] },
      { id: "entrantes_nuggets_de_pollo", nombre: "Nuggets de Pollo", categoria: "entrantes", precio: 3.00, ingredientes: [{ nombre: "Pollo", emoji: "🍗" }] },
      { id: "entrantes_aros_de_cebolla", nombre: "Aros de Cebolla", categoria: "entrantes", precio: 2.70, ingredientes: [{ nombre: "Cebolla", emoji: "🧅" }] },
      { id: "entrantes_ensaladilla_rusa", nombre: "Ensaladilla Rusa", categoria: "entrantes", precio: 3.00, ingredientes: [{ nombre: "Patata", emoji: "🥔" }, { nombre: "Mayonesa", emoji: "🥫" }, { nombre: "Atún", emoji: "🐟" }] },
      { id: "entrantes_patatas_fritas", nombre: "Patatas Fritas", categoria: "entrantes", precio: 2.80, ingredientes: [{ nombre: "Patata", emoji: "🥔" }] },
      { id: "entrantes_patatas_cheddar", nombre: "Patatas Cheddar", categoria: "entrantes", precio: 4.50, ingredientes: [{ nombre: "Patatas fritas", emoji: "🍟" }, { nombre: "Bacón", emoji: "🥓" }, { nombre: "Queso cheddar", emoji: "🧀" }, { nombre: "Salsa blanca turca", emoji: "🥛" }] },
      { id: "entrantes_patatas_yooset", nombre: "Patatas Yooset", categoria: "entrantes", precio: 4.70, ingredientes: [{ nombre: "Patatas fritas", emoji: "🍟" }, { nombre: "Queso cheddar", emoji: "🧀" }, { nombre: "Salsa blanca turca", emoji: "🥛" }, { nombre: "Kebab", emoji: "🥙" }] },
      { id: "entrantes_finger_de_pollo", nombre: "Finger de Pollo", categoria: "entrantes", precio: 3.50, ingredientes: [{ nombre: "Pollo", emoji: "🍗" }, { nombre: "Picante", emoji: "🌶️" }] },
      { id: "entrantes_pizza_al_pesto", nombre: "Pizza al Pesto", categoria: "entrantes", precio: 5.00, ingredientes: [{ nombre: "Base", emoji: "🍕" }, { nombre: "Salsa al pesto", emoji: "🌿" }] },

      // ENSALADAS
      { id: "ensaladas_pinocho", nombre: "Pinocho", categoria: "ensaladas", precio: 4.50, ingredientes: [{ nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }, { nombre: "Olivas", emoji: "🫒" }, { nombre: "Tapenas", emoji: "🫒" }, { nombre: "Atún", emoji: "🐟" }] },
      { id: "ensaladas_especial", nombre: "Especial", categoria: "ensaladas", precio: 4.50, ingredientes: [{ nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }, { nombre: "York", emoji: "🍖" }, { nombre: "Emmental", emoji: "🧀" }, { nombre: "Espárragos", emoji: "🌿" }] },
      { id: "ensaladas_marinera", nombre: "Marinera", categoria: "ensaladas", precio: 4.50, ingredientes: [{ nombre: "Lechuga", emoji: "🥬" }, { nombre: "Atún", emoji: "🐟" }, { nombre: "Bocas de mar", emoji: "🦀" }, { nombre: "Salsa rosa", emoji: "🥫" }] },
      { id: "ensaladas_loli", nombre: "Loli", categoria: "ensaladas", precio: 4.50, ingredientes: [{ nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }, { nombre: "Kebab de pollo", emoji: "🥙" }, { nombre: "Salsa blanca turca", emoji: "🥛" }, { nombre: "Pan frito", emoji: "🍞" }] },

      // HAMBURGUESAS
      { id: "hamburguesas_sola", nombre: "Sola", categoria: "hamburguesas", precio: 2.70, ingredientes: [{ nombre: "Pan", emoji: "🍞" }, { nombre: "Carne", emoji: "🥩" }] },
      { id: "hamburguesas_natural", nombre: "Natural", categoria: "hamburguesas", precio: 3.00, ingredientes: [{ nombre: "Ternera", emoji: "🥩" }, { nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }] },
      { id: "hamburguesas_sabrosa", nombre: "Sabrosa", categoria: "hamburguesas", precio: 3.20, ingredientes: [{ nombre: "Ternera", emoji: "🥩" }, { nombre: "Lechuga", emoji: "🥬" }, { nombre: "Cebolla", emoji: "🧅" }] },
      { id: "hamburguesas_raton", nombre: "Ratón", categoria: "hamburguesas", precio: 3.20, ingredientes: [{ nombre: "Ternera", emoji: "🥩" }, { nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }, { nombre: "Queso", emoji: "🧀" }] },
      { id: "hamburguesas_vegetal", nombre: "Vegetal", categoria: "hamburguesas", precio: 3.30, ingredientes: [{ nombre: "Pollo", emoji: "🍗" }, { nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }] },
      { id: "hamburguesas_completa", nombre: "Completa", categoria: "hamburguesas", precio: 3.50, ingredientes: [{ nombre: "Ternera", emoji: "🥩" }, { nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }, { nombre: "Queso", emoji: "🧀" }, { nombre: "Bacón", emoji: "🥓" }, { nombre: "Cebolla", emoji: "🧅" }] },
      { id: "hamburguesas_vegetal_completa", nombre: "Vegetal Completa", categoria: "hamburguesas", precio: 3.80, ingredientes: [{ nombre: "Pollo", emoji: "🍗" }, { nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }, { nombre: "Bacón", emoji: "🥓" }, { nombre: "Cebolla", emoji: "🧅" }, { nombre: "Queso", emoji: "🧀" }] },
      { id: "hamburguesas_krispinocho", nombre: "Krispinocho", categoria: "hamburguesas", precio: 4.00, ingredientes: [{ nombre: "Pollo rebozado", emoji: "🍗" }, { nombre: "Copos de avena", emoji: "🌾" }, { nombre: "Picante", emoji: "🌶️" }, { nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }] },
      { id: "hamburguesas_fb", nombre: "Hamburguesa FB", categoria: "hamburguesas", precio: 8.00, ingredientes: [{ nombre: "Carne de vacuno", emoji: "🥩" }, { nombre: "Pan brioche", emoji: "🍞" }, { nombre: "Queso cheddar", emoji: "🧀" }, { nombre: "Bacón", emoji: "🥓" }, { nombre: "Cebolla", emoji: "🧅" }, { nombre: "Salsa mostaza", emoji: "🟡" }] },

      // FRANKFURT
      { id: "frankfurt_natural", nombre: "Natural", categoria: "frankfurt", precio: 3.00, ingredientes: [{ nombre: "Frankfurt", emoji: "🌭" }] },
      { id: "frankfurt_raton", nombre: "Ratón", categoria: "frankfurt", precio: 3.20, ingredientes: [{ nombre: "Frankfurt", emoji: "🌭" }, { nombre: "Queso", emoji: "🧀" }] },
      { id: "frankfurt_completa", nombre: "Completa", categoria: "frankfurt", precio: 3.50, ingredientes: [{ nombre: "Frankfurt", emoji: "🌭" }, { nombre: "Queso", emoji: "🧀" }, { nombre: "Bacón", emoji: "🥓" }] },

      // SANDWICH
      { id: "sandwich_mixto", nombre: "Mixto", categoria: "sandwich", precio: 2.50, ingredientes: [{ nombre: "York", emoji: "🍖" }, { nombre: "Queso", emoji: "🧀" }] },
      { id: "sandwich_vegetal", nombre: "Vegetal", categoria: "sandwich", precio: 3.00, ingredientes: [{ nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }, { nombre: "Espárragos", emoji: "🌿" }, { nombre: "Alcachofas", emoji: "🥬" }, { nombre: "Cebolla", emoji: "🧅" }] },
      { id: "sandwich_salmon", nombre: "Salmón", categoria: "sandwich", precio: 3.50, ingredientes: [{ nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }, { nombre: "Cebolla", emoji: "🧅" }, { nombre: "Salmón", emoji: "🐟" }] },

      // BOCADILLOS
      { id: "bocadillos_turco", nombre: "Turco", categoria: "bocadillos", precio: 3.50, ingredientes: [{ nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }, { nombre: "Cebolla", emoji: "🧅" }, { nombre: "Kebab pollo", emoji: "🥙" }, { nombre: "Salsa blanca turca", emoji: "🥛" }] },
      { id: "bocadillos_catalana", nombre: "Catalana", categoria: "bocadillos", precio: 3.50, ingredientes: [{ nombre: "Tomate", emoji: "🍅" }, { nombre: "Jamón serrano", emoji: "🍖" }] },
      { id: "bocadillos_noruego", nombre: "Noruego", categoria: "bocadillos", precio: 3.50, ingredientes: [{ nombre: "Tomate", emoji: "🍅" }, { nombre: "Lechuga", emoji: "🥬" }, { nombre: "Salmón ahumado", emoji: "🐟" }] },
      { id: "bocadillos_mallorquin", nombre: "Mallorquín", categoria: "bocadillos", precio: 3.00, ingredientes: [{ nombre: "Sobrasada", emoji: "🌶️" }, { nombre: "Queso fresco", emoji: "🧀" }] },
      { id: "bocadillos_bacon", nombre: "Bacón", categoria: "bocadillos", precio: 3.00, ingredientes: [{ nombre: "Bacón", emoji: "🥓" }, { nombre: "Queso fundido", emoji: "🧀" }, { nombre: "Tomate", emoji: "🍅" }] },
      { id: "bocadillos_vegetal", nombre: "Vegetal", categoria: "bocadillos", precio: 3.00, ingredientes: [{ nombre: "Atún", emoji: "🐟" }, { nombre: "Mahonesa", emoji: "🥫" }, { nombre: "Tomate", emoji: "🍅" }, { nombre: "Huevo duro", emoji: "🥚" }] },
      { id: "bocadillos_pechuga", nombre: "Pechuga", categoria: "bocadillos", precio: 3.50, ingredientes: [{ nombre: "Pechuga de pollo", emoji: "🍗" }, { nombre: "Lechuga", emoji: "🥬" }, { nombre: "Tomate", emoji: "🍅" }, { nombre: "Mahonesa", emoji: "🥫" }] },

      // PIZZAS (precio = individual, el más bajo)
      { id: "pizzas_venecia", nombre: "Venecia", categoria: "pizzas", precio: 7.80, ingredientes: [{ nombre: "York", emoji: "🍖" }, { nombre: "Bacón", emoji: "🥓" }, { nombre: "Olivas", emoji: "🫒" }] },
      { id: "pizzas_margarita", nombre: "Margarita", categoria: "pizzas", precio: 7.80, ingredientes: [{ nombre: "York", emoji: "🍖" }, { nombre: "Salami", emoji: "🥓" }, { nombre: "Tapenas", emoji: "🫒" }] },
      { id: "pizzas_marinera", nombre: "Marinera", categoria: "pizzas", precio: 8.40, ingredientes: [{ nombre: "Atún", emoji: "🐟" }, { nombre: "Anchoas", emoji: "🐟" }, { nombre: "Gambas", emoji: "🦐" }, { nombre: "Olivas", emoji: "🫒" }] },
      { id: "pizzas_4_estaciones", nombre: "4 Estaciones", categoria: "pizzas", precio: 8.40, ingredientes: [{ nombre: "York", emoji: "🍖" }, { nombre: "Champiñón", emoji: "🍄" }, { nombre: "Anchoas", emoji: "🐟" }, { nombre: "Olivas", emoji: "🫒" }] },
      { id: "pizzas_vegetal", nombre: "Vegetal", categoria: "pizzas", precio: 7.80, ingredientes: [{ nombre: "Espárragos", emoji: "🌿" }, { nombre: "Champiñón", emoji: "🍄" }, { nombre: "Alcachofa", emoji: "🥬" }] },
      { id: "pizzas_tropical", nombre: "Tropical", categoria: "pizzas", precio: 7.80, ingredientes: [{ nombre: "York", emoji: "🍖" }, { nombre: "Piña", emoji: "🍍" }, { nombre: "Maíz", emoji: "🌽" }] },
      { id: "pizzas_raton", nombre: "Ratón", categoria: "pizzas", precio: 8.40, ingredientes: [{ nombre: "Roquefort", emoji: "🧀" }, { nombre: "Emmental", emoji: "🧀" }] },
      { id: "pizzas_pinocho", nombre: "Pinocho", categoria: "pizzas", precio: 8.40, ingredientes: [{ nombre: "Huevo", emoji: "🥚" }, { nombre: "Salami", emoji: "🥓" }, { nombre: "Champiñón", emoji: "🍄" }, { nombre: "Tapenas", emoji: "🫒" }] },
      { id: "pizzas_barbacoa", nombre: "Barbacoa", categoria: "pizzas", precio: 7.80, ingredientes: [{ nombre: "Carne picada", emoji: "🥩" }, { nombre: "Bacón", emoji: "🥓" }, { nombre: "Salsa barbacoa", emoji: "🔥" }] },
      { id: "pizzas_garcia", nombre: "García", categoria: "pizzas", precio: 8.90, ingredientes: [{ nombre: "York", emoji: "🍖" }, { nombre: "Bacón", emoji: "🥓" }, { nombre: "Atún", emoji: "🐟" }, { nombre: "Champiñón", emoji: "🍄" }, { nombre: "Huevo", emoji: "🥚" }] },
      { id: "pizzas_alemana", nombre: "Alemana", categoria: "pizzas", precio: 7.80, ingredientes: [{ nombre: "Frankfurt", emoji: "🌭" }, { nombre: "York", emoji: "🍖" }] },
      { id: "pizzas_murciana", nombre: "Murciana", categoria: "pizzas", precio: 7.80, ingredientes: [{ nombre: "Pimiento verde", emoji: "🫑" }, { nombre: "Cebolla", emoji: "🧅" }, { nombre: "Champiñón", emoji: "🍄" }] },
      { id: "pizzas_pepperoni", nombre: "Pepperoni", categoria: "pizzas", precio: 7.80, ingredientes: [{ nombre: "Pepperoni", emoji: "🌶️" }, { nombre: "York", emoji: "🍖" }] },
      { id: "pizzas_maru", nombre: "Maru", categoria: "pizzas", precio: 8.90, ingredientes: [{ nombre: "York", emoji: "🍖" }, { nombre: "Bacón", emoji: "🥓" }, { nombre: "Pimiento verde", emoji: "🫑" }, { nombre: "Cebolla", emoji: "🧅" }, { nombre: "Emmental", emoji: "🧀" }] },
      { id: "pizzas_especial_riqui", nombre: "Especial Riqui", categoria: "pizzas", precio: 8.40, ingredientes: [{ nombre: "Atún", emoji: "🐟" }, { nombre: "Bacón", emoji: "🥓" }, { nombre: "Carne picada", emoji: "🥩" }, { nombre: "Emmental", emoji: "🧀" }] },
      { id: "pizzas_carbonara", nombre: "Carbonara", categoria: "pizzas", precio: 8.40, ingredientes: [{ nombre: "Bacón", emoji: "🥓" }, { nombre: "Cebolla", emoji: "🧅" }, { nombre: "Emmental", emoji: "🧀" }, { nombre: "Nata", emoji: "🥛" }] },
      { id: "pizzas_mallorquina", nombre: "Mallorquina", categoria: "pizzas", precio: 7.80, ingredientes: [{ nombre: "Sobrasada", emoji: "🌶️" }, { nombre: "Queso fresco", emoji: "🧀" }] },
      { id: "pizzas_turca", nombre: "Turca", categoria: "pizzas", precio: 7.80, ingredientes: [{ nombre: "Kebab de pollo", emoji: "🥙" }, { nombre: "Salsa blanca turca", emoji: "🥛" }] },
      { id: "pizzas_noruega", nombre: "Noruega", categoria: "pizzas", precio: 8.40, ingredientes: [{ nombre: "Salmón", emoji: "🐟" }, { nombre: "Queso fresco", emoji: "🧀" }] },
      { id: "pizzas_iberica", nombre: "Ibérica", categoria: "pizzas", precio: 8.40, ingredientes: [{ nombre: "Jamón serrano", emoji: "🍖" }, { nombre: "Queso parmesano", emoji: "🧀" }] },
      { id: "pizzas_telegrama", nombre: "Telegrama", categoria: "pizzas", precio: 8.90, ingredientes: [{ nombre: "Salsa barbacoa", emoji: "🔥" }, { nombre: "Carne de kebab", emoji: "🥙" }, { nombre: "Cebolla", emoji: "🧅" }, { nombre: "Mozzarella", emoji: "🧀" }, { nombre: "Emmental", emoji: "🧀" }, { nombre: "Huevo duro", emoji: "🥚" }] },
      { id: "pizzas_al_gusto", nombre: "Pizza al Gusto", categoria: "pizzas", precio: 6.00, ingredientes: [{ nombre: "Tomate", emoji: "🍅" }, { nombre: "Mozzarella", emoji: "🧀" }, { nombre: "Orégano", emoji: "🌿" }] },

      // PASTA
      { id: "pasta_lasana", nombre: "Lasaña", categoria: "pasta", precio: 5.50, ingredientes: [{ nombre: "Pasta", emoji: "🍝" }, { nombre: "Carne", emoji: "🥩" }, { nombre: "Bechamel", emoji: "🥛" }] },
      { id: "pasta_tallarines_carbonara", nombre: "Tallarines a la Carbonara", categoria: "pasta", precio: 4.50, ingredientes: [{ nombre: "Tallarines", emoji: "🍝" }, { nombre: "Nata", emoji: "🥛" }, { nombre: "Bacón", emoji: "🥓" }] },
      { id: "pasta_canelones", nombre: "Canelones", categoria: "pasta", precio: 4.50, ingredientes: [{ nombre: "Pasta", emoji: "🍝" }, { nombre: "Carne", emoji: "🥩" }, { nombre: "Bechamel", emoji: "🥛" }] },
      { id: "pasta_spaguetti_bolognesa", nombre: "Spaguetti Bolognesa", categoria: "pasta", precio: 4.50, ingredientes: [{ nombre: "Espaguetis", emoji: "🍝" }, { nombre: "Salsa boloñesa", emoji: "🍅" }] },

      // POSTRES
      { id: "postres_tarta_queso", nombre: "Tarta Queso al Horno", categoria: "postres", precio: 4.50, ingredientes: [{ nombre: "Queso", emoji: "🧀" }] },
      { id: "postres_tarta_pistacho", nombre: "Tarta de Pistacho", categoria: "postres", precio: 4.50, ingredientes: [{ nombre: "Pistacho", emoji: "🥜" }] },
      { id: "postres_tarta_lotus", nombre: "Tarta de Lotus", categoria: "postres", precio: 4.50, ingredientes: [{ nombre: "Galleta Lotus", emoji: "🍪" }] },
      { id: "postres_tarta_kinder", nombre: "Tarta Kinder", categoria: "postres", precio: 4.50, ingredientes: [{ nombre: "Chocolate", emoji: "🍫" }] },
      { id: "postres_chocopizza", nombre: "Chocopizza", categoria: "postres", precio: 6.00, ingredientes: [{ nombre: "Chocolate", emoji: "🍫" }, { nombre: "Base pizza", emoji: "🍕" }] }
    ]
  });
}

// ==========================================
// Ejecutar test
// ==========================================

function runTest() {
  const mod = new MenuGeneratorModule();
  let passed = 0;
  let failed = 0;

  function assert(condition, testName, detail) {
    if (condition) {
      console.log(`  ✓ ${testName}`);
      passed++;
    } else {
      console.log(`  ✗ ${testName} — ${detail || 'FAILED'}`);
      failed++;
    }
  }

  console.log('\n━━━ Test: Carta real — restaurante con foto de menú ━━━\n');

  const aiResponse = simulateAIResponse();
  const carta = mod.parseAndStructure('carta_restaurante_real', 'Carta Restaurante', aiResponse);

  // Estructura general
  assert(carta.meta.id === 'carta_restaurante_real', 'meta.id correcto');
  assert(carta.meta.nombre === 'Carta Restaurante', 'meta.nombre correcto');
  assert(carta.categorias.length === 9, `9 categorías (tiene ${carta.categorias.length})`);
  assert(carta.productos.length === 66, `66 productos (tiene ${carta.productos.length})`);

  // Categorías
  const catNames = carta.categorias.map(c => c.id);
  assert(catNames.includes('entrantes'), 'Categoría: entrantes');
  assert(catNames.includes('pizzas'), 'Categoría: pizzas');
  assert(catNames.includes('hamburguesas'), 'Categoría: hamburguesas');
  assert(catNames.includes('postres'), 'Categoría: postres');
  assert(catNames.includes('pasta'), 'Categoría: pasta');

  // Conteo por categoría
  const porCat = {};
  carta.productos.forEach(p => { porCat[p.categoria] = (porCat[p.categoria] || 0) + 1; });
  assert(porCat.entrantes === 9, `Entrantes: 9 (tiene ${porCat.entrantes})`);
  assert(porCat.ensaladas === 4, `Ensaladas: 4 (tiene ${porCat.ensaladas})`);
  assert(porCat.hamburguesas === 9, `Hamburguesas: 9 (tiene ${porCat.hamburguesas})`);
  assert(porCat.frankfurt === 3, `Frankfurt: 3 (tiene ${porCat.frankfurt})`);
  assert(porCat.sandwich === 3, `Sandwich: 3 (tiene ${porCat.sandwich})`);
  assert(porCat.bocadillos === 7, `Bocadillos: 7 (tiene ${porCat.bocadillos})`);
  assert(porCat.pizzas === 22, `Pizzas: 22 (tiene ${porCat.pizzas})`);
  assert(porCat.pasta === 4, `Pasta: 4 (tiene ${porCat.pasta})`);
  assert(porCat.postres === 5, `Postres: 5 (tiene ${porCat.postres || 0})`);

  // Producto específico: Hamburguesa FB (la más cara de hamburguesas)
  const fb = carta.productos.find(p => p.nombre === 'Hamburguesa FB');
  assert(fb !== undefined, 'Hamburguesa FB existe');
  assert(fb.precio === 8.00, `FB precio = 8.00 (tiene ${fb?.precio})`);
  assert(fb.ingredientes.length === 6, `FB 6 ingredientes (tiene ${fb?.ingredientes.length})`);

  // Pizza García (la más cara junto con Maru y Telegrama)
  const garcia = carta.productos.find(p => p.nombre === 'García');
  assert(garcia !== undefined, 'Pizza García existe');
  assert(garcia.precio === 8.90, `García precio = 8.90 (tiene ${garcia?.precio})`);
  assert(garcia.ingredientes.length === 5, `García 5 ingredientes (tiene ${garcia?.ingredientes.length})`);

  // Pizza al Gusto (base personalizable)
  const alGusto = carta.productos.find(p => p.nombre === 'Pizza al Gusto');
  assert(alGusto !== undefined, 'Pizza al Gusto existe');
  assert(alGusto.precio === 6.00, `Al Gusto precio = 6.00 (tiene ${alGusto?.precio})`);

  // Precios — todos numéricos, ninguno 0
  const preciosValidos = carta.productos.every(p => typeof p.precio === 'number' && p.precio > 0);
  assert(preciosValidos, 'Todos los precios son números > 0');

  // IDs — todos slug válido
  const idsValidos = carta.productos.every(p => /^[a-z0-9_]+$/.test(p.id));
  assert(idsValidos, 'Todos los IDs son slug válidos');

  // Ingredientes — todos tienen al menos 1
  const todosConIng = carta.productos.every(p => p.ingredientes.length > 0);
  assert(todosConIng, 'Todos los productos tienen ingredientes');

  // ------------------------------------------
  // Estadísticas
  // ------------------------------------------
  console.log('\n━━━ Estadísticas de la carta ━━━\n');

  const ingredientesUnicos = new Set();
  carta.productos.forEach(p => p.ingredientes.forEach(i => ingredientesUnicos.add(i.nombre)));

  console.log(`  Categorías:           ${carta.categorias.length}`);
  console.log(`  Productos totales:    ${carta.productos.length}`);
  console.log(`  Ingredientes únicos:  ${ingredientesUnicos.size}`);
  console.log(`  Precio mín:           ${Math.min(...carta.productos.map(p => p.precio)).toFixed(2)}€`);
  console.log(`  Precio máx:           ${Math.max(...carta.productos.map(p => p.precio)).toFixed(2)}€`);
  console.log(`  Precio medio:         ${(carta.productos.reduce((s, p) => s + p.precio, 0) / carta.productos.length).toFixed(2)}€`);

  console.log('\n  Por categoría:');
  for (const cat of carta.categorias) {
    const prods = carta.productos.filter(p => p.categoria === cat.id);
    const avg = prods.reduce((s, p) => s + p.precio, 0) / prods.length;
    console.log(`    ${cat.nombre.padEnd(15)} ${prods.length.toString().padStart(2)} productos  avg ${avg.toFixed(2)}€`);
  }

  // ------------------------------------------
  // Resumen
  // ------------------------------------------
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${passed} pasados, ${failed} fallidos`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (failed > 0) process.exit(1);
}

runTest();
