# Apartados · Lógica — comportamiento de la web de consumo

> Cómo se conecta cada elemento a un evento del bus. Qué llama a qué.

## Recorrido (descubrir → elegir → convertir → repetir)

### 1. Descubrir (hero-promesa)
- **Evento**: leer catálogo (`catalogo.listar`) → muestra los productos.
- **Señal**: el catálogo cargado.

### 2. Elegir (tarjeta-item + selector-opciones)
- **Evento**: seleccionar producto + cantidad + franja (HOY/MAÑANA/PASADO).
- **Señal**: el precio se actualiza al elegir (señal > precio — el backend fija, la web muestra).

### 3. Convertir (flujo-pedido)
- **Evento**: crear pedido (`pedido.crear`) → pagar (`pago.iniciar`).
- **Señal**: "pedido confirmado" (el evento de confirmación re-lee la vista, nunca recarga).

### 4. Recoger (señal-confirmacion)
- **Evento**: aviso "listo para recoger" (`pedido.listo`).
- **Señal**: ancla por nombre del cliente (sin código).

### 5. Repetir (reenganche)
- **Evento**: recordatorio semanal "¿repites?" → replicar pedido guardado (`cuenta-recurrente.generar_semana`).
- **Señal**: el pedido de la semana generado (aplica 10%).

## Reglas de lógica
- **Un flujo responde siempre**: pedido → confirmado/fallo.
- **El precio lo fija el backend**; la web solo refleja.
- **Cero merma**: solo se hornea lo pagado.
- **La señal manda**: tras pedir/pagar, la vista espera el evento de confirmación.
