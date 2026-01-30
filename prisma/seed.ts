import { PrismaClient } from '@prisma/client';
import { hash } from 'bcrypt';
import path from 'path';

const dbPath = path.resolve(__dirname, 'test.db');
const prisma = new PrismaClient({
  datasourceUrl: `file:${dbPath}`,
});

async function main() {
  // Clean existing data
  await prisma.weeklyStreak.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hash('Password123!', 10);

  // Create users
  const alice = await prisma.user.create({
    data: {
      email: 'alice@test.com',
      password: passwordHash,
      firstName: 'Alice',
      lastName: 'Smith',
      emailConfirmed: true,
      subscription: 'pro',
      role: 'user',
    },
  });

  await prisma.user.create({
    data: {
      email: 'bob@test.com',
      password: passwordHash,
      firstName: 'Bob',
      lastName: 'Jones',
      emailConfirmed: true,
      subscription: 'free',
      role: 'user',
    },
  });

  await prisma.user.create({
    data: {
      email: 'admin@test.com',
      password: passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      emailConfirmed: true,
      subscription: 'pro',
      role: 'admin',
    },
  });

  // Create weekly streaks
  const today = new Date();
  for (let i = 0; i < 5; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    await prisma.weeklyStreak.create({
      data: { userId: alice.id, date },
    });
  }

  console.log('Seed complete: 3 users, 5 streaks');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
