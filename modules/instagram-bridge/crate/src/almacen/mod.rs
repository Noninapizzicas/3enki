//! `almacen` — lo que el aparato guarda mientras trabaja.
//!
//! En el plano de obra esta carpeta acaba teniendo el journal del paso en curso,
//! la cache de anclas vistas y el grabador de demostraciones. Hoy hay dos piezas:
//! `demostracion` (A4.2, bloque 3) y `anclas` (F1b, bloque 12).
//!
//! La regla que comparten todas las piezas de `almacen`: lo que se guarda es lo
//! que se VIO. Ni una ancla inventada, ni una consecuencia supuesta, ni un estado
//! que el aparato no pueda afirmar.

pub mod anclas;
pub mod demostracion;
