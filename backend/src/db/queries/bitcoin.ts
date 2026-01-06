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
  
  return data.reduce((sum: number, conversion: any) => sum + (conversion.satoshis || 0), 0);
}

