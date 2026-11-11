//! `almacen` — lo que el aparato guarda mientras trabaja.
//!
//! En el plano de obra esta carpeta acaba teniendo el journal del paso en curso,
//! la cache de anclas vistas y el grabador de demostraciones. En el bloque 3 solo
//! existe `demostracion` (A4.2): el resto entra con los bloques 5 y 6, cuando
//! tengan quien los escriba.
//!
//! La regla que comparten todas las piezas de `almacen`: lo que se guarda es lo
//! que se VIO. Ni una ancla inventada, ni una consecuencia supuesta, ni un estado
//! que el aparato no pueda afirmar.

pub mod demostracion;
