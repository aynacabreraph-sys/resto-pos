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
  const staffCount = Number(await db.rpc('staff_count'));
  if (staffCount > 0) return;

  if (isDemoSeedEnabled) {
    for (const person of demoStaff) await db.rpc('save_staff_record', { p_id: null, p_name: person.name, p_role: person.role, p_hourly_rate: person.hourlyRate || 0, p_profile_image: person.profileImage || null, p_pin: person.pin });
    await db.rpc('authenticate_staff', { p_pin: demoStaff[0].pin });
    try { const productCount = await db.products.count(); if (productCount === 0) await db.products.bulkAdd(demoProducts); }
    finally { await db.rpc('end_pos_session'); }
    return;
  }

  throw new Error('No staff account exists. Create the initial owner in Supabase before opening the POS.');
}
