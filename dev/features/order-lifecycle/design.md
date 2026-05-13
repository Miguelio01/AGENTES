# Diseño Técnico: Ciclo de Vida del Pedido

## 1. Integración con Google Sheets
- **Variables Globales:** Leeremos la celda `H1` de la hoja `'Inventario '` para obtener las fechas de entrega de la semana.
- **Gestión de Hojas Dinámicas:** El `GoogleSheetsInventoryAdapter` debe implementar un método `getOrCreateWeeklySheet(baseName: string)` para crear hojas como `Entrega_S20_2026` si no existen.
- **Serialización:** El formato del serial será `FRES-${YYYY}-${MM}-${INDEX}` donde INDEX es el número de fila en la hoja de entrega.

## 2. Lógica de Agentes (A2A)
- **SalesAgent:** 
  - Recibe el `lastMessage` y los `availableProducts`.
  - Calcula el total incluyendo la clave `deliveryFee`.
- **FinanceAgent (Nuevo):**
  - Implementar `GmailAdapter` para buscar correos con el asunto o contenido relacionado a Nequi/Bancolombia y el valor del pedido.
  - Exponer acción `verify_payment`.
- **LogisticsAgent (Nuevo):**
  - Encargado de la transición de `Lista_prepago` a la hoja semanal de entrega.
  - Genera el serial de envío.

## 3. Flujo de Estados (Session Flow)
1. `IDLE` -> Mensaje de Pedido.
2. `LISTING` -> Muestra productos reales y pide confirmación.
3. `BILLING` -> Da total + domicilio y pide pago.
4. `AWAITING_PAYMENT_PROOF` -> Espera imagen.
5. `CONFIRMING_PAYMENT` -> (Background) Notifica Admin + Scanea Gmail.
6. `READY_FOR_DELIVERY` -> Notifica fecha y registra en hoja semanal.
