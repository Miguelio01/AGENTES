import { IInventoryProvider, ProductInventory, Order, Client } from '@agentes/domain';
import { google } from 'googleapis';

export class GoogleSheetsInventoryAdapter implements IInventoryProvider {
  private sheets: any;
  private readonly DEFAULT_PREPAGO_SHEET = 'Lista_prepago';

  constructor(
    private readonly spreadsheetId: string,
    private readonly credentials: any,
    private readonly ordersSpreadsheetId?: string
  ) {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) throw error;
      console.warn(`⚠️ Google Sheets API error, reintentando en ${delay}ms... (${retries} intentos restantes)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.withRetry(fn, retries - 1, delay * 2);
    }
  }

  private async getPrepaidSheetName(spreadsheetId: string): Promise<string> {
    try {
      const meta = await this.sheets.spreadsheets.get({ spreadsheetId });
      const sheets = meta.data.sheets || [];
      const foundSheet = sheets.find((s: any) => {
        const title = (s.properties.title || '').toLowerCase().trim();
        return title === 'lista_prepago' || title === 'listado_prepago' || title === 'lista prepago';
      });
      return foundSheet ? foundSheet.properties.title : this.DEFAULT_PREPAGO_SHEET;
    } catch (e) {
      return this.DEFAULT_PREPAGO_SHEET;
    }
  }

  async getProduct(productId: string): Promise<ProductInventory | null> {
    return this.withRetry(async () => {
      const products = await this.listProducts();
      return products.find(p => p.id === productId) || null;
    });
  }

  async listProducts(): Promise<ProductInventory[]> {
    return this.withRetry(async () => {
      const invResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "'Inventario '!A1:I500",
      });

      const costResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "costos!A2:F500",
      });

      const invRows = invResponse.data.values || [];
      const costRows = costResponse.data.values || [];

      const kitComposition: string[] = [];
      invRows.slice(3, 7).forEach((row: any) => {
        if (row[7] && row[8]) {
          kitComposition.push(`${row[8]}g de ${row[7]}`);
        }
      });
      const kitDescription = kitComposition.length > 0 
        ? `Contiene: ${kitComposition.join(', ')}`
        : undefined;

      const priceMap = new Map();
      costRows.forEach((row: any) => {
        const id = row[0]?.trim();
        let priceStr = row[5] || '0'; 
        const cleanPrice = priceStr.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
        const price = parseFloat(cleanPrice) || 0;
        priceMap.set(id, price);
      });

      return invRows
        .slice(1)
        .filter((row: any) => row[0] && row[0]?.trim() !== '' && row[0] !== 'Total producotos ')
        .map((row: any) => {
          const id = row[0]?.trim();
          const name = row[1]?.trim() || '';
          const stock = parseInt(row[2]) || 0;
          const gramsStr = row[3] || 'N/A';
          const unitsStr = row[4] || 'N/A';
          const packaging = row[5] || 'Unidad';

          const weightGrams = gramsStr !== 'N/A' ? parseInt(gramsStr) : undefined;
          const unitsPerPackage = unitsStr !== 'N/A' ? parseInt(unitsStr) : undefined;

          return {
            id,
            name,
            stock,
            price: priceMap.get(id) || 0,
            weightGrams,
            unitsPerPackage,
            packagingType: packaging,
            description: id === 'KIT-FRU-01' ? kitDescription : undefined,
          };
        });
    });
  }

  async updateStock(productId: string, quantityChange: number): Promise<void> {
    return this.withRetry(async () => {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "'Inventario '!A2:C500",
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
      const newStock = currentStock + quantityChange;

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'Inventario '!C${rowIndex + 2}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[newStock]] }
      });
      console.log(`✅ Stock actualizado para "${rows[rowIndex][1]}": ${currentStock} -> ${newStock}`);
    });
  }

  async registerOrder(order: Order): Promise<void> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    const sheetName = await this.getPrepaidSheetName(spreadsheetId);
    const values = [[order.id, order.clientId, order.createdAt.toISOString(), order.total, order.status, JSON.stringify(order.items)]];
    
    return this.withRetry(async () => {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName}'!A2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    });
  }

  async registerPrepaidOrder(order: Order, client: Client): Promise<void> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    const sheetName = await this.getPrepaidSheetName(spreadsheetId);
    
    try {
      const range = `'${sheetName}'!A1:G1`;
      await this.withRetry(async () => {
        const check = await this.sheets.spreadsheets.values.get({ spreadsheetId, range });
        if (!check.data.values || check.data.values.length === 0) {
          await this.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `'${sheetName}'!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [['FECHA', 'CLIENTE', 'WHATSAPP', 'PRODUCTOS', 'TOTAL', 'ESTADO', 'ID_PEDIDO']]
            }
          });
        }
      });
    } catch (e: any) {
      console.warn(`⚠️ No se pudo verificar/crear encabezados en "${sheetName}": ${e.message}`);
    }

    console.log(`📉 Descontando stock preventivo para ${order.items.length} items...`);
    for (const item of order.items) {
      try {
        const idToUpdate = item.productId && item.productId.startsWith('PROD-') ? item.productId : item.name;
        await this.updateStock(idToUpdate, -item.quantity);
      } catch (e: any) {
        console.error(`❌ Error fatal descontando stock para ${item.name}: ${e.message}`);
      }
    }

    const values = [this.mapOrderToRow(order, client)];
    return this.withRetry(async () => {
      try {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `'${sheetName}'!A2`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
        console.log(`✅ Pedido registrado exitosamente en "${sheetName}"`);
      } catch (e: any) {
        console.error(`❌ Error en append a "${sheetName}" (Spreadsheet: ${spreadsheetId}): ${e.message}`);
        throw e;
      }
    });
  }

  async getPrepaidOrderDetails(orderId: string): Promise<any> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    const sheetName = await this.getPrepaidSheetName(spreadsheetId);
    
    return this.withRetry(async () => {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A:G`,
      });

      const rows = response.data.values || [];
      const row = rows.find((r: any) => r[6] === orderId);

      if (!row) return null;

      // Columna 3 (index 2) es WHATSAPP (clientId)
      const clientId = row[2] ? row[2].replace(/[^0-9]/g, '') : null;

      const productLines = (row[3] || '').split('\n');
      const items = productLines.map((line: string) => {
        const match = line.match(/- (\d+)x\s+(.+)/);
        if (match) return { quantity: parseInt(match[1]), name: match[2].trim() };
        return null;
      }).filter(Boolean);

      const allProducts = await this.listProducts();
      const enrichedItems = items.map((item: any) => {
        const found = allProducts.find(p => p.name === item.name);
        return { ...item, productId: found ? found.id : item.name };
      });

      return { id: orderId, clientId, items: enrichedItems };
    });
  }

  async registerDeliveryOrder(order: Order, client: Client): Promise<void> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    const weekName = 'Lista_entrega'; // Usar la hoja estandarizada
    
    const row = this.mapOrderToDeliveryRow(order, client);
    
    await this.appendRow(spreadsheetId, `'${weekName}'!A2`, [row]);
  }

  private mapOrderToDeliveryRow(order: Order, client: Client) {
    const productDetail = order.items.map(i => `- ${i.quantity}x ${i.name}`).join('\n');
    return [
      new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
      order.id,
      client.fullName || client.name || 'Cliente',
      client.phone,
      client.address || 'PENDIENTE',
      client.city || 'ZONA POR DEFINIR',
      productDetail,
      '', // GUIA/ENVIO (Vacio inicial)
      'FALSE' // ENTREGADO (Checkbox desmarcado)
    ];
  }

  async registerWaitlistOrder(order: Order, client: Client): Promise<void> {
    const values = [this.mapOrderToWaitlistRow(order, client)];
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    await this.appendRow(spreadsheetId, `'Lista_Espera'!A2`, values);
  }

  private mapOrderToWaitlistRow(order: Order, client: Client) {
    const productDetail = order.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
    return [
      new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
      client.fullName || client.name || 'Cliente',
      client.phone,
      productDetail,
      'PEDIDO AGOTADO'
    ];
  }

  async addToWaitlist(clientId: string, productId: string): Promise<void> {
     // Implementación básica para compatibilidad
     console.log('Adding to waitlist simple...');
  }

  async getConfig(): Promise<Record<string, string>> {
    return this.withRetry(async () => {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Configuracion!A2:B20',
      });
      
      const rows = response.data.values || [];
      const config: Record<string, string> = {};
      rows.forEach((row: any) => {
        if (row[0]) config[row[0].trim()] = row[1]?.trim();
      });

      try {
        const deliveryDateResponse = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: "'Inventario '!H1",
        });
        const deliveryDateValue = deliveryDateResponse.data.values?.[0]?.[0];
        if (deliveryDateValue) {
          config['FECHA_ENTREGA'] = deliveryDateValue;
        }
      } catch (e) {}

      return config;
    });
  }

  private mapOrderToRow(order: Order, client: Client) {
    const date = new Date().toLocaleString('es-CO', { 
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const productDetail = order.items
      .map(i => `- ${i.quantity}x ${i.name}`)
      .join('\n');

    return [
      date,
      client.fullName || client.name || 'Cliente',
      client.phone,
      productDetail,
      order.total,
      'PENDIENTE',
      order.id
    ];
  }

  private async appendRow(spreadsheetId: string, range: string, values: any[][]) {
    return this.withRetry(async () => {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    });
  }

  async removeFromPrepaidList(orderId: string): Promise<void> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    const sheetName = await this.getPrepaidSheetName(spreadsheetId);
    
    return this.withRetry(async () => {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A:G`,
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex((row: any) => row[6] === orderId);

      if (rowIndex === -1) return;

      const meta = await this.sheets.spreadsheets.get({ spreadsheetId });
      const sheet = meta.data.sheets.find((s: any) => (s.properties.title || '').toLowerCase().trim() === sheetName.toLowerCase().trim());
      if (!sheet) return;

      const sheetId = sheet.properties.sheetId;

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: 'ROWS',
                  startIndex: rowIndex,
                  endIndex: rowIndex + 1,
                },
              },
            },
          ],
        },
      });
    });
  }
}
