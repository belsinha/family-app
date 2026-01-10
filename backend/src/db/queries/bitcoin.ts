import { getSupabaseClient } from '../supabase.js';
import type { BitcoinPrice, BitcoinConversion } from '../../types.js';

export async function getLatestPrice(): Promise<BitcoinPrice | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('bitcoin_price_cache')
    .select('*')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    // Check if table doesn't exist
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Bitcoin tables not found. Please run the schema SQL in Supabase: backend/src/db/schema-postgres-supabase.sql');
    }
    throw new Error(`Failed to fetch latest price: ${error.message}`);
  }
  
  return data as BitcoinPrice | null;
}

export async function savePrice(priceUsd: number, fetchedAt: Date): Promise<BitcoinPrice> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('bitcoin_price_cache')
    .insert({
      price_usd: priceUsd,
      fetched_at: fetchedAt.toISOString(),
    })
    .select()
    .single();
  
  if (error || !data) {
    // Check if table doesn't exist
    if (error?.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Bitcoin tables not found. Please run the schema SQL in Supabase: backend/src/db/schema-postgres-supabase.sql');
    }
    throw new Error(`Failed to save price: ${error?.message || 'Unknown error'}`);
  }
  
  return data as BitcoinPrice;
}

export async function createConversion(conversionData: {
  childId: number;
  pointId?: number | null;
  bonusPointsConverted: number;
  satoshis: number;
  btcAmount: number;
  usdValue: number;
  priceUsd: number;
  priceTimestamp: Date;
  parentId?: number | null;
}): Promise<BitcoinConversion> {
  const supabase = getSupabaseClient();
  
  // STRICT VALIDATION: pointId is REQUIRED for all new conversions
  // This prevents creating orphaned conversions
  if (conversionData.pointId === undefined || conversionData.pointId === null) {
    const errorMsg = `❌ BLOCKED: Cannot create Bitcoin conversion without pointId. This is required to link conversions to points. Conversion data: ${JSON.stringify({...conversionData, pointId: 'MISSING'})}`;
    console.error(errorMsg);
    console.error('Stack trace:', new Error().stack);
    throw new Error(`Cannot create Bitcoin conversion without pointId. All conversions must be linked to a point.`);
  }
  
  // Ensure pointId is a valid number
  const pointId = Number(conversionData.pointId);
  if (isNaN(pointId) || pointId <= 0) {
    const errorMsg = `ERROR: Invalid pointId: ${conversionData.pointId} (converted to ${pointId}). Conversion data: ${JSON.stringify(conversionData)}`;
    console.error(errorMsg);
    throw new Error(`Invalid pointId for Bitcoin conversion: ${pointId}`);
  }
  
  // Log the point_id being saved
  console.log(`Creating Bitcoin conversion:`, {
    pointId: pointId,
    pointId_type: typeof pointId,
    original_pointId: conversionData.pointId,
    original_type: typeof conversionData.pointId,
    childId: conversionData.childId,
    satoshis: conversionData.satoshis
  });
  
  // Prepare insert data with explicit point_id
  const insertData = {
      child_id: conversionData.childId,
      point_id: pointId, // This MUST be a valid number, not null
      bonus_points_converted: conversionData.bonusPointsConverted,
      satoshis: conversionData.satoshis,
      btc_amount: conversionData.btcAmount,
      usd_value: conversionData.usdValue,
      price_usd: conversionData.priceUsd,
      price_timestamp: conversionData.priceTimestamp.toISOString(),
      parent_id: conversionData.parentId || null,
    };
  
  console.log(`Inserting conversion with data:`, JSON.stringify(insertData, null, 2));
  
  // Insert the conversion
  const { data: insertedConversion, error: insertError } = await supabase
    .from('bitcoin_conversions')
    .insert(insertData)
    .select()
    .single();
  
  if (insertError || !insertedConversion) {
    // Check if table doesn't exist
    if (insertError?.message.includes('relation') && insertError.message.includes('does not exist')) {
      throw new Error('Bitcoin tables not found. Please run the schema SQL in Supabase: backend/src/db/schema-postgres-supabase.sql');
    }
    // Check if point_id column doesn't exist
    if (insertError?.message.includes('point_id') || insertError?.message.includes('column')) {
      console.error(`Database error related to point_id column:`, insertError);
      throw new Error(`Database column issue: ${insertError?.message}. Please ensure the point_id column exists in bitcoin_conversions table.`);
    }
    console.error(`Failed to create conversion. Error:`, insertError);
    console.error(`Attempted insert data:`, {
      child_id: conversionData.childId,
      point_id: pointId,
      satoshis: conversionData.satoshis
    });
    throw new Error(`Failed to create conversion: ${insertError?.message || 'Unknown error'}`);
  }
  
  // Verify point_id was saved correctly by querying the database directly
  const { data: verifyConversion, error: verifyError } = await supabase
    .from('bitcoin_conversions')
    .select('id, point_id')
    .eq('id', insertedConversion.id)
    .single();
  
  if (verifyError) {
    console.error(`Error verifying conversion:`, verifyError);
  } else {
    console.log(`Verified conversion in DB:`, {
      id: verifyConversion.id,
      point_id: verifyConversion.point_id,
      point_id_type: typeof verifyConversion.point_id
    });
  }
  
  // Verify point_id was saved correctly
  const savedPointId = insertedConversion.point_id !== null && insertedConversion.point_id !== undefined 
    ? Number(insertedConversion.point_id) 
    : null;
    
  if (savedPointId === null || savedPointId !== pointId) {
    console.error(`ERROR: Conversion created but point_id mismatch!`, {
      conversion_id: insertedConversion.id,
      expected_point_id: pointId,
      saved_point_id: insertedConversion.point_id,
      saved_point_id_type: typeof insertedConversion.point_id,
      verified_point_id: verifyConversion?.point_id,
      full_record: insertedConversion
    });
    throw new Error(`Conversion created but point_id was not saved correctly. Expected: ${pointId}, Got: ${insertedConversion.point_id}`);
  }
  
  console.log(`✓ Conversion created successfully: ID ${insertedConversion.id}, point_id: ${insertedConversion.point_id}`);
  
  // Fetch parent name if parent_id exists
  let parentName = null;
  if (insertedConversion.parent_id) {
    const { data: parent } = await supabase
      .from('users')
      .select('name')
      .eq('id', insertedConversion.parent_id)
      .single();
    parentName = parent?.name || null;
  }
  
  return {
    ...insertedConversion,
    parent_name: parentName,
  } as BitcoinConversion;
}

export async function getConversionsByChildId(childId: number): Promise<BitcoinConversion[]> {
  const supabase = getSupabaseClient();
  const { data: conversions, error } = await supabase
    .from('bitcoin_conversions')
    .select('*')
    .eq('child_id', childId)
    .order('created_at', { ascending: false });
  
  if (error) {
    // Check if table doesn't exist
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Bitcoin tables not found. Please run the schema SQL in Supabase: backend/src/db/schema-postgres-supabase.sql');
    }
    throw new Error(`Failed to fetch conversions: ${error.message}`);
  }
  
  if (!conversions || conversions.length === 0) {
    return [];
  }
  
  // Get unique parent IDs
  const parentIds = [...new Set(conversions.map((c: any) => c.parent_id).filter(Boolean))];
  
  // Fetch all parent names in one query
  const parentNames: { [key: number]: string } = {};
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from('users')
      .select('id, name')
      .in('id', parentIds);
    
    if (parents) {
      parents.forEach((parent: any) => {
        parentNames[parent.id] = parent.name;
      });
    }
  }
  
  // Map conversions with parent names and ensure point_id is a number
  const mappedConversions = conversions.map((conversion: any) => {
    const pointId = conversion.point_id !== null && conversion.point_id !== undefined 
      ? Number(conversion.point_id) 
      : null;
    
    // Log all conversions for debugging
    console.log(`[GET_CONVERSIONS] Conversion ID ${conversion.id}:`, {
      raw_point_id: conversion.point_id,
      raw_point_id_type: typeof conversion.point_id,
      converted_point_id: pointId,
      child_id: conversion.child_id,
      satoshis: conversion.satoshis,
      created_at: conversion.created_at
    });
    
    return {
      ...conversion,
      point_id: pointId,
      parent_name: conversion.parent_id ? (parentNames[conversion.parent_id] || null) : null,
    };
  }) as BitcoinConversion[];
  
  console.log(`[GET_CONVERSIONS] Retrieved ${mappedConversions.length} total conversions for child ${childId}`);
  console.log(`[GET_CONVERSIONS] ${mappedConversions.filter(c => c.point_id !== null).length} conversions have valid point_id`);
  console.log(`[GET_CONVERSIONS] ${mappedConversions.filter(c => c.point_id === null).length} conversions have NULL point_id`);
  
  const withPointId = mappedConversions.filter(c => c.point_id !== null);
  if (withPointId.length > 0) {
    console.log(`[GET_CONVERSIONS] Conversions with point_id:`, withPointId.map(c => ({
      id: c.id,
      point_id: c.point_id,
      child_id: c.child_id
    })));
  }
  
  return mappedConversions;
}

export async function getTotalSatoshisByChildId(childId: number): Promise<number> {
  const supabase = getSupabaseClient();
  
  // First, try to get conversions with point_id (new schema)
  let conversions: any[] = [];
  let hasPointIdColumn = true;
  
  try {
    const { data, error } = await supabase
      .from('bitcoin_conversions')
      .select('satoshis, point_id')
      .eq('child_id', childId);
    
    if (error) {
      // Check if error is due to missing column
      if (error.message.includes('point_id') && error.message.includes('does not exist')) {
        hasPointIdColumn = false;
      } else {
        throw new Error(`Failed to fetch total satoshis: ${error.message}`);
      }
    } else {
      conversions = data || [];
    }
  } catch (error: any) {
    // If point_id column doesn't exist, fall back to old query
    if (error?.message && error.message.includes('point_id') && error.message.includes('does not exist')) {
      hasPointIdColumn = false;
    } else {
      throw error;
    }
  }
  
  // If point_id column doesn't exist, use simple query (backward compatibility)
  if (!hasPointIdColumn) {
    const { data, error } = await supabase
      .from('bitcoin_conversions')
      .select('satoshis')
      .eq('child_id', childId);
    
    if (error) {
      throw new Error(`Failed to fetch total satoshis: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      return 0;
    }
    
    // Simple sum for legacy schema
    return data.reduce((sum: number, conversion: any) => sum + (conversion.satoshis || 0), 0);
  }
  
  // New schema with point_id - filter out conversions for deleted points
  if (conversions.length === 0) {
    return 0;
  }
  
  // Get all point IDs that exist
  const pointIds = conversions
    .map((conv: any) => conv.point_id)
    .filter((id: any) => id !== null);
  
  if (pointIds.length > 0) {
    // Check which points still exist
    const { data: existingPoints } = await supabase
      .from('points')
      .select('id')
      .in('id', pointIds);
    
    const existingPointIds = new Set((existingPoints || []).map((p: any) => p.id));
    
    // Only count satoshis from conversions where the point still exists
    // Or from legacy conversions (point_id is null)
    return conversions.reduce((sum: number, conversion: any) => {
      if (conversion.point_id === null || existingPointIds.has(conversion.point_id)) {
        return sum + (conversion.satoshis || 0);
      }
      return sum;
    }, 0);
  }
  
  // If all conversions are legacy (no point_id), sum them all
  return conversions.reduce((sum: number, conversion: any) => sum + (conversion.satoshis || 0), 0);
}

export async function deleteConversionByPointId(pointId: number): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('bitcoin_conversions')
    .delete()
    .eq('point_id', pointId);
  
  if (error) {
    throw new Error(`Failed to delete conversion: ${error.message}`);
  }
  
  return true;
}

