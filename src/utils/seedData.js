import db from '../db/database.js';
import { isDemoSeedEnabled } from '../config/branding.js';
import { demoProducts, demoStaff } from './demoSeedData.js';

let seedPromise = null;

export function seedDatabase() {
  if (!seedPromise) {
    seedPromise = performSeed();
  }
  return seedPromise;
}

async function performSeed() {
  const staffCount = await db.staff.count();
  if (staffCount > 0) return;

  if (isDemoSeedEnabled) {
    await db.staff.bulkAdd(demoStaff);
    const productCount = await db.products.count();
    if (productCount === 0) {
      await db.products.bulkAdd(demoProducts);
    }
    return;
  }

  await db.staff.add({
    name: 'Owner',
    pin: '111111',
    role: 'owner',
  });
}
