import { IInventoryProvider, ProductInventory, Order, Client } from '@agentes/domain';
import { google } from 'googleapis';

export class GoogleSheetsInventoryAdapter implements IInventoryProvider {
  private sheets: any;

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

  async getProduct(productId: string): Promise<ProductInventory | null> {
    const products = await this.listProducts();
    return products.find(p => p.id === productId) || null;
  }

  async listProducts(): Promise<ProductInventory[]> {
    try {
      // 1. Leer Stock de la hoja 'Inventario ' (A: ID, B: Nombre, C: Cantidad, D: Gramos, E: Unidades, F: Empaque)
      const invResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "'Inventario '!A2:F500",
      });

      // 2. Leer Precios de venta de la hoja 'costos'
      const costResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "costos!A2:F500",
      });

      const invRows = invResponse.data.values || [];
      const costRows = costResponse.data.values || [];

      const priceMap = new Map();
      costRows.forEach((row: any) => {
        // En la hoja 'costos': Columna A=ID, Columna B=Nombre, Columna F=Precio
        const id = row[0]?.trim();
        let priceStr = row[5] || '0'; 
        // Limpiar formato moneda: quitar $, espacios y puntos de miles
        const cleanPrice = priceStr.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
        const price = parseFloat(cleanPrice) || 0;
        priceMap.set(id, price);
      });

      return invRows
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
          };
        });
    } catch (error) {
      console.error('Error fetching products from Google Sheets:', error);
      return [];
    }
  }

  async updateStock(productId: string, quantityChange: number): Promise<void> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "'Inventario '!A2:C",
    });

    const rows = response.data.values;
    if (!rows) throw new Error('No se encontraron datos en el inventario');

    const rowIndex = rows.findIndex((row: any) => row[0] === productId);
    if (rowIndex === -1) throw new Error(`Producto ${productId} no encontrado`);

    const currentStock = parseInt(rows[rowIndex][2]) || 0;
    const newStock = currentStock + quantityChange;

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `'Inventario '!C${rowIndex + 2}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newStock]] }
    });
  }

  async registerOrder(order: Order): Promise<void> {
    const values = [[order.id, order.clientId, order.createdAt.toISOString(), order.total, order.status, JSON.stringify(order.items)]];
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.ordersSpreadsheetId || this.spreadsheetId,
        range: 'Lista_prepago!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    } catch (error) {
      console.error('Error registering order:', error);
    }
  }

  async registerPrepaidOrder(order: Order, client: Client): Promise<void> {
    const values = [this.mapOrderToRow(order, client)];
    await this.appendRow(this.ordersSpreadsheetId || this.spreadsheetId, 'Lista_prepago!A2', values);
  }

  async registerDeliveryOrder(order: Order, client: Client): Promise<void> {
    const spreadsheetId = this.ordersSpreadsheetId || this.spreadsheetId;
    const weekName = this.getCurrentWeeklySheetName();
    
    await this.ensureWeeklySheetExists(spreadsheetId, weekName);
    
    const serial = await this.generateSerialNumber(spreadsheetId, weekName);
    const row = this.mapOrderToDeliveryRow(order, client, serial);
    
    await this.appendRow(spreadsheetId, `${weekName}!A2`, [row]);
  }

  private getCurrentWeeklySheetName(): string {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const pastDaysOfYear = (now.getTime() - startOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
    return `Entrega_S${weekNumber}_${now.getFullYear()}`;
  }

  private async ensureWeeklySheetExists(spreadsheetId: string, sheetName: string): Promise<void> {
    try {
      const meta = await this.sheets.spreadsheets.get({ spreadsheetId });
      const sheets = meta.data.sheets || [];
      if (sheets.some((s: any) => s.properties.title === sheetName)) return;

      const templateSheet = sheets.find((s: any) => s.properties.title === 'Lista_entrega');
      if (!templateSheet) {
        console.warn('Template sheet Lista_entrega not found. Creating empty sheet.');
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
        });
        return;
      }

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            duplicateSheet: {
              sourceSheetId: templateSheet.properties.sheetId,
              newSheetName: sheetName,
              insertSheetIndex: 0
            }
          }]
        }
      });
      
      // Clear data but keep headers if it was a duplicate (usually duplicateSheet copies everything)
      // For now, assume Lista_entrega is just a header template.
    } catch (e) {
      console.error('Error ensuring weekly sheet exists:', e);
    }
  }

  private async generateSerialNumber(spreadsheetId: string, sheetName: string): Promise<string> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:A`,
      });
      const rows = response.data.values || [];
      const count = rows.length > 0 ? rows.length - 1 : 0; // Excluir encabezado para empezar en 00
      const now = new Date();
      const year = now.getFullYear();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const day = now.getDate().toString().padStart(2, '0');
      const index = count.toString().padStart(2, '0');
      
      return `${index}-FRES-${year}-${month}-${day}`;
    } catch (e) {
      return `00-FRES-ERR-${Date.now().toString().slice(-4)}`;
    }
  }

  private mapOrderToDeliveryRow(order: Order, client: Client, serial: string) {
    return [
      new Date().toISOString(),
      order.id,
      client.phone,
      client.fullName || client.name,
      client.documentType,
      client.documentNumber,
      client.email,
      client.address,
      client.city,
      order.total,
      order.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
      serial,
      'NO' // Entregado (Si/No)
    ];
  }

  async registerWaitlistOrder(order: Order, client: Client): Promise<void> {
    const values = [this.mapOrderToRow(order, client)];
    await this.appendRow(this.ordersSpreadsheetId || this.spreadsheetId, 'Lista_Espera!A2', values);
  }

  async addToWaitlist(clientId: string, productId: string): Promise<void> {
    const values = [[new Date().toISOString(), clientId, productId, 'PENDING']];
    await this.appendRow(this.ordersSpreadsheetId || this.spreadsheetId, 'Lista_Espera!A2', values);
  }

  async getConfig(): Promise<Record<string, string>> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Configuracion!A2:B20',
      });
      const rows = response.data.values || [];
      const config: Record<string, string> = {};
      rows.forEach((row: any) => {
        if (row[0]) config[row[0]] = row[1];
      });
      return config;
    } catch (error) {
      console.error('Error fetching config from Google Sheets:', error);
      return {};
    }
  }

  private mapOrderToRow(order: Order, client: Client) {
    return [
      new Date().toISOString(),
      order.id,
      client.phone,
      client.fullName || client.name,
      client.documentType,
      client.documentNumber,
      client.email,
      client.address,
      client.city,
      order.total,
      order.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
      'PENDIENTE'
    ];
  }

  private async appendRow(spreadsheetId: string, range: string, values: any[][]) {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    } catch (error) {
      console.error(`Error appending to ${range}:`, error);
    }
  }
}
