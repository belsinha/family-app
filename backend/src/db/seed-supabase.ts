import { getSupabaseClient } from './supabase.js';
import { hashPassword, generateStrongPassword } from '../utils/auth.js';
import { config } from '../config.js';

export async function seedDatabase() {
  const supabase = getSupabaseClient();

  const houses = [
    'Campo Bom',
    'Morro Grande 149',
    'Morro Grande 177',
    'Tubarao',
    'Brooksville',
    'Terrenos'
  ];

  const houseIds: { [key: string]: number } = {};

  // Insert houses
  for (const houseName of houses) {
    const { data: house, error } = await supabase
      .from('houses')
      .insert({ name: houseName })
      .select('id')
      .single();
    
    if (error) {
      throw new Error(`Failed to insert house ${houseName}: ${error.message}`);
    }
    
    if (house) {
      houseIds[houseName] = house.id;
    }
  }

  // Insert parents with strong, unique, randomly-generated passwords. Parent/family accounts
  // are admin-equivalent (can add/remove points, manage bitcoin payouts), so they don't get a
  // shared guessable default the way child accounts intentionally do — see below. Each password
  // can be pinned via env (e.g. for a scripted first deploy); otherwise one is generated and
  // printed once so it can be captured and then changed via /auth/change-password.
  const parentHouseId = houseIds['Campo Bom'] || houseIds[houses[0]];
  const rommelPlaintextPassword = process.env.SEED_ROMMEL_PASSWORD || generateStrongPassword();
  const celianePlaintextPassword = process.env.SEED_CELIANE_PASSWORD || generateStrongPassword();

  const { data: rommel, error: rommelError } = await supabase
    .from('users')
    .insert({
      name: 'Rommel',
      role: 'parent',
      house_id: parentHouseId,
      password_hash: await hashPassword(rommelPlaintextPassword),
    })
    .select('id')
    .single();

  if (rommelError) {
    throw new Error(`Failed to insert user Rommel: ${rommelError.message}`);
  }

  const { data: celiane, error: celianeError } = await supabase
    .from('users')
    .insert({
      name: 'Celiane',
      role: 'parent',
      house_id: parentHouseId,
      password_hash: await hashPassword(celianePlaintextPassword),
    })
    .select('id')
    .single();

  if (celianeError) {
    throw new Error(`Failed to insert user Celiane: ${celianeError.message}`);
  }

  // Insert children. In production there is no shared, guessable default — each child gets a
  // strong random password (or an explicit SEED_<NAME>_PASSWORD override), printed once just
  // like the parent passwords, so a fresh prod deploy never goes live with a known credential.
  // Outside production, kids keep the low-friction "their own name" password: that's an
  // intentional, documented UX tradeoff for low-privilege accounts on a trusted home network,
  // not something worth defaulting away from in dev/local use — see README "Security:
  // authentication posture".
  const children = [
    { name: 'Isabel', houseId: parentHouseId },
    { name: 'Nicholas', houseId: parentHouseId },
    { name: 'Laura', houseId: parentHouseId }
  ];

  const childPlaintextPasswords: { name: string; password: string }[] = [];

  for (const child of children) {
    const envOverride = process.env[`SEED_${child.name.toUpperCase()}_PASSWORD`];
    const childPlaintextPassword =
      envOverride || (config.isProduction ? generateStrongPassword() : child.name.toLowerCase());
    if (config.isProduction) {
      childPlaintextPasswords.push({ name: child.name, password: childPlaintextPassword });
    }
    const childPassword = await hashPassword(childPlaintextPassword);

    const { data: childUser, error: userError } = await supabase
      .from('users')
      .insert({
        name: child.name,
        role: 'child',
        house_id: child.houseId,
        password_hash: childPassword,
      })
      .select('id')
      .single();

    if (userError) {
      throw new Error(`Failed to insert user ${child.name}: ${userError.message}`);
    }

    if (childUser) {
      const { error: childError } = await supabase
        .from('children')
        .insert({
          name: child.name,
          user_id: childUser.id,
          house_id: child.houseId,
        });

      if (childError) {
        throw new Error(`Failed to insert child ${child.name}: ${childError.message}`);
      }
    }
  }

  console.log('==================================================================');
  console.log('Initial parent passwords (shown once — save them now):');
  console.log(`  Rommel:  ${rommelPlaintextPassword}`);
  console.log(`  Celiane: ${celianePlaintextPassword}`);
  if (childPlaintextPasswords.length > 0) {
    console.log('Initial child passwords (production — shown once, save them now):');
    for (const { name, password } of childPlaintextPasswords) {
      console.log(`  ${name}: ${password}`);
    }
  }
  console.log('Change these via "Change Password" after first login.');
  console.log('==================================================================');
}





