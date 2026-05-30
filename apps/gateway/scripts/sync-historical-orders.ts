import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GoogleSheetsInventoryAdapter } from '@agentes/infrastructure';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const sheetsAdapter = app.get<GoogleSheetsInventoryAdapter>('GOOGLE_SHEETS_ADAPTER_INTERNAL');

  console.log('🚀 Iniciando sincronización de pedidos desde Google Sheets a SQLite...');

  // 1. Obtener la hoja de entrega
  // Obtenemos los valores crudos para procesarlos manualmente
  // Por la naturaleza de la API del adapter original, podemos acceder a la data si exponemos el método o lo replicamos aquí.
  // Pero lo más fácil es usar la conexión del adaptador:
  const sheets = (sheetsAdapter as any).sheets;
  const spreadsheetId = (sheetsAdapter as any).spreadsheetId;
  const ordersSpreadsheetId = (sheetsAdapter as any).ordersSpreadsheetId || spreadsheetId;
  
  const getDeliverySheetName = async () => {
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: ordersSpreadsheetId });
      const sheetsList = meta.data.sheets || [];
      const foundSheet = sheetsList.find((s: any) => {
        const title = (s.properties.title || '').toLowerCase().trim();
        return (
          title === 'lista_entrega' || 
          title === 'listado_entrega' || 
          title === 'lista entrega' || 
          title === 'listado entrega' ||
          title === 'entrega' ||
          title === 'entregas'
        );
      });
      return foundSheet ? foundSheet.properties.title : 'Lista_entrega';
    } catch (e) {
      return 'Lista_entrega';
    }
  };

  const sheetName = await getDeliverySheetName();
  console.log(`📦 Leyendo datos desde la pestaña: ${sheetName}`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: ordersSpreadsheetId,
    range: `'${sheetName}'!A:I`,
  });

  const rows = response.data.values || [];
  
  if (rows.length <= 1) {
    console.log('⚠️ No hay pedidos en la lista de entrega para migrar.');
    await app.close();
    return;
  }

  // Diccionario para acumular ventas por ID de producto (y poder guardar todo al final)
  const salesMap: Record<string, number> = {};
  
  // Catálogo para poder mapear Nombres a IDs
  const catalog = await prisma.inventoryItem.findMany();

  // Omitir cabecera
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[1]) continue;

    const dateStr = row[0];
    const orderId = row[1].trim();
    const clientName = row[2] || 'Cliente Migrado';
    const phone = row[3] ? row[3].replace(/[^0-9]/g, '') : `MIGRATED-${Date.now()}`;
    const address = row[4];
    const city = row[5];
    const productsStr = row[6] || '';
    
    // Parsear la fecha del string de sheets "dd/mm/yyyy, HH:mm:ss" a un DateTime de JS
    let createdAt = new Date();
    try {
      if (dateStr) {
        // Asumiendo formato DD/MM/YYYY, HH:MM:SS
        const parts = dateStr.split(',');
        if (parts.length > 0) {
          const dateParts = parts[0].split('/');
          if (dateParts.length === 3) {
            const parsedDate = new Date(`${dateParts[2].split(' ')[0]}-${dateParts[1]}-${dateParts[0]}T12:00:00Z`);
            if (!isNaN(parsedDate.getTime())) {
              createdAt = parsedDate;
            }
          }
        }
      }
    } catch (e) {
      console.warn(`No se pudo parsear fecha: ${dateStr}. Usando fecha actual.`);
    }

    // Procesar los productos
    const productLines = productsStr.split('\n').filter(l => l.trim().length > 0);
    const parsedItems = productLines.map((line: string) => {
      // Limpiar línea
      const cleanLine = line.replace(/[^\x20-\x7E\u00A0-\u00FF•\-\*]/g, '');
      const match = cleanLine.match(/[•\-\*]?\s*(\d+)x\s+(.+)/);
      if (match) {
        const qty = parseInt(match[1]) || 1;
        const nameRaw = match[2].trim();
        const name = nameRaw.split('($')[0].trim();
        
        // Buscar el ID en el catálogo SQLite
        const catalogMatch = catalog.find(p => p.name.toLowerCase().includes(name.toLowerCase()));
        
        return {
          productId: catalogMatch ? catalogMatch.id : 'MIGRATED-ITEM',
          name,
          quantity: qty,
          price: catalogMatch ? catalogMatch.price : 0,
        };
      }
      return null;
    }).filter(Boolean);

    // Calcular el total de los items
    let subtotal = 0;
    parsedItems.forEach(item => {
      subtotal += item.price * item.quantity;
    });

    // Validar si el registro ya existe para no duplicar
    const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });
    if (!existingOrder) {
      // Crear Cliente (upsert por teléfono)
      const clientId = phone || `client-${Date.now()}`;
      await prisma.client.upsert({
        where: { id: clientId },
        create: {
          id: clientId,
          name: clientName,
          fullName: clientName,
          phone: phone,
          address: address,
          city: city,
        },
        update: {}
      });

      // Crear Orden y sus Items
      // Domicilio es 0 por defecto para órdenes históricas migradas si no sabemos (solo sumamos los items)
      // O podemos estimar 9000 si faltaba. Por defecto lo pondremos a 0 para no alterar datos que no tenemos
      await prisma.order.create({
        data: {
          id: orderId,
          clientId: clientId,
          agentId: 'migration-script',
          deliveryFee: 0, 
          total: subtotal,
          status: 'delivered', // Como estaba en lista de entrega
          createdAt: createdAt,
          items: {
            create: parsedItems.map(i => ({
              productId: i.productId,
              name: i.name,
              quantity: i.quantity,
              price: i.price,
            }))
          }
        }
      });

      console.log(`✅ Orden ${orderId} migrada a SQLite.`);

      // Acumular ventas
      parsedItems.forEach(item => {
        if (item.productId !== 'MIGRATED-ITEM') {
          salesMap[item.productId] = (salesMap[item.productId] || 0) + item.quantity;
        }
      });
    } else {
      console.log(`⏭️  Orden ${orderId} ya existía en SQLite, omitiendo.`);
    }
  }

  // Guardar ventas acumuladas en los productos de InventoryItem
  console.log('📊 Actualizando la métrica de Ventas (sales) en el catálogo...');
  for (const [productId, totalSold] of Object.entries(salesMap)) {
    if (totalSold > 0) {
      await prisma.inventoryItem.update({
        where: { id: productId },
        data: {
          sales: { increment: totalSold }
        }
      });
      console.log(`   -> Producto ${productId}: +${totalSold} ventas`);
    }
  }

  console.log('🎉 Migración y sincronización finalizada con éxito.');
  await app.close();
}

bootstrap();
