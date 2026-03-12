import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./prisma/dev.db' });
const prisma = new PrismaClient({ adapter });

async function main() {
    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            password: 'admin123',
            name: 'Admin User',
            role: 'admin',
        },
    });

    const editor = await prisma.user.upsert({
        where: { username: 'editor' },
        update: {},
        create: {
            username: 'editor',
            password: 'editor123',
            name: 'Editorial Staff',
            role: 'editor',
        },
    });

    console.log('✅ Seed completed!');
    console.log('   Admin:', admin.username, '/ admin123');
    console.log('   Editor:', editor.username, '/ editor123');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
