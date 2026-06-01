import { PrismaClient as SQLiteClient } from '@prisma/client';
import { PrismaClient as PostgreClient } from '@prisma/client'; // Nota: En producción esto se generaría dinámicamente o se usaría una interfaz común
import { Logger } from '@nestjs/common';

/**
 * SCRIPT DE MIGRACIÓN: "UN SOLO NEGOCIO, UNA SOLA VERDAD"
 * Objetivo: Mover datos de SQLite (Local) a la DB Unificada del eCommerce (Nube/Postgres)
 * 
 * Uso: Este script se debe ejecutar cuando el eCommerce proporcione su DATABASE_URL final.
 */

async function migrateToUnifiedDatabase() {
  const logger = new Logger('MigrationExpert');
  const sqlite = new SQLiteClient({ datasources: { db: { url: 'file:./dev.db' } } });
  
  // URL de la base de datos del eCommerce (A ser provista por Miguel)
  const targetUrl = process.env.TARGET_DATABASE_URL;

  if (!targetUrl) {
    console.error('❌ ERROR: Debes proveer TARGET_DATABASE_URL en el entorno.');
    process.exit(1);
  }

  const target = new PostgreClient({ datasources: { db: { url: targetUrl } } });

  try {
    logger.log('🚀 Iniciando migración masiva a la Base de Datos Unificada...');

    // 1. Migrar Clientes
    const clients = await sqlite.client.findMany();
    logger.log(`👤 Migrando ${clients.length} clientes...`);
    for (const c of clients) {
      await target.client.upsert({
        where: { id: c.id },
        update: { ...c },
        create: c
      });
    }

    // 2. Migrar Cosechas (Sales Cycles)
    const cycles = await sqlite.salesCycle.findMany();
    logger.log(`🌱 Migrando ${cycles.length} cosechas...`);
    for (const cy of cycles) {
      await target.salesCycle.upsert({
        where: { id: cy.id },
        update: { ...cy },
        create: cy
      });
    }

    // 3. Migrar Inventario
    const inventory = await sqlite.inventoryItem.findMany();
    logger.log(`📦 Migrando ${inventory.length} productos...`);
    for (const item of inventory) {
      await target.inventoryItem.upsert({
        where: { id: item.id },
        update: { ...item },
        create: item
      });
    }

    // 4. Migrar Órdenes (Incluyendo Items)
    const orders = await sqlite.order.findMany({ include: { items: true } });
    logger.log(`🛒 Migrando ${orders.length} órdenes...`);
    for (const o of orders) {
      const { items, ...orderData } = o;
      await target.order.upsert({
        where: { id: o.id },
        update: orderData,
        create: {
          ...orderData,
          items: {
            create: items.map(({ id, orderId, ...rest }) => rest)
          }
        }
      });
    }

    logger.log('✅ MIGRACIÓN COMPLETADA EXITOSAMENTE.');
    logger.log('Ahora puedes cambiar DATABASE_URL en el .env por la del eCommerce.');

  } catch (error) {
    logger.error(`❌ FALLO EN LA MIGRACIÓN: ${error.message}`);
  } finally {
    await sqlite.$disconnect();
    await target.$disconnect();
  }
}

migrateToUnifiedDatabase();
