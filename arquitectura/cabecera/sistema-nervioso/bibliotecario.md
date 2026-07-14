---
id: sistema-nervioso/bibliotecario
dominio: aprendizaje
resumen: El puente a la biblioteca EXTERNA (repo Conocimiento): mirror git de solo-lectura de la bóveda Obsidian, servido por el bus como catálogo barato + préstamo bajo demanda. Reach-not-resident — el agente pide los libros que necesita, no carga el corpus.
fuentes:
  - modules/bibliotecario/**
  - tests/unit/bibliotecario.test.js
verificado: 2026-07-14
---

# BIBLIOTECARIO — el puente a la biblioteca externa (hermano de la cantera · nace 2026-07-14)

> La CANTERA aloja el saber del **sistema** (skills: cómo se construye/opera 2enki). El
> BIBLIOTECARIO aloja el saber del **mundo** — la *bóveda* Obsidian del repo externo
> `Noninapizzicas/Conocimiento` (sectores: trading, cultivo, refrigeración, comercio…), notas
> markdown enlazadas que el agente `acumulador-sectorial` cosecha y fecha para envejecer con
> honestidad. **Los dos substratos NO se fusionan:** el código del sistema vive en 2enki; el saber
> del mundo vive en su propio repo. El bibliotecario los une por un **PRÉSTAMO, no por una copia** —
> mantiene un mirror git de solo-lectura y sirve las notas por el bus. Módulo:
> `modules/bibliotecario/` ({{version:modules/bibliotecario}}).

## El principio: reach-not-resident

El agente/skill arranca **ligero** y pide prestados solo los libros que la tarea justifica. El saber
está *al alcance*, no *residente* en su contexto — el patrón cajones aplicado a una biblioteca entera:

- **Catálogo** (barato, siempre a mano): sectores + título del MOC + recuento. No abre las notas.
- **Libro** (caro, bajo demanda): la nota concreta, pedida aparte cuando la tarea la bebe.

> *«Una lente solo entra cuando hay página que la beba»* — aquí: el libro entra al alcance del
> agente que de verdad lo va a leer, y por recuperación, no residente.

## El órgano (reflejo puro, hermano de la cosecha)

```json
{
  "esquema": "bibliotecario-v1",
  "memoria": "mirror git de solo-lectura en data/bibliotecario/mirror (clone --depth 1 de Conocimiento)",
  "libro": { "ruta", "titulo", "sector", "cosechado", "dudoso", "cuerpo" },
  "puertas_bus": {
    "bibliotecario.catalogo":    "{} → { sectores:[{sector,titulo,notas,dudosos}], total, stale }",
    "bibliotecario.prestamo":    "{sector} por_referencia (determinista) · {consulta,topK?} por_significado",
    "bibliotecario.sincronizar": "{} → git pull + reindex + emite bibliotecario.actualizada"
  },
  "tools_llm": {
    "biblioteca_catalogo":  "qué saber hay (barato, antes de pedir)",
    "biblioteca_consultar": "pide los libros — por sector o por consulta natural"
  },
  "reparto_de_alcance": {
    "por_referencia": "sector[/nota] → sus notas exactas (coste cero de cómputo)",
    "por_significado": "consulta → top-K; HOY degrada a PALABRAS (BM25-lite), lo declara en `por`; el significado real llega al indexar el vault en cantera-semantica"
  }
}
```

## Degradación honesta (como el feeder / cantera-semantica)

El límite protege un estado nombrable: *la biblioteca siempre responde, nunca cuelga, nunca miente*.

- **Mirror ausente + clone falla** (sin credencial de solo-lectura al repo privado, o sin red) →
  `stale: true` + `motivo`; sirve del último mirror bueno o catálogo vacío. No bloquea el arranque.
- **`pull` falla** en `sincronizar` → sigue sirviendo el mirror anterior, marca `stale`.
- **`por_significado` sin índice semántico** → cae a palabras y lo declara (`por: 'palabras'`).
- **Dato `⚠️ a verificar`** de la nota → viaja como `Libro.dudoso`; el agente no lo da por firme.

## El grafo del préstamo (topics + QoS)

| flujo | topic | QoS |
|---|---|---|
| pedir catálogo | `core/<id>/api/request/biblioteca/catalogo` | 1 |
| pedir préstamo | `core/<id>/api/request/biblioteca/prestamo` | 1 |
| respuesta | `core/<id>/api/response/<request_id>` | 1 |
| biblioteca actualizada | `core/<id>/events/biblioteca/actualizada` | 1 |

## Trabajo pendiente (declarado, no oculto)

- **Credencial de solo-lectura** al repo privado `Conocimiento` en el VPS (deploy-key/token) — sin
  ella el mirror degrada a `stale`.
- **Indexar el vault en `cantera-semantica`** → `por_significado` pasa de palabras a significado real.
- **Webhook de push** de `Conocimiento` → `sincronizar` automático (hoy el químico es el pull manual).
- **Escritura** (la cosecha del `acumulador-sectorial`) es flujo aparte: el bibliotecario solo LEE.
