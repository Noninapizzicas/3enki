// CabinetLOCK — conectores universales para armario con tablero 16mm
// Material: PETG · Impresora: SPARKX i7 · Boquilla: 0.4mm
// Render una pieza: cambiar PIEZA al nombre deseado y exportar STL

// ══════════════════════════════════════════════════════════════
// SELECTOR DE PIEZA (cambiar aquí para renderizar)
// ══════════════════════════════════════════════════════════════
// Valores: "esquina_l", "esquina_3d", "t_interior", "soporte_balda",
//          "recto", "tapon", "union_vertical", "calibracion"
PIEZA = "esquina_l";

// ══════════════════════════════════════════════════════════════
// PARÁMETROS GLOBALES
// ══════════════════════════════════════════════════════════════

// --- Tablero ---
ESPESOR_TABLERO  = 16;      // mm — melamina/contrachapado/MDF/aglomerado
TOLERANCIA_LADO  = 0.15;    // mm por lado → canal = 16 + 2×0.15 = 16.3mm
ANCHO_CANAL      = ESPESOR_TABLERO + 2 * TOLERANCIA_LADO;

// --- Cuerpo del conector ---
PARED            = 3;        // mm espesor de pared mínimo (3 perímetros × 0.4mm + margen)
PROFUNDIDAD_CANAL = 20;     // mm — cuánto entra el tablero en el conector
LARGO_BRAZO      = 40;      // mm — longitud del brazo (ESQUINA-L, T, RECTO)
FILLET           = 1.5;     // mm — radio de acuerdo en esquinas internas de esfuerzo

// --- Snap-fit (cantilever) ---
SNAP_LARGO       = 6;       // mm — longitud del brazo cantilever
SNAP_ESPESOR     = 2.4;     // mm — espesor del brazo
SNAP_DEFLEXION   = 1.2;     // mm — cuánto se deflecta al insertar
SNAP_ANGULO_ENTRADA   = 25; // grados — chaflán de entrada (fácil inserción)
SNAP_ANGULO_RETENCION = 80; // grados — ángulo de retención (difícil extracción)
SNAP_ANCHO       = 8;       // mm — ancho del brazo snap-fit

// --- Nervios anti-rotación ---
RIB_ALTURA       = 0.3;     // mm — interferencia del nervio dentro del canal
RIB_ANCHO        = 1;       // mm — ancho del nervio
RIB_LARGO        = 15;      // mm — largo del nervio (a lo largo del canal)
RIB_CANTIDAD     = 2;       // nervios por cara interior del canal

// --- Soporte balda ---
BALDA_PIN_DIAM   = 5;       // mm — diámetro del pin (estándar europeo)
BALDA_PIN_LARGO  = 8;       // mm — largo del pin que entra en el agujero
BALDA_LABIO      = 3;       // mm — labio de retención de la balda
BALDA_BASE       = 15;      // mm — diámetro de la base del soporte

// --- Derivados ---
ANCHO_EXTERIOR   = ANCHO_CANAL + 2 * PARED;  // 22.3mm

$fn = 40;

// ══════════════════════════════════════════════════════════════
// MÓDULOS AUXILIARES
// ══════════════════════════════════════════════════════════════

// Canal para tablero: un hueco rectangular con las tolerancias aplicadas
// Orientado en Z (el tablero entra desde arriba)
module canal_tablero(profundidad=PROFUNDIDAD_CANAL, largo=LARGO_BRAZO) {
    translate([0, 0, -0.01])
        cube([ANCHO_CANAL, largo, profundidad + 0.01]);
}

// Nervios anti-rotación dentro de un canal
// Se colocan en las paredes internas para crear interferencia
module nervios_anti_rotacion(profundidad=PROFUNDIDAD_CANAL, largo=LARGO_BRAZO) {
    espaciado = (largo - RIB_CANTIDAD * RIB_LARGO) / (RIB_CANTIDAD + 1);

    for (cara = [0, 1]) {        // 0 = pared izquierda, 1 = pared derecha
        for (i = [0 : RIB_CANTIDAD - 1]) {
            pos_y = espaciado + i * (RIB_LARGO + espaciado);
            pos_x = cara == 0 ? -RIB_ALTURA : ANCHO_CANAL;

            translate([pos_x, pos_y, profundidad * 0.2])
                cube([RIB_ALTURA, RIB_LARGO, profundidad * 0.6]);
        }
    }
}

// Brazo snap-fit cantilever
// Nace de una pared y se deflecta hacia el interior del canal
module snap_arm() {
    // Cuerpo del brazo cantilever
    hull() {
        cube([SNAP_ESPESOR, SNAP_ANCHO, 0.01]);
        translate([0, 0, SNAP_LARGO - 0.01])
            cube([SNAP_ESPESOR, SNAP_ANCHO, 0.01]);
    }

    // Gancho de retención
    translate([0, 0, SNAP_LARGO]) {
        // Rampa de entrada (ángulo suave)
        hull() {
            cube([SNAP_ESPESOR, SNAP_ANCHO, 0.01]);
            translate([SNAP_DEFLEXION, 0, SNAP_DEFLEXION * tan(SNAP_ANGULO_ENTRADA)])
                cube([SNAP_ESPESOR, SNAP_ANCHO, 0.01]);
        }
        // Cara de retención (ángulo agresivo)
        hull() {
            translate([SNAP_DEFLEXION, 0, SNAP_DEFLEXION * tan(SNAP_ANGULO_ENTRADA)])
                cube([SNAP_ESPESOR, SNAP_ANCHO, 0.01]);
            translate([SNAP_DEFLEXION, 0, SNAP_DEFLEXION * tan(SNAP_ANGULO_ENTRADA) + 0.5])
                cube([0.01, SNAP_ANCHO, 0.01]);
        }
    }
}

// Par de snap-fits enfrentados dentro de un canal
module snap_pair(profundidad=PROFUNDIDAD_CANAL, largo=LARGO_BRAZO) {
    centro_y = largo / 2 - SNAP_ANCHO / 2;

    // Snap izquierdo (crece hacia +X, dentro del canal)
    translate([PARED - SNAP_ESPESOR, centro_y, 0])
        snap_arm();

    // Snap derecho (espejado, crece hacia -X)
    translate([PARED + ANCHO_CANAL + SNAP_ESPESOR, centro_y + SNAP_ANCHO, 0])
        rotate([0, 0, 180])
            snap_arm();
}

// Fillet 2D como cuarto de cilindro para esquinas internas
module fillet_lineal(radio=FILLET, largo=LARGO_BRAZO) {
    difference() {
        cube([radio, radio, largo]);
        translate([radio, radio, -0.01])
            cylinder(r=radio, h=largo + 0.02);
    }
}

// ══════════════════════════════════════════════════════════════
// PIEZAS
// ══════════════════════════════════════════════════════════════

// --- ESQUINA-L: conecta 2 tableros a 90° (la más común) ---
module esquina_l() {
    alto_total = PROFUNDIDAD_CANAL + PARED;

    difference() {
        union() {
            // Brazo A (horizontal, a lo largo de Y)
            cube([ANCHO_EXTERIOR, LARGO_BRAZO, alto_total]);

            // Brazo B (perpendicular, a lo largo de X)
            cube([LARGO_BRAZO, ANCHO_EXTERIOR, alto_total]);

            // Refuerzo diagonal en la esquina interior
            translate([ANCHO_EXTERIOR, ANCHO_EXTERIOR, 0])
                linear_extrude(alto_total)
                    polygon([
                        [0, 0],
                        [10, 0],
                        [0, 10]
                    ]);
        }

        // Canal A (tablero horizontal entra por Z)
        translate([PARED, 0, PARED])
            canal_tablero(PROFUNDIDAD_CANAL, LARGO_BRAZO);

        // Canal B (tablero vertical entra por Z)
        translate([0, PARED, PARED])
            rotate([0, 0, -90])
                translate([-LARGO_BRAZO, 0, 0])
                    canal_tablero(PROFUNDIDAD_CANAL, LARGO_BRAZO);
    }

    // Nervios en canal A
    translate([PARED, 0, PARED])
        nervios_anti_rotacion(PROFUNDIDAD_CANAL, LARGO_BRAZO);

    // Nervios en canal B
    translate([0, PARED, PARED])
        rotate([0, 0, -90])
            translate([-LARGO_BRAZO, 0, 0])
                nervios_anti_rotacion(PROFUNDIDAD_CANAL, LARGO_BRAZO);

    // Snap-fits canal A
    translate([0, 0, PARED])
        snap_pair(PROFUNDIDAD_CANAL, LARGO_BRAZO);
}

// --- ESQUINA-3D: conecta 3 tableros mutuamente perpendiculares ---
module esquina_3d() {
    alto_total = PROFUNDIDAD_CANAL + PARED;

    difference() {
        union() {
            // Bloque base con los 3 brazos
            // Brazo X
            cube([LARGO_BRAZO, ANCHO_EXTERIOR, alto_total]);
            // Brazo Y
            cube([ANCHO_EXTERIOR, LARGO_BRAZO, alto_total]);
            // Columna Z (el tercer tablero va por arriba)
            cube([ANCHO_EXTERIOR, ANCHO_EXTERIOR, PROFUNDIDAD_CANAL + PARED + PROFUNDIDAD_CANAL]);

            // Refuerzo esquina X-Y
            translate([ANCHO_EXTERIOR, ANCHO_EXTERIOR, 0])
                linear_extrude(alto_total)
                    polygon([[0,0],[8,0],[0,8]]);
        }

        // Canal X (tablero entra por Z, recorre X)
        translate([0, PARED, PARED])
            cube([LARGO_BRAZO, ANCHO_CANAL, PROFUNDIDAD_CANAL + 0.01]);

        // Canal Y (tablero entra por Z, recorre Y)
        translate([PARED, 0, PARED])
            cube([ANCHO_CANAL, LARGO_BRAZO, PROFUNDIDAD_CANAL + 0.01]);

        // Canal Z (tablero entra por arriba, se aloja en la columna)
        translate([PARED, PARED, alto_total])
            cube([ANCHO_CANAL, ANCHO_CANAL, PROFUNDIDAD_CANAL + 0.01]);
    }

    // Nervios canal X
    translate([0, PARED, PARED])
        for (cara = [0, 1]) {
            for (i = [0 : RIB_CANTIDAD - 1]) {
                espaciado = (LARGO_BRAZO - RIB_CANTIDAD * RIB_LARGO) / (RIB_CANTIDAD + 1);
                pos_x = espaciado + i * (RIB_LARGO + espaciado);
                pos_y = cara == 0 ? -RIB_ALTURA : ANCHO_CANAL;
                translate([pos_x, pos_y, PROFUNDIDAD_CANAL * 0.2])
                    cube([RIB_LARGO, RIB_ALTURA, PROFUNDIDAD_CANAL * 0.6]);
            }
        }

    // Nervios canal Y
    translate([PARED, 0, PARED])
        nervios_anti_rotacion(PROFUNDIDAD_CANAL, LARGO_BRAZO);
}

// --- T-INTERIOR: un tablero pasa de largo, otro entra perpendicular ---
module t_interior() {
    alto_total = PROFUNDIDAD_CANAL + PARED;

    difference() {
        union() {
            // Cuerpo principal (el tablero que pasa de largo, a lo largo de Y)
            cube([ANCHO_EXTERIOR, LARGO_BRAZO, alto_total]);

            // Brazo perpendicular (la balda que entra por un lado)
            translate([0, LARGO_BRAZO/2 - ANCHO_EXTERIOR/2, 0])
                cube([LARGO_BRAZO, ANCHO_EXTERIOR, alto_total]);
        }

        // Canal pasante (tablero largo, de punta a punta en Y)
        translate([PARED, -0.01, PARED])
            cube([ANCHO_CANAL, LARGO_BRAZO + 0.02, PROFUNDIDAD_CANAL + 0.01]);

        // Canal ciego perpendicular (balda, entra por +X)
        translate([ANCHO_EXTERIOR, LARGO_BRAZO/2 - ANCHO_CANAL/2, PARED])
            cube([LARGO_BRAZO - ANCHO_EXTERIOR + 0.01, ANCHO_CANAL, PROFUNDIDAD_CANAL + 0.01]);
    }

    // Nervios canal pasante
    translate([PARED, 0, PARED])
        nervios_anti_rotacion(PROFUNDIDAD_CANAL, LARGO_BRAZO);

    // Nervios canal ciego
    translate([ANCHO_EXTERIOR, LARGO_BRAZO/2 - ANCHO_CANAL/2, PARED])
        for (cara = [0, 1]) {
            for (i = [0 : RIB_CANTIDAD - 1]) {
                largo_brazo_perp = LARGO_BRAZO - ANCHO_EXTERIOR;
                espaciado = (largo_brazo_perp - RIB_CANTIDAD * RIB_LARGO) / (RIB_CANTIDAD + 1);
                pos_x = espaciado + i * (RIB_LARGO + espaciado);
                pos_y = cara == 0 ? -RIB_ALTURA : ANCHO_CANAL;
                translate([pos_x, pos_y, PROFUNDIDAD_CANAL * 0.2])
                    cube([RIB_LARGO, RIB_ALTURA, PROFUNDIDAD_CANAL * 0.6]);
            }
        }
}

// --- SOPORTE-BALDA: pin de 5mm + labio de retención ---
module soporte_balda() {
    // Base circular
    cylinder(d=BALDA_BASE, h=PARED);

    // Pin (estándar europeo 5mm)
    translate([0, 0, PARED])
        cylinder(d=BALDA_PIN_DIAM - 0.1, h=BALDA_PIN_LARGO);

    // Labio de apoyo para la balda
    translate([0, 0, PARED]) {
        difference() {
            cylinder(d=BALDA_BASE, h=BALDA_LABIO);
            // Recorte para que la balda apoye en un arco, no círculo completo
            translate([-BALDA_BASE, -BALDA_BASE, -0.01])
                cube([BALDA_BASE * 2, BALDA_BASE * 0.6, BALDA_LABIO + 0.02]);
        }
    }
}

// --- RECTO: une 2 tableros en línea (prolongación) ---
module recto() {
    alto_total = PROFUNDIDAD_CANAL + PARED;
    largo_total = LARGO_BRAZO * 2;

    difference() {
        // Cuerpo
        cube([ANCHO_EXTERIOR, largo_total, alto_total]);

        // Canal A (primer tablero entra por un lado)
        translate([PARED, -0.01, PARED])
            cube([ANCHO_CANAL, LARGO_BRAZO + 0.01, PROFUNDIDAD_CANAL + 0.01]);

        // Canal B (segundo tablero entra por el otro lado)
        translate([PARED, LARGO_BRAZO, PARED])
            cube([ANCHO_CANAL, LARGO_BRAZO + 0.01, PROFUNDIDAD_CANAL + 0.01]);
    }

    // Nervios canal A
    translate([PARED, 0, PARED])
        nervios_anti_rotacion(PROFUNDIDAD_CANAL, LARGO_BRAZO);

    // Nervios canal B
    translate([PARED, LARGO_BRAZO, PARED])
        nervios_anti_rotacion(PROFUNDIDAD_CANAL, LARGO_BRAZO);

    // Snap-fits canal A
    translate([0, 0, PARED])
        snap_pair(PROFUNDIDAD_CANAL, LARGO_BRAZO);

    // Snap-fits canal B
    translate([0, LARGO_BRAZO, PARED])
        snap_pair(PROFUNDIDAD_CANAL, LARGO_BRAZO);
}

// --- TAPÓN: cierra el extremo visible de un tablero ---
module tapon() {
    alto_total = PROFUNDIDAD_CANAL + PARED;
    largo_tapon = 25;  // mm — solo necesita cubrir el canto

    difference() {
        // Cuerpo con borde redondeado
        hull() {
            cube([ANCHO_EXTERIOR, largo_tapon, alto_total - 1]);
            translate([1, 0, alto_total - 1])
                cube([ANCHO_EXTERIOR - 2, largo_tapon, 1]);
        }

        // Canal (el tablero entra por un lado)
        translate([PARED, -0.01, PARED])
            cube([ANCHO_CANAL, largo_tapon * 0.7, PROFUNDIDAD_CANAL + 0.01]);
    }

    // Nervios
    translate([PARED, 0, PARED])
        nervios_anti_rotacion(PROFUNDIDAD_CANAL, largo_tapon * 0.7);

    // Un par de snaps
    translate([0, 0, PARED])
        snap_pair(PROFUNDIDAD_CANAL, largo_tapon * 0.7);
}

// --- UNIÓN VERTICAL: conecta tablero horizontal con vertical (suelo/techo) ---
module union_vertical() {
    alto_total = PROFUNDIDAD_CANAL + PARED;

    difference() {
        union() {
            // Base (tablero horizontal — suelo/techo)
            cube([ANCHO_EXTERIOR, LARGO_BRAZO, alto_total]);

            // Columna (tablero vertical — lateral)
            translate([0, 0, alto_total])
                cube([ANCHO_EXTERIOR, ANCHO_EXTERIOR, PROFUNDIDAD_CANAL]);

            // Refuerzo triangular
            translate([0, ANCHO_EXTERIOR, alto_total])
                linear_extrude(height=1)
                    polygon([
                        [0, 0],
                        [0, 10],
                        [ANCHO_EXTERIOR, 0],
                        [ANCHO_EXTERIOR, 10]
                    ]);
        }

        // Canal horizontal (tablero suelo/techo)
        translate([PARED, -0.01, PARED])
            cube([ANCHO_CANAL, LARGO_BRAZO + 0.02, PROFUNDIDAD_CANAL + 0.01]);

        // Canal vertical (tablero lateral, entra desde arriba)
        translate([PARED, PARED, alto_total])
            cube([ANCHO_CANAL, ANCHO_CANAL, PROFUNDIDAD_CANAL + 0.01]);
    }

    // Nervios canal horizontal
    translate([PARED, 0, PARED])
        nervios_anti_rotacion(PROFUNDIDAD_CANAL, LARGO_BRAZO);
}

// --- TORRE DE CALIBRACIÓN ---
module calibracion() {
    pasos = 8;
    juego_min = 0.05;
    juego_paso = 0.05;
    ancho_celda = 20;
    largo_celda = 25;
    alto = 16;   // simula el espesor del tablero
    base = 3;

    // Base con etiquetas
    cube([ancho_celda * pasos + 10, largo_celda + 20, base]);

    for (i = [0 : pasos - 1]) {
        juego = juego_min + i * juego_paso;
        ancho_ranura = ESPESOR_TABLERO + 2 * juego;
        pos_x = 5 + i * ancho_celda;

        // Paredes de la ranura
        translate([pos_x, 5, base]) {
            // Pared izquierda
            cube([3, largo_celda, alto]);
            // Pared derecha
            translate([3 + ancho_ranura, 0, 0])
                cube([3, largo_celda, alto]);
        }

        // Etiqueta numérica (juego en mm ×100 para leer entero)
        translate([pos_x + ancho_celda/2, largo_celda + 12, base])
            linear_extrude(1)
                text(str(juego * 1000 / 10), size=5, halign="center", valign="center");
    }

    // Tablero de prueba (para insertar en cada ranura)
    translate([0, largo_celda + 25, 0]) {
        cube([ESPESOR_TABLERO, largo_celda, alto]);
        // Etiqueta
        translate([ESPESOR_TABLERO/2, largo_celda + 5, 0])
            linear_extrude(1)
                text("16mm", size=4, halign="center");
    }
}

// ══════════════════════════════════════════════════════════════
// RENDER (según PIEZA seleccionada)
// ══════════════════════════════════════════════════════════════

if (PIEZA == "esquina_l")       esquina_l();
if (PIEZA == "esquina_3d")      esquina_3d();
if (PIEZA == "t_interior")      t_interior();
if (PIEZA == "soporte_balda")   soporte_balda();
if (PIEZA == "recto")           recto();
if (PIEZA == "tapon")           tapon();
if (PIEZA == "union_vertical")  union_vertical();
if (PIEZA == "calibracion")     calibracion();
