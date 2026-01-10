import { getSupabaseClient } from './supabase.js';
import { hashPassword } from '../utils/auth.js';

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

  // Insert parents with passwords (default password: "password")
  const parentHouseId = houseIds['Campo Bom'] || houseIds[houses[0]];
  const parentPassword = await hashPassword('password');
  
  const { data: rommel, error: rommelError } = await supabase
    .from('users')
    .insert({
      name: 'Rommel',
      role: 'parent',
      house_id: parentHouseId,
      password_hash: parentPassword,
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
      password_hash: parentPassword,
    })
    .select('id')
    .single();
  
  if (celianeError) {
    throw new Error(`Failed to insert user Celiane: ${celianeError.message}`);
  }

  // Insert children with passwords (default password: their name lowercase)
  const children = [
    { name: 'Isabel', houseId: parentHouseId },
    { name: 'Nicholas', houseId: parentHouseId },
    { name: 'Laura', houseId: parentHouseId }
  ];

  for (const child of children) {
    const childPassword = await hashPassword(child.name.toLowerCase());
    
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
}





