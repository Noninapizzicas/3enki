// ============================================================
// CONECTORES UNIVERSALES PARA TABLEROS — 16mm (paramétrico)
// L · T · X · Recto — con pestañas de presión + taladros tornillo
// Material: PETG · Máquina: Creality SPARKX i7
// ============================================================

// ===== PARÁMETROS (edita aquí) =====
grosor_tablero = 16;      // mm — grosor del tablero (melamina, contrachapado...)
holgura        = 0.4;     // mm — holgura de ajuste (0.3-0.5 para PETG)
pared          = 3.0;     // mm — grosor de pared del conector
ancho_brazo    = 20;      // mm — ancho del brazo que abraza el tablero
prof_brazo     = 25;      // mm — profundidad del brazo (cuánto abraza)
pestana        = 1.2;     // mm — grosor de la pestaña de presión
pestana_altura = 4.0;     // mm — altura de la pestaña
taladro_d      = 4.4;     // mm — Ø taladro para tornillo autorroscante
taladro_off    = 8;       // mm — distancia del taladro al borde
$fn = 60;

// ===== DERIVADOS =====
canal = grosor_tablero + holgura;   // ancho del canal que abraza el tablero
alto  = canal + 2*pared;            // alto total del conector

// ============================================================
// MÓDULO: canal con pestañas de presión (abraza el tablero)
// longitud = cuánto abraza (prof_brazo para un brazo, 2*prof_brazo para empalme)
// ============================================================
module canal_presion(longitud = prof_brazo) {
    difference() {
        // cuerpo del canal (U invertida)
        union() {
            cube([ancho_brazo, longitud, alto]);                       // base
            translate([0, 0, 0]) cube([pared, longitud, alto]);        // pared izq
            translate([ancho_brazo-pared, 0, 0]) cube([pared, longitud, alto]); // pared der
        }
        // vaciado del canal (donde entra el tablero)
        translate([pared, -0.1, pared])
            cube([ancho_brazo-2*pared, longitud+0.2, canal]);
    }
    // pestañas de presión (clips elásticos) en las paredes
    translate([pared, longitud/2 - pestana_altura/2, alto - pestana])
        cube([ancho_brazo-2*pared, pestana_altura, pestana]);
    translate([pared, longitud/2 - pestana_altura/2, pared - pestana])
        cube([ancho_brazo-2*pared, pestana_altura, pestana]);
}

// ============================================================
// MÓDULO: taladros para tornillo (a lo largo del brazo)
// ============================================================
module taladros(longitud = prof_brazo) {
    translate([ancho_brazo/2, taladro_off, alto/2])
        rotate([90, 0, 0]) cylinder(d=taladro_d, h=longitud+1, center=true);
    translate([ancho_brazo/2, longitud-taladro_off, alto/2])
        rotate([90, 0, 0]) cylinder(d=taladro_d, h=longitud+1, center=true);
}

// ============================================================
// CONECTOR L (esquina) — dos canales a 90°
// ============================================================
module conector_L() {
    difference() {
        union() {
            canal_presion();
            rotate([0, 0, 90])
                translate([0, -prof_brazo, 0])
                    canal_presion();
            // refuerzo de esquina
            translate([0, 0, 0])
                cube([pared, pared, alto]);
        }
        taladros();
    }
}

// ============================================================
// CONECTOR T (balda entra en lateral) — canal central + 2 laterales
// ============================================================
module conector_T() {
    difference() {
        union() {
            canal_presion();
            // brazo central (la balda)
            rotate([0, 0, 90])
                translate([0, -prof_brazo, 0])
                    canal_presion();
            // brazo opuesto
            rotate([0, 0, -90])
                translate([0, 0, 0])
                    canal_presion();
        }
        taladros();
    }
}

// ============================================================
// CONECTOR X (cruce de dos tableros) — 4 brazos
// ============================================================
module conector_X() {
    difference() {
        union() {
            canal_presion();
            rotate([0, 0, 90])  translate([0, -prof_brazo, 0]) canal_presion();
            rotate([0, 0, 180]) translate([0, -prof_brazo, 0]) canal_presion();
            rotate([0, 0, -90]) translate([0, 0, 0]) canal_presion();
        }
        taladros();
    }
}

// ============================================================
// CONECTOR RECTO (empalme en línea) — canal largo que abraza ambos
// ============================================================
module conector_recto() {
    difference() {
        canal_presion(2*prof_brazo);
        taladros(2*prof_brazo);
    }
}

// ============================================================
// SELECCIÓN — cambia el tipo aquí
// ============================================================
tipo = "L";  // "L" | "T" | "X" | "RECTO"

if (tipo == "L")     conector_L();
if (tipo == "T")     conector_T();
if (tipo == "X")     conector_X();
if (tipo == "RECTO") conector_recto();
