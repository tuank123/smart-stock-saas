const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function main() {
  // Clear existing data
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();

  console.log('🗑️  Cleared existing data');

  // Create test tenant
  const tenant = await prisma.tenant.create({
    data: {
      planId: 'STARTER',
      companyName: 'Acme Corporation',
      taxNumber: 'TR1234567890',
      status: 'ACTIVE',
      settings: {
        language: 'tr',
        currency: 'TRY',
        dateFormat: 'DD.MM.YYYY',
      },
    },
  });

  console.log('✅ Created tenant:', tenant.id);

  // Create main branch
  const branch = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: 'Istanbul HQ',
      slug: 'istanbul-hq',
      address: 'Besiktas, Istanbul',
      phone: '+90 212 123 4567',
      timezone: 'Europe/Istanbul',
      isActive: true,
    },
  });

  console.log('✅ Created branch:', branch.id);

  // Hash password for test users (password: 'Test@123456')
  const hashedPassword = await hashPassword('Test@123456');

  // Create test users with hashed passwords
  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'admin@acme.com',
      passwordHash: hashedPassword,
      role: 'PATRON',
      isActive: true,
    },
  });

  const manager = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'manager@acme.com',
      passwordHash: hashedPassword,
      role: 'SUBE_MUDURU',
      isActive: true,
    },
  });

  console.log('✅ Created users:', admin.id, manager.id);
  console.log('\n🎉 Database seeded successfully!');
  console.log(`\nTest credentials:
  Email: admin@acme.com or manager@acme.com
  Password: Test@123456
  Tenant ID: ${tenant.id}
  `);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
