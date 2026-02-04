#!/usr/bin/env node
/**
 * Test del módulo menu-generator v3.0.0
 * Prueba el flujo completo: input crudo → parseAndStructure → carta estructurada
 *
 * Uso: node modules/pizzepos/menu-generator/test-generate.js
 */

const MenuGeneratorModule = require('./index');

// ==========================================
// Input real: JSON crudo de Pizzicas
// ==========================================

const INPUT_PIZZICAS = `{
  "pizzicas": [
    {"name": "Country", "ingredients": "Tomate 🍅, Salsa BBQ 🔥, Nata 🥛, Pollo 🍗, Mezcla de quesos 🧀, Cebolla 🧅, Bacon 🥓", "price": "11.50"},
    {"name": "R&B (Rhythm and Blues)", "ingredients": "Tomate 🍅, Carne de ternera 🥩, Bacon 🥓, Queso 🧀, Salsa BBQ 🔥", "price": "11.00"},
    {"name": "Hip-Hop", "ingredients": "Tomate 🍅, Queso 🧀, Carne 🥩, Bacon 🥓, Peperoni 🌶️, Salsa Vitorino", "price": "11.00"},
    {"name": "Cumbia", "ingredients": "Tomate 🍅, Mozzarella 🧀, Cebolla 🧅, Ternera 🥩, Mezcla de quesos 🧀, Piña 🍍, Salsa Vitorino", "price": "11.00"},
    {"name": "Merengue", "ingredients": "Tomate 🍅, Mozzarella 🧀, York 🍖, Bacon 🥓", "price": "10.50"},
    {"name": "Soul", "ingredients": "Tomate 🍅, Queso 🧀, Peperoni 🌶️, Bacon 🥓, Champiñones 🍄", "price": "11.00"},
    {"name": "Bossa Nova", "ingredients": "Tomate 🍅, Mozzarella 🧀, Atún 🐟, Champiñón 🍄, Pimiento verde 🫑", "price": "11.00"},
    {"name": "Blues", "ingredients": "Tomate 🍅, Queso 🧀, Atún 🐟, Cebolla 🧅, Maíz 🌽, Salsa de mostaza 🟡", "price": "11.00"},
    {"name": "Tango", "ingredients": "Tomate 🍅, Mozzarella 🧀, Atún 🐟, Cebolla 🧅, Olivas", "price": "10.50"},
    {"name": "Chillout", "ingredients": "Tomate 🍅, Mozzarella 🧀, Atún 🐟, Cebolla 🧅", "price": "10.50"},
    {"name": "Punk", "ingredients": "Tomate 🍅, Queso 🧀, Jamón York 🍖, Atún 🐟, Olivas negras, Maíz 🌽", "price": "11.00"},
    {"name": "Folk", "ingredients": "Tomate seco, Mozzarella 🧀, Cebolla 🧅, Champiñón 🍄, Salsa de ajo asado y trufa, Anchoas 🐟", "price": "11.00"},
    {"name": "Bachata", "ingredients": "Tomate 🍅, Mozzarella 🧀, Anchoas 🐟, Alcaparras 🫒, Cebolla 🧅, Olivas", "price": "10.50"},
    {"name": "Batucada", "ingredients": "Tomate 🍅, Mozzarella 🧀, Queso azul 🧀, Mezcla de quesos 🧀, Nata 🥛", "price": "10.50"},
    {"name": "The Veggie Symphony", "ingredients": "Tomate 🍅, Mozzarella 🧀, Cebolla 🧅, Champiñón 🍄, Calabacín 🥒, Espárragos 🥬, Pimiento verde 🫑", "price": "10.50"},
    {"name": "Swing", "ingredients": "Crema de champiñones, Nata 🥛, Pimienta, Queso azul 🧀, York 🍖, Mezcla de quesos 🧀", "price": "11.00"},
    {"name": "Trap", "ingredients": "Tomate 🍅, Queso 🧀, Peperoni 🌶️, Nata 🥛, Maíz 🌽, Pimiento verde 🫑", "price": "11.00"},
    {"name": "Samba", "ingredients": "Tomate 🍅, Mozzarella 🧀, Albahaca 🌿", "price": "9.50"},
    {"name": "Fandango", "ingredients": "Ajo 🧄, Mozzarella 🧀, Queso azul 🧀", "price": "9.50"},
    {"name": "Milonga", "ingredients": "Tomate 🍅, Mozzarella 🧀, York 🍖", "price": "10.00"},
    {"name": "Ranchera", "ingredients": "Tomate 🍅, Mozzarella 🧀, Bacon 🥓, Cebolla 🧅, Salsa BBQ 🔥", "price": "10.50"},
    {"name": "Rockabilly", "ingredients": "Tomate 🍅, Mozzarella 🧀, Bacon 🥓, Cebolla 🧅, Nata 🥛", "price": "10.50"},
    {"name": "Vallenato", "ingredients": "Tomate 🍅, Mozzarella 🧀, York 🍖, Piña 🍍", "price": "10.50"},
    {"name": "Indie", "ingredients": "Tomate 🍅, Mozzarella 🧀, York 🍖, Pepperoni 🌶️", "price": "10.50"},
    {"name": "K-Pop", "ingredients": "Tomate 🍅, Mozzarella 🧀, York 🍖, Huevo 🥚", "price": "10.50"},
    {"name": "Flamenco", "ingredients": "Tomate 🍅, Mozzarella 🧀, Pepperoni 🌶️, Cebolla 🧅, Pimiento verde 🫑, Huevo 🥚", "price": "10.50"},
    {"name": "Jazz", "ingredients": "Tomate 🍅, Queso 🧀, Jamón York 🍖, Champiñones 🍄", "price": "10.50"},
    {"name": "Funk", "ingredients": "Tomate 🍅, Queso 🧀, Peperoni 🌶️", "price": "10.00"},
    {"name": "Rap", "ingredients": "Tomate 🍅, Queso 🧀, Plátano maduro 🍌, Maíz 🌽, Bacon 🥓", "price": "11.00"}
  ],
  "entrantes": [
    {"name": "Huevos Salseros", "ingredients": "Huevos 🥚, Salsa de ajo asado 🧄, trufa 🍄 y mayonesa 🥫", "price": "3.50"}
  ]
}`;

// ==========================================
// Simular respuesta AI (lo que DeepSeek/Claude devolvería)
// ==========================================

function simulateAIResponse(inputText) {
  // Parsear el JSON crudo del input
  const raw = JSON.parse(inputText);

  // Construir la respuesta como la haría la IA
  const categorias = [];
  const productos = [];
  let orden = 1;

  for (const [catKey, items] of Object.entries(raw)) {
    const catId = catKey.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

    categorias.push({
      id: catId,
      nombre: catKey.charAt(0).toUpperCase() + catKey.slice(1),
      orden: orden++
    });

    for (const item of items) {
      const prodId = `${catId}_${item.name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;

      const ingredientes = item.ingredients.split(',').map(s => {
        const trimmed = s.trim();
        const emojiMatch = trimmed.match(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/u);
        const nombre = trimmed.replace(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu, '').trim();
        return { nombre, emoji: emojiMatch ? emojiMatch[1] : '' };
      }).filter(i => i.nombre.length > 0);

      productos.push({
        id: prodId,
        nombre: item.name,
        categoria: catId,
        precio: parseFloat(item.price),
        ingredientes
      });
    }
  }

  return JSON.stringify({
    nombre_carta: 'Carta Pizzicas',
    categorias,
    productos
  });
}

// ==========================================
// Tests
// ==========================================

function runTests() {
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

  // ------------------------------------------
  // Test 1: parseAndStructure con respuesta AI simulada
  // ------------------------------------------
  console.log('\n━━━ Test 1: parseAndStructure con carta Pizzicas ━━━\n');

  const aiResponse = simulateAIResponse(INPUT_PIZZICAS);
  const carta = mod.parseAndStructure('carta_test_001', 'Carta Pizzicas', aiResponse);

  assert(carta.meta.id === 'carta_test_001', 'meta.id correcto');
  assert(carta.meta.nombre === 'Carta Pizzicas', 'meta.nombre correcto');
  assert(carta.meta.generado_desde === 'texto', 'meta.generado_desde = texto');
  assert(carta.meta.created_at !== undefined, 'meta.created_at presente');

  assert(carta.categorias.length === 2, `2 categorías (tiene ${carta.categorias.length})`);
  assert(carta.categorias[0].id === 'pizzicas', `categoría 1: pizzicas (tiene ${carta.categorias[0].id})`);
  assert(carta.categorias[1].id === 'entrantes', `categoría 2: entrantes (tiene ${carta.categorias[1].id})`);
  assert(carta.categorias[0].orden === 1, 'orden categoría 1 = 1');
  assert(carta.categorias[1].orden === 2, 'orden categoría 2 = 2');

  assert(carta.productos.length === 30, `30 productos (tiene ${carta.productos.length})`);

  // Verificar producto específico: Country
  const country = carta.productos.find(p => p.nombre === 'Country');
  assert(country !== undefined, 'Producto Country existe');
  assert(country.categoria === 'pizzicas', 'Country → categoría pizzicas');
  assert(country.precio === 11.50, `Country precio = 11.50 (tiene ${country?.precio})`);
  assert(country.ingredientes.length === 7, `Country tiene 7 ingredientes (tiene ${country?.ingredientes.length})`);
  assert(country.ingredientes[0].nombre === 'Tomate', `Primer ingrediente: Tomate (tiene ${country?.ingredientes[0]?.nombre})`);
  assert(country.ingredientes[0].emoji === '🍅', 'Emoji tomate: 🍅');

  // Verificar Samba (la más barata)
  const samba = carta.productos.find(p => p.nombre === 'Samba');
  assert(samba.precio === 9.50, `Samba precio = 9.50 (tiene ${samba?.precio})`);
  assert(samba.ingredientes.length === 3, `Samba tiene 3 ingredientes (tiene ${samba?.ingredientes.length})`);

  // Verificar entrante
  const huevos = carta.productos.find(p => p.nombre === 'Huevos Salseros');
  assert(huevos !== undefined, 'Huevos Salseros existe');
  assert(huevos.categoria === 'entrantes', 'Huevos → categoría entrantes');
  assert(huevos.precio === 3.50, `Huevos precio = 3.50 (tiene ${huevos?.precio})`);

  // ------------------------------------------
  // Test 2: normalizeIngredientes con diferentes formatos
  // ------------------------------------------
  console.log('\n━━━ Test 2: normalizeIngredientes — formatos variados ━━━\n');

  // String CSV con emojis
  const fromCSV = mod.normalizeIngredientes('Tomate 🍅, Queso 🧀, Bacon 🥓');
  assert(fromCSV.length === 3, `CSV: 3 ingredientes (tiene ${fromCSV.length})`);
  assert(fromCSV[0].nombre === 'Tomate', `CSV[0] nombre: Tomate (tiene ${fromCSV[0]?.nombre})`);
  assert(fromCSV[0].emoji === '🍅', 'CSV[0] emoji: 🍅');

  // Array de strings
  const fromStrArray = mod.normalizeIngredientes(['Tomate 🍅', 'Queso 🧀']);
  assert(fromStrArray.length === 2, `StrArray: 2 ingredientes (tiene ${fromStrArray.length})`);
  assert(fromStrArray[0].nombre === 'Tomate', 'StrArray[0] nombre: Tomate');

  // Array de objetos (formato correcto)
  const fromObjArray = mod.normalizeIngredientes([
    { nombre: 'Tomate', emoji: '🍅' },
    { nombre: 'Queso', emoji: '🧀' }
  ]);
  assert(fromObjArray.length === 2, `ObjArray: 2 ingredientes (tiene ${fromObjArray.length})`);
  assert(fromObjArray[0].nombre === 'Tomate', 'ObjArray[0] nombre: Tomate');
  assert(fromObjArray[0].emoji === '🍅', 'ObjArray[0] emoji: 🍅');

  // String sin emojis
  const sinEmoji = mod.normalizeIngredientes('Harina, Agua, Sal, Levadura');
  assert(sinEmoji.length === 4, `SinEmoji: 4 ingredientes (tiene ${sinEmoji.length})`);
  assert(sinEmoji[0].emoji === '', 'SinEmoji[0] emoji vacío');

  // Vacío
  const vacio = mod.normalizeIngredientes([]);
  assert(vacio.length === 0, 'Vacío: 0 ingredientes');

  // ------------------------------------------
  // Test 3: slugify
  // ------------------------------------------
  console.log('\n━━━ Test 3: slugify ━━━\n');

  assert(mod.slugify('Pizzicas') === 'pizzicas', 'Pizzicas → pizzicas');
  assert(mod.slugify('R&B (Rhythm and Blues)') === 'r_b_rhythm_and_blues', `R&B → r_b_rhythm_and_blues (tiene ${mod.slugify('R&B (Rhythm and Blues)')})`);
  assert(mod.slugify('Jamón Serrano') === 'jamon_serrano', 'Jamón Serrano → jamon_serrano');
  assert(mod.slugify('The Veggie Symphony') === 'the_veggie_symphony', 'The Veggie Symphony → the_veggie_symphony');
  assert(mod.slugify('') === 'sin_nombre', 'vacío → sin_nombre');
  assert(mod.slugify(null) === 'sin_nombre', 'null → sin_nombre');

  // ------------------------------------------
  // Test 4: parseAndStructure rechaza JSON inválido
  // ------------------------------------------
  console.log('\n━━━ Test 4: errores ━━━\n');

  try {
    mod.parseAndStructure('test', 'test', 'esto no es JSON');
    assert(false, 'Rechaza texto sin JSON');
  } catch (e) {
    assert(e.message === 'La IA no devolvió un JSON válido', `Rechaza texto sin JSON: "${e.message}"`);
  }

  try {
    mod.parseAndStructure('test', 'test', '{"categorias": [], "productos": []}');
    assert(false, 'Rechaza carta sin productos');
  } catch (e) {
    assert(e.message === 'La IA no extrajo ningún producto', `Rechaza carta vacía: "${e.message}"`);
  }

  // ------------------------------------------
  // Test 5: handleGenerate validación
  // ------------------------------------------
  console.log('\n━━━ Test 5: handleGenerate validación ━━━\n');

  // handleGenerate es async pero la validación es síncrona (no necesita eventBus)
  const resultCorto = mod.handleGenerate({ texto: 'hola' });
  // Es una Promise porque handleGenerate es async
  resultCorto.then(r => {
    assert(r.status === 400, `Rechaza texto < 10 chars (status ${r.status})`);
  });

  const resultVacio = mod.handleGenerate({});
  resultVacio.then(r => {
    assert(r.status === 400, `Rechaza sin texto (status ${r.status})`);
  });

  // ------------------------------------------
  // Output ejemplo
  // ------------------------------------------
  console.log('\n━━━ Output: 3 primeros productos de la carta generada ━━━\n');
  console.log(JSON.stringify(carta.meta, null, 2));
  console.log('\nCategorías:', JSON.stringify(carta.categorias, null, 2));
  console.log('\n3 primeros productos:');
  for (const p of carta.productos.slice(0, 3)) {
    console.log(JSON.stringify(p, null, 2));
  }

  // ------------------------------------------
  // Resumen
  // ------------------------------------------
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${passed} pasados, ${failed} fallidos`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Error ejecutando tests:', err);
  process.exit(1);
});
