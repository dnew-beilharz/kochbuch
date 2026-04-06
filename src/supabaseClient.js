// src/supabaseClient.js
// ─────────────────────────────────────────────
// Supabase-Client-Konfiguration
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
// Datenbank-API (alle Calls gegen Supabase)
// ─────────────────────────────────────────────

export const recipesAPI = {
  // Alle Rezepte laden, neueste zuerst
  async list() {
    const { data, error } = await supabase
      .from("recipes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Einzelnes Rezept laden
  async get(id) {
    const { data, error } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  // Neues Rezept erstellen
  async create(recipe) {
    // id rausnehmen, damit Supabase eine UUID generiert
    const { id, ...payload } = recipe;
    const { data, error } = await supabase
      .from("recipes")
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Rezept aktualisieren
  async update(id, recipe) {
    const { id: _, created_at, ...payload } = recipe;
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

  // Rezept löschen
  async delete(id) {
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) throw error;
  },
};

export const favoritesAPI = {
  // Alle Favoriten eines Users (vorerst "anonymous")
  async list(userId = "anonymous") {
    const { data, error } = await supabase
      .from("favorites")
      .select("recipe_id")
      .eq("user_id", userId);
    if (error) throw error;
    return (data || []).map((f) => f.recipe_id);
  },

  // Favorit hinzufügen
  async add(recipeId, userId = "anonymous") {
    const { error } = await supabase
      .from("favorites")
      .insert([{ recipe_id: recipeId, user_id: userId }]);
    if (error && error.code !== "23505") throw error; // 23505 = duplicate, ignorieren
  },

  // Favorit entfernen
  async remove(recipeId, userId = "anonymous") {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("recipe_id", recipeId)
      .eq("user_id", userId);
    if (error) throw error;
  },
};

export const storageAPI = {
  // Bild hochladen, gibt öffentliche URL zurück
  async uploadImage(file) {
    const ext = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("recipe-images")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("recipe-images")
      .getPublicUrl(fileName);

    return data.publicUrl;
  },

  // Bild löschen (anhand der vollen URL)
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

