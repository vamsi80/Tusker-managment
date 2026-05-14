const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Migrating existing notes to checkInNotes...');
  
  const records = await prisma.attendance.findMany({
    where: {
      notes: { not: null },
      checkInNotes: null
    }
  });

  console.log(`Found ${records.length} records to migrate.`);

  for (const record of records) {
    await prisma.attendance.update({
      where: { id: record.id },
      data: {
        checkInNotes: record.notes
      }
    });
  }

  console.log('Migration complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
