import { Order, OrderItem } from '../entities/order.entity';

export const INVENTORY_PROVIDER_PORT = 'IInventoryProvider';

export interface ProductInventory {
  id: string;
  name: string;
  stock: number;
  price: number;
  description?: string;
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
   * Añade un cliente a la lista de espera para un producto específico
   */
  addToWaitlist(clientId: string, productId: string): Promise<void>;
}
