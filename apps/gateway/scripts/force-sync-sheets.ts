import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GoogleSheetsInventoryAdapter } from '@agentes/infrastructure';

async function forceSync() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const sheetsAdapter = app.get<GoogleSheetsInventoryAdapter>('GOOGLE_SHEETS_ADAPTER_INTERNAL');

  console.log('🚀 Forzando sincronización EXACTA de Google Sheets -> SQLite...');

  try {
    const products = await sheetsAdapter.listProducts();
    console.log(`📦 Encontrados ${products.length} productos en Excel.`);

    let orderIndex = 0;
    for (const p of products) {
      await prisma.inventoryItem.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          name: p.name,
          stock: p.stock,
          price: p.price,
          sales: p.sales || 0,
          displayOrder: orderIndex,
          weightGrams: p.weightGrams,
          unitsPerPackage: p.unitsPerPackage,
          packagingType: p.packagingType,
          description: p.description,
        },
        update: {
          name: p.name,
          stock: p.stock, 
          sales: p.sales || 0, 
          displayOrder: orderIndex,
          price: p.price,
          weightGrams: p.weightGrams,
          unitsPerPackage: p.unitsPerPackage,
          packagingType: p.packagingType,
        }
      });
      orderIndex++;
    }
    console.log('✅ Base de datos SQLite sobrescrita con éxito respetando el ORDEN del Excel.');
  } catch (error) {
    console.error('❌ Error sincronizando:', error);
  }

  await app.close();
}

forceSync();
