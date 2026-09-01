ADN Enki: módulos=islas SOLO eventos; dominio DENTRO del módulo, NUNCA _shared.
§
Paco: NUNCA Hermes provider; salto único; relay sin tools; Claude Code fuera.
§
Skill enki-operacion-proyecto: permisos g+w en deploy.sh (paso 3.5), MQTT a chats, repo simlink, skills proyecto en cantera (no solo arsenal).
§
Deploy lo ejecuta PACO (yo mergeo, verifico, le paso el comando; mi sudo en background pide TTY y muere). Menú deploy acumulado de tandas.
§
Ciclo v2 CERRADO (21 mod, PRs 395-420): +marca-cliente·calendario·mise-en-place. carta-scheduler EXCLUIDO. proceso-negocio 6½/7 empujan crear-blueprint-jefe v2. Compilador Svelte NO detecta imports no exportados — Vite sí.
§
scripts/crear-agente.js — wizard interactivo de agentes; genera en cúpula agentes/.
§
Paco prefiere respuestas directas sin sobre-preguntar. Si ya tengo contexto para decidir, decido.
§
Blueprint interfaz (deriveZones): ui.ops objeto clave→acción, ui.datos objeto, eventos_que_escucho string[]; ref:'<mod>.<acc>' = select dinámico (ref_label/ref_value); NO arrays en ui.ops. Refs: lotes, variaciones, productos.
§
motor-hermes ACTIVO :8130 (447 tools, ENKI_BRIDGE_URL en unit gateway); fixes PR #361.
§
generar-blueprint.js escribe en raíz→mover a vertical. Build /opt SIEMPRE como www-data; dueños mixtos→chown -R www-data antes.
§
carta-manager muta por RPC EVENTO (carta.update_product.request↔.response), sin ui_handlers. Reglas variación en CARTA; precio extra en ingredientes (update_precios: alcance+fijo/%, 1 señal/ingrediente); tarifas=canal→carta; productos=proyector.
§
core-a en source_core/logs = el PROPIO core de Enki (id en /opt/enki/data/config.json), NO un atacante externo.
§
despacho-de-pan RESET a fase 0 (31-ago-2026, Paco): borrado trabajo chat (mod entrega-despacho duplicaba a entrega; handlers Freno 1 en 3 rutas; job scheduler bucle llenó disco). Queda fase0-identidad-negocio.json. Backup /tmp/despacho-chat-backup-20260831. skill manual despacho-de-pan-setup obsoleto.
§
Recursos(31-ago): OpenClaw gateway(~490MB) y motor-voz(~423MB,:8124) DESHABILITADOS; voz on-demand `systemctl start/stop motor-voz`. core-a=core Enki. RAM libre ~1.2→~2Gi.