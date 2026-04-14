import { IInventoryProvider, ProductInventory, Order } from '@agentes/domain';
import { google } from 'googleapis';

export class GoogleSheetsAdapter implements IInventoryProvider {
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
      stock: parseInt(row[3]),
      price: parseFloat(row[4]),
    }));
  }

  async updateStock(productId: string, quantityChange: number): Promise<void> {
    // Lógica compleja para encontrar la fila y actualizarla
    // Por ahora, simulamos el éxito
    console.log(`Updating stock for ${productId} by ${quantityChange}`);
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

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: 'Pedidos!A2',
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  }
}
