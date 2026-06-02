import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'frescoh.col@gmail.com';
  
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: 'ADMIN',
      name: 'Miguel Admin'
    },
    create: {
      email: adminEmail,
      name: 'Miguel Admin',
      role: 'ADMIN',
    },
  });

  console.log(`✅ Usuario Administrador configurado: ${user.email} con rol ${user.role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
