import { IInventoryProvider, ProductInventory, Order } from '@agentes/domain';
import { google } from 'googleapis';

export class GoogleSheetsInventoryAdapter implements IInventoryProvider {
  private sheets: any;

  constructor(
    private readonly spreadsheetId: string,
    private readonly credentials: any // Service account or OAuth2
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
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Inventario!A2:E', // Asumiendo que la hoja se llama Inventario
      });

      const rows = response.data.values;
      if (!rows) return [];

      return rows.map((row: any) => ({
        id: row[0],
        name: row[1],
        description: row[2],
        stock: parseInt(row[3]) || 0,
        price: parseFloat(row[4]) || 0,
      }));
    } catch (error) {
      console.error('Error fetching products from Google Sheets:', error);
      return [];
    }
  }

  async updateStock(productId: string, quantityChange: number): Promise<void> {
    // Lógica compleja para encontrar la fila y actualizarla
    // Por ahora, simulamos el éxito como un mock según el plan
    console.log(`[MOCK] Updating stock for ${productId} by ${quantityChange}`);
  }

  async registerOrder(order: Order): Promise<void> {
    const values = [
      [
        order.id,
        order.clientId,
        order.createdAt.toISOString(),
        order.total,
        order.status,
        JSON.stringify(order.items),
      ],
    ];

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'Pedidos!A2',
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    } catch (error) {
      console.error('Error registering order in Google Sheets:', error);
    }
  }
}
