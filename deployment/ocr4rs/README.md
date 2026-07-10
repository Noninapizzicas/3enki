# OCR4RS en el VPS — el órgano de OCR (Rust NATIVO)

El motor vive en el repo [ocr4rs](https://github.com/noninapizzicas/ocr4rs)
(Rust puro, imagen/PDF escaneado → texto). Aquí vive su **provisioning**: el
servicio systemd `ocr4rs` en `127.0.0.1:8090`. El consumidor es el puente
`modules/ocr4rs` (bus↔HTTP).

Es el **hermano físico** de Crawl4RS: crawl4rs lee la web; ocr4rs, lo
fotografiado. Se encuentran en el bus de Enki.

## Por qué NATIVO (y no Docker, a diferencia de crawl4rs)

La regla de la casa reparte por NATURALEZA:

| Pieza | Dónde | Por qué |
|---|---|---|
| Rust puro (OCR4RS) | **NATIVO** (cargo + systemd) | binario limpio, cero dependencia sucia |
| Rust + Chromium (Crawl4RS) | Docker | Chromium es la dependencia sucia → contenida |
| Python (SearXNG, Headroom) | Docker | dependencias sucias contenidas |

OCR4RS no arrastra Chromium ni Python — es Rust estático puro → va nativo,
como fue fastcrw. Docker para él sería overhead sin razón.

## Las dos alas de la evidencia externa (prisma-del-caso)

| Evidencia vive en… | Órgano | Dirección de vuelta |
|---|---|---|
| la web (HTML, PDF digital) | **crawl4rs** | `url` · `api_id` |
| el papel / la imagen | **ocr4rs** | la imagen (`path` + `sha256`) |

## Instalación — la hace el setup, TODO dentro

`sudo ./deployment/vps-setup.sh <dominio>` lo trae todo (sección 3a-ter):
asegura el toolchain Rust si falta, clona `/opt/ocr4rs`, **compila** el binario
a `/usr/local/bin/ocr4rs`, baja los modelos `.rten` una vez, escribe el
servicio systemd, lo arranca y siembra el interruptor ON.

```bash
# verificar tras el setup
curl -s http://127.0.0.1:8090/health     # → {status:"ok", models_loaded:true}
sudo systemctl status ocr4rs
sudo journalctl -u ocr4rs -f
```

Actualizar el motor = volver a correr el setup (git pull + recompila).

## Receta manual (plan B / debug)

```bash
git clone --depth 1 https://github.com/noninapizzicas/ocr4rs /opt/ocr4rs
# toolchain Rust si falta:
command -v cargo || curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
cargo install --path /opt/ocr4rs/crates/ocr4rs-cli --root /usr/local --locked
/opt/ocr4rs/scripts/get-models.sh /opt/enki/data/ocr4rs-models
# systemd:
sed 's#__MODELS__#/opt/enki/data/ocr4rs-models#g' \
  /opt/enki/deployment/ocr4rs/ocr4rs.service > /etc/systemd/system/ocr4rs.service
systemctl daemon-reload && systemctl enable --now ocr4rs
```

Sin modelos, `/ocr` responde 503 honesto y el puente lo prescribe.

## Uso desde Enki

El puente **nace OFF**. Enciende el interruptor `ocr4rs` (panel, grupo sistema):

```js
const r = await bus.publishAndWait('ocr4rs.leer.request', {
  project_id, path: '/facturas/entrante/factura.jpg'
});
r.data.texto;        // el texto reconocido
r.data.evidencia;    // { path, sha256, source_kind } — la dirección de vuelta del prisma
```

Y desde el chat, el LLM tiene la tool **`leer_imagen`**. Degradación honesta:
OFF / sin servicio / sin modelos → `503 {degradado, motivo}`. PDF digital →
`409` redirigido a crawl4rs (los órganos se pasan el trabajo por el bus).

## Horizonte

El motor v0.0.1 aún no expone confianza por línea (`OcrLine` solo trae texto).
Cuando lo haga, el puente activa el gate `umbral_confianza` +
`ocr4rs.baja_confianza.detectada` (ya declarados, latentes).

**El setup ya prefiere el binario PREBUILT**: ocr4rs publica un musl estático
por tag (`release.yml`); vps-setup lo descarga (un fichero, sin toolchain) y
solo compila con cargo como fallback si no hay release. Para cortar el primer
release en ocr4rs: `git tag v0.1.0 && git push --tags`.
