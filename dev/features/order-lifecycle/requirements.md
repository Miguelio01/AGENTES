# Requerimientos: Ciclo de Vida del Pedido (Ventas -> Entrega)

Este documento detalla el flujo completo que debe seguir un pedido desde que el cliente lo solicita hasta que se registra en las hojas de entrega semanal/mensual.

## 1. Fase de Reconocimiento y Transformación
- **GIVEN** que el cliente solicita productos usando lenguaje natural (ej: "un kilo de fresas").
- **WHEN** Fresquitoh procesa el pedido.
- **THEN** debe transformar la solicitud a la presentación real del inventario (ej: "2 cajas de fresas 500g").
- **AND** debe confirmar explícitamente estas cantidades al cliente.

## 2. Fase de Liquidación y Domicilio
- **GIVEN** que el cliente confirmó los productos.
- **WHEN** se genera el total.
- **THEN** debe sumar (Subtotal Productos + Valor Domicilio).
- **AND** el valor del domicilio será una variable configurable (inicialmente fija, luego calculada).
- **AND** el pedido se registra en `Lista_prepago` con estado "POR CONFIRMAR".

## 3. Fase de Confirmación de Pago (Doble Validación)
- **GIVEN** que el cliente envía un comprobante (imagen o texto).
- **WHEN** el agente recibe el soporte.
- **THEN** debe notificar al usuario principal (Miguel).
- **AND** debe activar el escaneo de Gmail para buscar el correo de notificación bancaria/Nequi.
- **AND** marcar como "PAGADO" si alguna de las dos validaciones es exitosa.

## 4. Fase de Preparación y Notificación de Entrega
- **GIVEN** que el pago fue confirmado.
- **WHEN** el pedido pasa a preparación.
- **THEN** se notifica al cliente: "Su pedido se está alistando".
- **AND** se le informa la fecha de entrega (leída desde la celda de 'Fechas de Entrega' en el Excel de Inventario).

## 5. Fase de Registro en Entrega y Serialización
- **GIVEN** que el pedido está listo para despacho.
- **WHEN** se mueve a la hoja de entrega.
- **THEN** se debe registrar en una hoja con el nombre de la semana actual (ej: `Entrega_S20_2026`).
-**AND** se tomara como ejemplo la hora 'Lista_entrega' para geneara las hojas de entregas semanales 
- **AND** debe generar un Número de Envío único (Serial: `FRES-MES-AÑO-XXX`).
- **AND** incluir columnas: Cliente, Productos, Dirección, Zona, Serial, Entregado (Si/No).
- **AND** permitir el conteo mensual de pedidos entregados para historial de ventas.
