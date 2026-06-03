import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const admins = [
    { email: 'frescoh.col@gmail.com', name: 'Miguel Admin' },
    { email: 'miguel.angel.beltran.beltran.i@gmail.com', name: 'Miguel' },
  ];

  const authorizedUsers = [
    { email: 'dannpay1@gmail.com' },
    { email: 'karloskrane@gmail.com' },
    { email: 'manutb96@gmail.com' },
    { email: 'ptamayobrice09@gmail.com' },
  ];

  // Upsert Admins
  for (const admin of admins) {
    const user = await prisma.user.upsert({
      where: { email: admin.email },
      update: { role: 'ADMIN', name: admin.name },
      create: { email: admin.email, name: admin.name, role: 'ADMIN' },
    });
    console.log(`✅ Admin configurado: ${user.email}`);
  }

  // Upsert Regular Users
  for (const userEntry of authorizedUsers) {
    const user = await prisma.user.upsert({
      where: { email: userEntry.email },
      update: { role: 'USER' },
      create: { 
        email: userEntry.email, 
        name: userEntry.email.split('@')[0], 
        role: 'USER' 
      },
    });
    console.log(`✅ Usuario autorizado: ${user.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
