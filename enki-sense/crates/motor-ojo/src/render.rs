//! El render puro — sin red, sin estado, determinista. La `fuente` universal es
//! SVG (markup); `tipo` decide el destino:
//!   - imagen → SVG rasterizado a PNG (resvg + tiny-skia)
//!   - pdf    → SVG a PDF (svg2pdf)
//!   - svg    → SVG parseado y re-serializado (usvg optimiza/normaliza)
//!
//! HONESTIDAD (verdad_obligatoria del molde): si no puede, devuelve `Err(String)`
//! con el motivo — nunca inventa bytes. main.rs lo traduce a `{ fallo }`.

/// Resultado del render: los bytes y su extensión canónica.
pub struct Rendered {
    pub bytes: Vec<u8>,
    pub ext: &'static str,
}

/// Base de fuentes del sistema, cargada UNA vez (escanear disco es caro). Sin
/// ella el texto de un SVG no renderiza (carta/factura lo necesitan).
fn fontdb() -> std::sync::Arc<usvg::fontdb::Database> {
    use std::sync::OnceLock;
    static DB: OnceLock<std::sync::Arc<usvg::fontdb::Database>> = OnceLock::new();
    DB.get_or_init(|| {
        let mut db = usvg::fontdb::Database::new();
        db.load_system_fonts();
        std::sync::Arc::new(db)
    })
    .clone()
}

/// Renderiza `fuente` (SVG) al `tipo` pedido. `_opts` reservado (tamaño/dpi/fondo).
pub fn render(tipo: &str, fuente: &str, _opts: &serde_json::Value) -> Result<Rendered, String> {
    // Parseo único de la fuente (una frontera, no N), con las fuentes del sistema.
    let opt = usvg::Options { fontdb: fontdb(), ..Default::default() };
    let tree = usvg::Tree::from_str(fuente, &opt)
        .map_err(|e| format!("SVG inválido: {e}"))?;

    match tipo {
        "imagen" => rasterizar_png(&tree),
        "pdf" => a_pdf(&tree),
        "svg" => Ok(Rendered { bytes: tree.to_string(&usvg::WriteOptions::default()).into_bytes(), ext: "svg" }),
        otro => Err(format!("tipo desconocido: {otro} (usa svg | pdf | imagen)")),
    }
}

fn rasterizar_png(tree: &usvg::Tree) -> Result<Rendered, String> {
    let size = tree.size().to_int_size();
    let (w, h) = (size.width(), size.height());
    if w == 0 || h == 0 {
        return Err("el SVG no tiene dimensiones renderizables".into());
    }
    let mut pixmap = tiny_skia::Pixmap::new(w, h)
        .ok_or_else(|| format!("no pude crear el lienzo {w}x{h}"))?;
    resvg::render(tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    let bytes = pixmap.encode_png().map_err(|e| format!("encode PNG falló: {e}"))?;
    Ok(Rendered { bytes, ext: "png" })
}

fn a_pdf(tree: &usvg::Tree) -> Result<Rendered, String> {
    let bytes = svg2pdf::to_pdf(
        tree,
        svg2pdf::ConversionOptions::default(),
        svg2pdf::PageOptions::default(),
    )
    .map_err(|e| format!("SVG→PDF falló: {e}"))?;
    Ok(Rendered { bytes, ext: "pdf" })
}
