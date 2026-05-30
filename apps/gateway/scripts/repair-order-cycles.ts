import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function repairCycles() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  console.log('🔧 Iniciando vinculación retroactiva de pedidos a cosechas...');

  // 1. Obtener todas las cosechas disponibles
  const cycles = await prisma.salesCycle.findMany({
    orderBy: { startDate: 'asc' }
  });

  if (cycles.length === 0) {
    console.log('⚠️ No hay cosechas creadas. Por favor, crea una cosecha primero en el dashboard.');
    await app.close();
    return;
  }

  // 2. Obtener pedidos sin cosecha asignada
  const orders = await prisma.order.findMany({
    where: { salesCycleId: null }
  });

  console.log(`📦 Encontrados ${orders.length} pedidos sin cosecha.`);

  let repairedCount = 0;

  for (const order of orders) {
    // Buscar la cosecha que le corresponde según la fecha
    // Lógica: La fecha del pedido debe ser >= startDate de la cosecha 
    // Y (si la cosecha está cerrada) <= endDate.
    // Si hay varias abiertas, tomamos la más reciente que empezó antes del pedido.
    
    const matchingCycle = cycles.find(cycle => {
      const orderTime = order.createdAt.getTime();
      const cycleStartTime = cycle.startDate.getTime();
      const cycleEndTime = cycle.endDate ? cycle.endDate.getTime() : Infinity;
      
      return orderTime >= cycleStartTime && orderTime <= cycleEndTime;
    });

    if (matchingCycle) {
      await prisma.order.update({
        where: { id: order.id },
        data: { salesCycleId: matchingCycle.id }
      });
      console.log(`   ✅ Pedido ${order.id} (${order.createdAt.toLocaleDateString()}) -> Cosecha: ${matchingCycle.name}`);
      repairedCount++;
    } else {
        // Si no cae en ninguna, lo asignamos a la primera cosecha disponible como fallback si fue antes?
        // O lo dejamos así. Por ahora informamos.
        console.log(`   ❌ Pedido ${order.id} no encaja en ningún rango de fecha de cosecha actual.`);
    }
  }

  console.log(`\n🎉 Proceso finalizado. Se vincularon ${repairedCount} pedidos.`);
  await app.close();
}

repairCycles();
