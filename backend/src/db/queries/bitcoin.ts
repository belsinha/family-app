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
  pointId?: number;
  bonusPointsConverted: number;
  satoshis: number;
  btcAmount: number;
  usdValue: number;
  priceUsd: number;
  priceTimestamp: Date;
  parentId?: number;
}): Promise<BitcoinConversion> {
  const supabase = getSupabaseClient();
  
  // Insert the conversion
  const { data: insertedConversion, error: insertError } = await supabase
    .from('bitcoin_conversions')
    .insert({
      child_id: conversionData.childId,
      point_id: conversionData.pointId || null,
      bonus_points_converted: conversionData.bonusPointsConverted,
      satoshis: conversionData.satoshis,
      btc_amount: conversionData.btcAmount,
      usd_value: conversionData.usdValue,
      price_usd: conversionData.priceUsd,
      price_timestamp: conversionData.priceTimestamp.toISOString(),
      parent_id: conversionData.parentId || null,
    })
    .select()
    .single();
  
  if (insertError || !insertedConversion) {
    // Check if table doesn't exist
    if (insertError?.message.includes('relation') && insertError.message.includes('does not exist')) {
      throw new Error('Bitcoin tables not found. Please run the schema SQL in Supabase: backend/src/db/schema-postgres-supabase.sql');
    }
    throw new Error(`Failed to create conversion: ${insertError?.message || 'Unknown error'}`);
  }
  
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
  
  // Map conversions with parent names
  return conversions.map((conversion: any) => ({
    ...conversion,
    parent_name: conversion.parent_id ? (parentNames[conversion.parent_id] || null) : null,
  })) as BitcoinConversion[];
}

export async function getTotalSatoshisByChildId(childId: number): Promise<number> {
  const supabase = getSupabaseClient();
  
  // Get all conversions for this child
  const { data: conversions, error } = await supabase
    .from('bitcoin_conversions')
    .select('satoshis, point_id')
    .eq('child_id', childId);
  
  if (error) {
    throw new Error(`Failed to fetch total satoshis: ${error.message}`);
  }
  
  if (!conversions || conversions.length === 0) {
    return 0;
  }
  
  // Filter out conversions where the point was deleted (point_id exists but point doesn't)
  // Also include conversions without point_id (legacy data) - these should be cleaned up
  const validConversions = conversions.filter((conv: any) => {
    // If point_id is null, it's legacy data - we'll include it for now
    // In the future, we might want to clean these up
    if (conv.point_id === null) {
      return true;
    }
    // If point_id exists, we need to check if the point still exists
    // For now, we'll include all conversions with point_id
    // The CASCADE delete should have removed them, but we'll verify
    return true;
  });
  
  // Get all point IDs that exist
  const pointIds = validConversions
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
    return validConversions.reduce((sum: number, conversion: any) => {
      if (conversion.point_id === null || existingPointIds.has(conversion.point_id)) {
        return sum + (conversion.satoshis || 0);
      }
      return sum;
    }, 0);
  }
  
  // If all conversions are legacy (no point_id), sum them all
  return validConversions.reduce((sum: number, conversion: any) => sum + (conversion.satoshis || 0), 0);
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

