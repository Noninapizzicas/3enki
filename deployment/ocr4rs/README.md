# OCR4RS en el VPS — el órgano de OCR

El motor vive en el repo [ocr4rs](https://github.com/noninapizzicas/ocr4rs)
(Rust puro, imagen/PDF escaneado → texto). Aquí vive su **provisioning**: el
compose que lo trae al VPS como `enki-ocr4rs`. El consumidor es el puente
`modules/ocr4rs` (bus↔HTTP), que ya apunta a `127.0.0.1:8090`.

Es el **hermano físico** de Crawl4RS: cada uno una imagen independiente, se
encuentran en el bus de Enki. Crawl4RS lee la web; OCR4RS, lo fotografiado.

## Las dos alas de la evidencia externa (prisma-del-caso)

Una afirmación externa entra por la ley de la evidencia con su dirección de
vuelta. Hay dos:

| Evidencia vive en… | Órgano | Dirección de vuelta |
|---|---|---|
| la web (HTML, PDF digital) | **crawl4rs** | `url` · `api_id` |
| el papel / la imagen | **ocr4rs** | la imagen (`path` + `sha256`) |

Juntos cubren toda la evidencia externa del mundo — un precio en la web lo lee
crawl4rs; el mismo precio en una etiqueta fotografiada lo lee ocr4rs.

## Instalación — la hace el setup

`sudo ./deployment/vps-setup.sh <dominio>` lo trae todo: clona `/opt/ocr4rs`,
descarga los modelos `.rten` una vez, crea la red `enki-web`, construye y
levanta `enki-ocr4rs`, y siembra su interruptor ON.

```bash
# verificar tras el setup
curl -s http://127.0.0.1:8090/health     # → {status:"ok", models_loaded:true}
docker logs enki-ocr4rs --tail 20
```

## Receta manual (plan B / debug)

```bash
git clone --depth 1 https://github.com/noninapizzicas/ocr4rs /opt/ocr4rs
cd /opt/ocr4rs && ./scripts/get-models.sh /opt/enki/data/ocr4rs-models
docker network create enki-web    # una vez (si no existe)
OCR4RS_MODELS_DIR=/opt/enki/data/ocr4rs-models \
  docker compose -f /opt/enki/deployment/ocr4rs/docker-compose.yml up -d --build
```

Sin modelos, `/ocr` responde 503 honesto y el puente lo prescribe (monta el
volumen). `leer/mapear/rastrear` de crawl4rs siguen — son órganos separados.

## Uso desde Enki

El puente **nace OFF**. Enciende el interruptor `ocr4rs` (panel, grupo sistema):

```js
// una imagen o PDF escaneado → texto + evidencia
const r = await bus.publishAndWait('ocr4rs.leer.request', {
  project_id, path: '/facturas/entrante/factura.jpg'
});
r.data.texto;              // el texto reconocido
r.data.evidencia;          // { path, sha256, source_kind } — la dirección de vuelta

// lote (patrón obrero: uno a uno, los fallidos no frenan)
const lote = await bus.publishAndWait('ocr4rs.leer_lote.request', {
  project_id, paths: ['/tickets/a.jpg', '/tickets/b.jpg']
});
```

Y desde el chat, el LLM tiene la tool **`leer_imagen`**.

Degradación honesta: OFF / sin servicio / sin modelos → `503 {degradado,
motivo}` con prescripción. PDF digital → `409` redirigido a crawl4rs (los
órganos se pasan el trabajo por el bus).

## Horizonte

El motor v0.0.1 aún no expone confianza por línea (`OcrLine` solo trae texto).
Cuando lo haga, el puente activa el gate `umbral_confianza` + el evento
`ocr4rs.baja_confianza.detectada` (ya declarados, latentes) — una línea bajo
umbral se marca, no se afirma cierta: el freno gemelo del "no inventar precio".
