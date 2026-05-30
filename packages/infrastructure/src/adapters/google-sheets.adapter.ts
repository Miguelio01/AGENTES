import { IInventoryProvider, ProductInventory, Order, Client } from '@agentes/domain';
import { google } from 'googleapis';

export class GoogleSheetsInventoryAdapter implements IInventoryProvider {
  private sheets: any;
  private spreadsheetId: string;
  private ordersSpreadsheetId: string | undefined;

  constructor(
    spreadsheetId: string,
    credentials: any,
    ordersSpreadsheetId?: string,
  ) {
    const auth = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = spreadsheetId;
    this.ordersSpreadsheetId = ordersSpreadsheetId;
  }

  async getProduct(productId: string): Promise<ProductInventory | null> {
    const products = await this.listProducts();
    return products.find((p) => p.id === productId) || null;
  }

  async listProducts(): Promise<ProductInventory[]> {
    return this.withRetry(async () => {
      // 1. Obtener Precios desde la pestaña 'costos' (Col A: ID, Col F: Precio)
      const priceResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "costos!A2:F500",
      });
      const priceRows = priceResponse.data.values || [];
      const priceMap = new Map(
        priceRows.map((row: any) => {
            const id = row[0]?.trim();
            const priceStr = row[5] ? row[5].replace(/[^0-9]/g, '') : '0';
            return [id, parseInt(priceStr) || 0];
        })
      );

      // 2. Obtener Inventario desde 'Inventario ' (A:ID, B:Name, C:Stock, D:Ventas, E:Empaque)
      const invResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "'Inventario '!A2:E500",
      });

      const rows = invResponse.data.values;
      if (!rows) return [];

      const kitDescription = 'Contiene: 1g de Uchuvas X 500g, 1g de Frambuesas x 125g';

      return rows
        .filter((row: any) => row[0] && row[0]?.trim())
        .map((row: any) => {
          const id = row[0]?.trim();
          const name = row[1]?.trim() || '';
          const stock = parseInt(row[2]) || 0;
          const dailySales = parseInt(row[3]) || 0;
          const packaging = row[4] || 'Unidad';

          return {
            id,
            name,
            stock,
            sales: dailySales, // Mapeado a ventas diarias (Columna D)
            price: priceMap.get(id) || 0,
            packagingType: packaging,
            description: id === 'KIT-FRU-01' ? kitDescription : undefined,
          };
        });
    });
  }

  async updateStock(productId: string, quantityChange: number, absoluteStock?: number): Promise<void> {
    return this.withRetry(async () => {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "'Inventario '!A2:E500",
      });

      const rows = response.data.values;
      if (!rows) throw new Error('No se encontraron datos en el inventario');

      let rowIndex = rows.findIndex((row: any) => row[0]?.trim() === productId);
      
      if (rowIndex === -1) {
        const normalize = (t: string) => (t || '').toLowerCase().trim();
        const searchName = normalize(productId);
        rowIndex = rows.findIndex((row: any) => normalize(row[1]) === searchName);
      }

      if (rowIndex === -1) {
        throw new Error(`Producto "${productId}" no encontrado en el inventario por ID ni por nombre`);
      }

      const currentStock = parseInt(rows[rowIndex][2]) || 0;
      const currentDailySales = parseInt(rows[rowIndex][3]) || 0;

      // Cálculo de Stock
      const newStock = absoluteStock !== undefined ? absoluteStock : Math.max(0, currentStock + quantityChange);
      
      // Cálculo de Ventas Diarias (Columna D)
      // Solo incrementamos si es una venta (cambio negativo)
      const newDailySales = currentDailySales + (quantityChange < 0 ? Math.abs(quantityChange) : 0);

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'Inventario '!C${rowIndex + 2}:D${rowIndex + 2}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { 
          values: [[newStock, newDailySales]] 
        },
      });
      console.log(`📉 Sync Excel: ${productId} -> Stock: ${newStock}, Ventas Día: ${newDailySales}`);
    });
  }

  // --- Implementaciones de Pedidos (usando la hoja correcta) ---

  async registerOrder(order: Order): Promise<void> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    const values = [[
      new Date().toLocaleString('es-CO'),
      order.id,
      'Cliente WhatsApp',
      'Desconocido',
      'N/A',
      'N/A',
      order.items.map(i => `${i.quantity}x ${i.name}`).join('\n'),
      order.total,
      'PENDIENTE'
    ]];

    return this.withRetry(async () => {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Lista_prepago!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    });
  }

  async registerPrepaidOrder(order: Order, client: Client): Promise<void> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    const sheetName = 'Lista_prepago';
    
    const values = [[
        new Date().toLocaleString('es-CO'),
        client.fullName || client.name,
        client.phone,
        order.items.map(i => `${i.quantity}x ${i.name}`).join('\n'),
        order.total,
        'PENDIENTE',
        order.id,
    ]];

    return this.withRetry(async () => {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    });
  }

  async registerDeliveryOrder(order: Order, client: Client): Promise<void> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    const sheetName = 'Lista_entrega';

    const values = [[
      new Date().toLocaleString('es-CO'),
      order.id,
      client.fullName || client.name,
      client.phone,
      client.address || 'N/A',
      client.city || 'N/A',
      order.items.map(i => `${i.quantity}x ${i.name}`).join('\n'),
      order.total,
      'CONFIRMADO'
    ]];

    return this.withRetry(async () => {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    });
  }

  async registerCostControlOrder(order: Order, client: Client): Promise<void> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    const values = [[
      new Date().toLocaleString('es-CO'),
      order.id,
      client.fullName || client.name,
      order.items.map(i => `${i.quantity}x ${i.name}`).join('\n'),
      order.total,
      'ENTREGADO'
    ]];

    return this.withRetry(async () => {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Control_Costos!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    });
  }

  async registerWaitlistOrder(order: Order, client: Client): Promise<void> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    const values = [[
      new Date().toLocaleString('es-CO'),
      client.fullName || client.name,
      client.phone,
      order.items.map(i => `${i.quantity}x ${i.name}`).join('\n'),
      'LISTA DE ESPERA'
    ]];

    return this.withRetry(async () => {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Lista_Espera!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    });
  }

  async addToWaitlist(clientId: string, productId: string): Promise<void> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    const values = [[
      new Date().toLocaleString('es-CO'),
      clientId,
      productId,
      'LISTA DE ESPERA'
    ]];

    return this.withRetry(async () => {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Lista_Espera!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    });
  }

  async getPrepaidOrderDetails(orderId: string): Promise<any> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    return this.withRetry(async () => {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Lista_prepago!A2:G500',
      });
      const rows = response.data.values || [];
      const row = rows.find((r: any) => r[6]?.trim() === orderId);
      if (!row) return null;
      return { id: row[6], clientName: row[1], phone: row[2], products: row[3], total: row[4], status: row[5] };
    });
  }

  async getDeliveryOrderDetails(orderId: string): Promise<any> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    return this.withRetry(async () => {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Lista_entrega!A2:I500',
      });
      const rows = response.data.values || [];
      const row = rows.find((r: any) => r[1]?.trim() === orderId);
      if (!row) return null;
      return { id: row[1], clientName: row[2], phone: row[3], address: row[4], city: row[5], products: row[6], total: row[7], status: row[8] };
    });
  }

  async removeFromPrepaidList(orderId: string): Promise<void> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    return this.withRetry(async () => {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Lista_prepago!A2:G500',
      });
      const rows = response.data.values || [];
      const rowIndex = rows.findIndex((r: any) => r[6]?.trim() === orderId);
      if (rowIndex === -1) return;

      const sheetMeta = await this.sheets.spreadsheets.get({ spreadsheetId });
      const sheet = sheetMeta.data.sheets.find((s: any) => s.properties.title === 'Lista_prepago');
      const sheetId = sheet.properties.sheetId;

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } }],
        },
      });
    });
  }

  async getConfig(): Promise<Record<string, string>> {
    return this.withRetry(async () => {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Configuracion!A2:B50',
      });
      const rows = response.data.values;
      if (!rows) return {};
      const config: Record<string, string> = {};
      rows.forEach((row: any) => {
        if (row[0]) {
          const normalizedKey = row[0].trim().toUpperCase().replace(/ /g, '_');
          config[normalizedKey] = row[1] || '';
        }
      });
      return config;
    });
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        if (i === retries - 1) throw error;
        console.warn(`⚠️ Intento ${i + 1} fallido, reintentando... Error: ${error.message}`);
        await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
      }
    }
    throw new Error('Retries exhausted');
  }
}
