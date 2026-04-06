// src/supabaseClient.js
// ─────────────────────────────────────────────
// Supabase-Client mit Auth-Support
// ─────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "⚠️  Supabase-Zugangsdaten fehlen! Bitte .env-Datei anlegen mit:\n" +
    "VITE_SUPABASE_URL=...\n" +
    "VITE_SUPABASE_ANON_KEY=..."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─────────────────────────────────────────────
// AUTH-API
// ─────────────────────────────────────────────

export const authAPI = {
  async getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  onAuthChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      callback(session?.user || null);
    });
    return subscription;
  },
};

// ─────────────────────────────────────────────
// REZEPTE-API
// ─────────────────────────────────────────────

export const recipesAPI = {
  async list() {
    const { data, error } = await supabase
      .from("recipes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async get(id) {
    const { data, error } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(recipe) {
    const user = await authAPI.getUser();
    if (!user) throw new Error("Nicht eingeloggt");

    const { id, ...payload } = recipe;
    payload.user_id = user.id;

    const { data, error } = await supabase
      .from("recipes")
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, recipe) {
    const { id: _, created_at, user_id, ...payload } = recipe;
    payload.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("recipes")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
// FAVORITES-API
// ─────────────────────────────────────────────

export const favoritesAPI = {
  async list() {
    const user = await authAPI.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("favorites")
      .select("recipe_id")
      .eq("user_id", user.id);
    if (error) throw error;
    return (data || []).map((f) => f.recipe_id);
  },

  async add(recipeId) {
    const user = await authAPI.getUser();
    if (!user) throw new Error("Nicht eingeloggt");

    const { error } = await supabase
      .from("favorites")
      .insert([{ recipe_id: recipeId, user_id: user.id }]);
    if (error && error.code !== "23505") throw error;
  },

  async remove(recipeId) {
    const user = await authAPI.getUser();
    if (!user) throw new Error("Nicht eingeloggt");

    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("recipe_id", recipeId)
      .eq("user_id", user.id);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
// STORAGE-API
// ─────────────────────────────────────────────

export const storageAPI = {
  async uploadImage(file) {
    const ext = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("recipe-images")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("recipe-images")
      .getPublicUrl(fileName);

    return data.publicUrl;
  },

  async deleteImage(imageUrl) {
    if (!imageUrl || !imageUrl.includes("recipe-images")) return;
    try {
      const fileName = imageUrl.split("/recipe-images/")[1];
      if (!fileName) return;
      await supabase.storage.from("recipe-images").remove([fileName]);
    } catch (e) {
      console.warn("Bild konnte nicht gelöscht werden:", e);
    }
  },
};

