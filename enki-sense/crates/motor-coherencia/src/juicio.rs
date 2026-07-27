//! juicio — el JUEZ determinista de coherencia de operaciones. Puro, sin I/O.
//!
//! No prohíbe por categoría (eso sería un freno). VALORA la coherencia del acto:
//!   · crear un archivo, o escribir de cero → fluye, sin frenar.
//!   · una escritura que borra/trunca el contenido existente → pide CONFIRMACIÓN
//!     (con la info ampliada del porqué), NO se deniega. La confirmación la abre.
//!
//! Mismo input → mismo veredicto (constantes, sin azar, sin reloj): determinista.

use serde::{Deserialize, Serialize};

/// El nuevo pierde más de esta fracción del actual → sospecha de borrado.
const RATIO_ENCOGIMIENTO: f64 = 0.5;
/// Por debajo de esto, el archivo actual es "trivial": encogerlo no alarma.
const MIN_BYTES_SIGNIFICATIVO: usize = 64;

/// La operación de escritura a juzgar. `actual = None` → el archivo no existe (creación).
#[derive(Debug, Clone, Deserialize)]
pub struct OpEscritura {
    pub path: String,
    pub nuevo: String,
    #[serde(default)]
    pub actual: Option<String>,
    #[serde(default)]
    pub confirmado: bool,
}

/// Info ampliada que acompaña a una confirmación (diagnóstico fértil, nunca un "no" mudo).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Detalle {
    pub bytes_actual: usize,
    pub bytes_nuevo: usize,
    pub bytes_perdidos: i64,
    pub explicacion: String,
}

/// El veredicto. Dos caras: adelante, o confírmame esto (con el porqué).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "veredicto", rename_all = "snake_case")]
pub enum Veredicto {
    /// Coherente: adelante, sin frenar.
    Ok,
    /// Destructivo sin confirmar: NO se deniega — se pide confirmación con el motivo.
    Confirmar { motivo: String, detalle: Detalle },
}

/// El juez. Determinista y puro.
pub fn juzgar_escritura(op: &OpEscritura) -> Veredicto {
    // 1. Ya confirmado → la confirmación ABRE el paso. No se re-juzga.
    if op.confirmado {
        return Veredicto::Ok;
    }

    // 2. Creación (el archivo no existe) → crear NUNCA se frena.
    let actual = match &op.actual {
        None => return Veredicto::Ok,
        Some(a) => a,
    };

    let bytes_actual = actual.len();
    let bytes_nuevo = op.nuevo.len();

    // 3. Actual trivial (vacío o minúsculo) → cualquier escritura encima es coherente.
    if actual.trim().is_empty() || bytes_actual < MIN_BYTES_SIGNIFICATIVO {
        return Veredicto::Ok;
    }

    // 4. El nuevo CONSERVA lo actual (lo contiene) → extensión/append → coherente.
    if op.nuevo.contains(actual.as_str()) {
        return Veredicto::Ok;
    }

    let detalle = |explicacion: String| Detalle {
        bytes_actual,
        bytes_nuevo,
        bytes_perdidos: bytes_actual as i64 - bytes_nuevo as i64,
        explicacion,
    };

    // 5. BORRADO TOTAL: había contenido, el nuevo lo vacía.
    if op.nuevo.trim().is_empty() {
        return Veredicto::Confirmar {
            motivo: "borrado_total".into(),
            detalle: detalle(format!(
                "el archivo tiene {bytes_actual} bytes y la escritura lo deja vacío"
            )),
        };
    }

    // 6. JSON válido → inválido: romper la estructura de un .json que era válido (caso the-pirate).
    if op.path.to_lowercase().ends_with(".json")
        && serde_json::from_str::<serde_json::Value>(actual).is_ok()
        && serde_json::from_str::<serde_json::Value>(&op.nuevo).is_err()
    {
        return Veredicto::Confirmar {
            motivo: "json_roto".into(),
            detalle: detalle(
                "el archivo era JSON válido y la escritura lo deja mal formado".into(),
            ),
        };
    }

    // 7. TRUNCAMIENTO: el nuevo pierde más de la mitad del actual (y no lo conserva → punto 4).
    if (bytes_nuevo as f64) < (bytes_actual as f64) * RATIO_ENCOGIMIENTO {
        return Veredicto::Confirmar {
            motivo: "truncamiento".into(),
            detalle: detalle(format!(
                "la escritura reduce el archivo de {bytes_actual} a {bytes_nuevo} bytes; \
                 {} bytes de contenido desaparecen y no reaparecen en lo nuevo",
                bytes_actual - bytes_nuevo
            )),
        };
    }

    // 8. Reemplazo de tamaño coherente (crece o encoge poco) → adelante.
    Veredicto::Ok
}

#[cfg(test)]
mod tests {
    use super::*;

    fn op(path: &str, nuevo: &str, actual: Option<&str>, confirmado: bool) -> OpEscritura {
        OpEscritura {
            path: path.into(),
            nuevo: nuevo.into(),
            actual: actual.map(|s| s.into()),
            confirmado,
        }
    }

    #[test]
    fn creacion_fluye() {
        // archivo no existe → Ok, sin frenar
        assert_eq!(juzgar_escritura(&op("/x.txt", "hola", None, false)), Veredicto::Ok);
    }

    #[test]
    fn escribir_de_cero_sobre_vacio_fluye() {
        assert_eq!(juzgar_escritura(&op("/x.txt", "contenido nuevo", Some(""), false)), Veredicto::Ok);
    }

    #[test]
    fn extension_que_conserva_lo_actual_fluye() {
        let actual = "linea1\nlinea2\nlinea3\ncontenido que ocupa mas de 64 bytes de sobra aqui";
        let nuevo = format!("{actual}\nlinea4");
        assert_eq!(juzgar_escritura(&op("/log.txt", &nuevo, Some(actual), false)), Veredicto::Ok);
    }

    #[test]
    fn reemplazo_de_tamano_similar_fluye() {
        let actual = "un contenido cualquiera con bastantes bytes para pasar el minimo significativo del juez";
        let nuevo = "otro contenido distinto pero de tamano parecido, igualmente por encima del minimo del juez";
        assert_eq!(juzgar_escritura(&op("/x.txt", nuevo, Some(actual), false)), Veredicto::Ok);
    }

    #[test]
    fn borrado_total_pide_confirmacion() {
        let actual = "un archivo con contenido real que ocupa claramente mas de sesenta y cuatro bytes";
        match juzgar_escritura(&op("/x.txt", "", Some(actual), false)) {
            Veredicto::Confirmar { motivo, .. } => assert_eq!(motivo, "borrado_total"),
            v => panic!("esperaba Confirmar borrado_total, fue {v:?}"),
        }
    }

    #[test]
    fn truncamiento_pide_confirmacion() {
        let actual = "esta es una linea larga\n".repeat(20); // ~480 bytes
        match juzgar_escritura(&op("/x.txt", "x", Some(&actual), false)) {
            Veredicto::Confirmar { motivo, detalle } => {
                assert_eq!(motivo, "truncamiento");
                assert!(detalle.bytes_perdidos > 0);
            }
            v => panic!("esperaba Confirmar truncamiento, fue {v:?}"),
        }
    }

    #[test]
    fn romper_json_valido_pide_confirmacion() {
        let actual = r#"{"productos": [1,2,3], "marca": "nonina", "relleno": "para pasar el minimo de bytes del juez sobradamente"}"#;
        // the-pirate: truncar el json a basura mal formada
        match juzgar_escritura(&op("/recetas.json", r#"{"productos": [1,2"#, Some(actual), false)) {
            Veredicto::Confirmar { motivo, .. } => assert_eq!(motivo, "json_roto"),
            v => panic!("esperaba Confirmar json_roto, fue {v:?}"),
        }
    }

    #[test]
    fn json_valido_a_valido_fluye() {
        let actual = r#"{"a": 1, "relleno": "texto para superar el minimo de bytes significativo del juez sin problema"}"#;
        let nuevo = r#"{"a": 2, "relleno": "texto para superar el minimo de bytes significativo del juez sin problema"}"#;
        assert_eq!(juzgar_escritura(&op("/d.json", nuevo, Some(actual), false)), Veredicto::Ok);
    }

    #[test]
    fn confirmado_abre_el_paso() {
        // el mismo borrado total, pero confirmado → Ok. La confirmación abre.
        let actual = "un archivo con contenido real que ocupa mas de sesenta y cuatro bytes de sobra";
        assert_eq!(juzgar_escritura(&op("/x.txt", "", Some(actual), true)), Veredicto::Ok);
    }

    #[test]
    fn encoger_un_archivo_trivial_fluye() {
        // actual < 64 bytes → trivial → no alarma aunque encoja
        assert_eq!(juzgar_escritura(&op("/x.txt", "a", Some("hola mundo"), false)), Veredicto::Ok);
    }
}
