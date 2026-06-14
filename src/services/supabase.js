import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;

/**
 * Get or initialize the Supabase client instance.
 * Credentials are read dynamically from arguments, localStorage, or environment variables.
 */
export function getSupabaseClient(url, key) {
  const supabaseUrl = url || localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseKey = key || localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  // If credentials changed, recreate client
  if (supabaseClient && (supabaseClient.supabaseUrl !== supabaseUrl)) {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  } else if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }

  return supabaseClient;
}

/**
 * Fetch all history items from Supabase, ordered by created_at desc.
 */
export async function fetchHistory(url, key) {
  const client = getSupabaseClient(url, key);
  if (!client) return null;

  const { data, error } = await client
    .from('learning_history')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(item => ({
    id: item.id,
    topic: item.topic,
    timestamp: item.timestamp,
    explanations: item.explanations,
    visualMap: item.visual_map,
    followUps: item.follow_ups,
    quizzes: item.quizzes,
    studyPlan: item.study_plan
  }));
}

/**
 * Upsert a history item to Supabase.
 */
export async function saveHistoryItem(item, url, key) {
  const client = getSupabaseClient(url, key);
  if (!client) return;

  const { error } = await client
    .from('learning_history')
    .upsert({
      id: item.id,
      topic: item.topic,
      timestamp: item.timestamp,
      explanations: item.explanations,
      visual_map: item.visualMap,
      follow_ups: item.followUps,
      quizzes: item.quizzes,
      study_plan: item.studyPlan
    });

  if (error) throw error;
}

/**
 * Delete a history item from Supabase by ID.
 */
export async function deleteHistoryItem(id, url, key) {
  const client = getSupabaseClient(url, key);
  if (!client) return;

  const { error } = await client
    .from('learning_history')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Fetch learning stats from Supabase.
 */
export async function fetchStats(url, key) {
  const client = getSupabaseClient(url, key);
  if (!client) return null;

  const { data, error } = await client
    .from('learning_stats')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    quizzesTaken: data.quizzes_taken,
    avgScore: data.avg_score,
    totalScores: data.total_scores
  };
}

/**
 * Upsert learning stats to Supabase.
 */
export async function saveStats(stats, url, key) {
  const client = getSupabaseClient(url, key);
  if (!client) return;

  const { error } = await client
    .from('learning_stats')
    .upsert({
      id: 1,
      quizzes_taken: stats.quizzesTaken,
      avg_score: stats.avgScore,
      total_scores: stats.totalScores
    });

  if (error) throw error;
}
