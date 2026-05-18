# Tareas: Implementación del Ciclo de Vida del Pedido

## Hito 1: Refinamiento de Conversión y Precios
- [x] 1.1 Modificar `SalesAgent` para incluir `deliveryFee` en el cálculo del total.
- [x] 1.2 Actualizar `VoiceAgent` para que mencione el costo de domicilio y el total consolidado.
- [x] 1.3 Implementar lectura de "Fecha de Entrega" desde `Inventario!H1`.

## Hito 2: Gestión de Hojas Semanales y Seriales
- [x] 2.1 Actualizar `GoogleSheetsInventoryAdapter` para soportar nombres de hojas dinámicos (basados en fecha/semana).
- [x] 2.2 Crear lógica de generación de seriales `FRES-YYYY-MM-XXX`.
- [x] 2.3 Implementar el método para mover registros de `Lista_prepago` a la hoja semanal de entrega.

## Hito 3: Finance Agent (Validación Dual)
- [x] 3.1 Crear el `FinanceAgentService`.
- [x] 3.2 Implementar el `GmailAdapter` en la capa de infraestructura.
- [x] 3.3 Conectar la recepción de comprobantes en WhatsApp con la validación automática de Gmail.

## Hito 4: Notificaciones y Cierre
- [x] 4.1 Notificar al cliente la confirmación definitiva del pedido y la fecha de entrega.
- [x] 4.2 Agregar la columna de "Entregado (Si/No)" con validación en el Excel.
