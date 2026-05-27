import { Order, OrderItem } from '../entities/order.entity';

export const INVENTORY_PROVIDER_PORT = 'IInventoryProvider';

export interface ProductInventory {
  id: string;
  name: string;
  stock: number;
  price: number;
  weightGrams?: number;
  unitsPerPackage?: number;
  packagingType?: string;
  description?: string;
}

export interface InventoryCheckData {
  items: Array<{
    product: string;
    quantity: number;
    unit?: string;
  }>;
  // Compatibilidad con lógica anterior
  productName?: string;
  requestedQuantity?: number;
}

export interface InventoryCheckResult {
  available: boolean;
  items?: Array<{
    product: string;
    requested: number;
    available: number;
    status: 'OK' | 'OUT_OF_STOCK' | 'PARTIAL';
  }>;
  // Compatibilidad con lógica anterior
  productName?: string;
  productId?: string;
  unitsNeeded?: number;
  presentation?: string;
  currentStock?: number;
  pricePerUnit?: number;
  totalPrice?: number;
  availableQuantity?: number;
  missingQuantity?: number;
  currency?: string;
  weightPerUnitGrams?: number;
  totalWeightAvailableKilos?: number;
  }
export interface IInventoryProvider {
  /**
   * Obtiene la información de un producto desde Google Sheets
   */
  getProduct(productId: string): Promise<ProductInventory | null>;

  /**
   * Lista todos los productos disponibles
   */
  listProducts(): Promise<ProductInventory[]>;

  /**
   * Actualiza el stock de un producto tras un pedido
   */
  updateStock(productId: string, quantityChange: number): Promise<void>;

  /**
   * Registra un nuevo pedido en la hoja de pedidos de Google Sheets
   */
  registerOrder(order: Order): Promise<void>;

  /**
   * Registra un pedido en la lista de prepago (esperando validación de pago)
   */
  registerPrepaidOrder(order: Order, client: any): Promise<void>;

  /**
   * Mueve un pedido a la lista de entrega (pago confirmado)
   */
  registerDeliveryOrder(order: Order, client: any): Promise<void>;

  /**
   * Registra un pedido en la lista de espera (sin stock)
   */
  registerWaitlistOrder(order: Order, client: any): Promise<void>;

  /**
   * Añade un cliente a la lista de espera para un producto específico
   */
  addToWaitlist(clientId: string, productId: string): Promise<void>;

  /**
   * Obtiene configuraciones globales (ej: domicilio, fechas entrega)
   */
  getConfig(): Promise<Record<string, string>>;

  /**
   * Elimina un pedido de la lista de prepago (tras ser movido a entrega)
   */
  removeFromPrepaidList(orderId: string): Promise<void>;

  /**
   * Recupera los detalles de un pedido registrado en la lista de prepago
   */
  getPrepaidOrderDetails(orderId: string): Promise<any>;

  /**
   * Recupera los detalles de un pedido registrado en la lista de entrega
   */
  getDeliveryOrderDetails(orderId: string): Promise<any>;
}
