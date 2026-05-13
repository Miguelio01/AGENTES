# Tareas: Implementación del Ciclo de Vida del Pedido

## Hito 1: Refinamiento de Conversión y Precios
- [ ] 1.1 Modificar `SalesAgent` para incluir `deliveryFee` en el cálculo del total.
- [ ] 1.2 Actualizar `VoiceAgent` para que mencione el costo de domicilio y el total consolidado.
- [ ] 1.3 Implementar lectura de "Fecha de Entrega" desde `Inventario!H1`.

## Hito 2: Gestión de Hojas Semanales y Seriales
- [ ] 2.1 Actualizar `GoogleSheetsInventoryAdapter` para soportar nombres de hojas dinámicos (basados en fecha/semana).
- [ ] 2.2 Crear lógica de generación de seriales `FRES-YYYY-MM-XXX`.
- [ ] 2.3 Implementar el método para mover registros de `Lista_prepago` a la hoja semanal de entrega.

## Hito 3: Finance Agent (Validación Dual)
- [ ] 3.1 Crear el `FinanceAgentService`.
- [ ] 3.2 Implementar el `GmailAdapter` en la capa de infraestructura.
- [ ] 3.3 Conectar la recepción de comprobantes en WhatsApp con la validación automática de Gmail.

## Hito 4: Notificaciones y Cierre
- [ ] 4.1 Notificar al cliente la confirmación definitiva del pedido y la fecha de entrega.
- [ ] 4.2 Agregar la columna de "Entregado (Si/No)" con validación en el Excel.
