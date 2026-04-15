// src/supabaseClient.js
// Kochbuch-System mit privaten/öffentlichen Bereichen + Anfragen

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⚠️  Supabase-Zugangsdaten fehlen!");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── AUTH ───
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

// ─── PROFILES ───
export const profilesAPI = {
  async list() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, role, cookbook_visibility, display_name");
    if (error) throw error;
    return data || [];
  },
  async get(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, role, cookbook_visibility, display_name")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return data;
  },
  async getMine() {
    const user = await authAPI.getUser();
    if (!user) return null;
    return await this.get(user.id);
  },
  async updateMine(updates) {
    const user = await authAPI.getUser();
    if (!user) throw new Error("Nicht eingeloggt");
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// ─── RECIPES ───
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
    const { data, error } = await supabase.from("recipes").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  },

  async getPublic(id) {
    const { data, error } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", id)
      .eq("visibility", "public")
      .single();
    if (error) throw error;
    return data;
  },

  async create(recipe) {
    const user = await authAPI.getUser();
    if (!user) throw new Error("Nicht eingeloggt");
    const { id, ...payload } = recipe;
    payload.user_id = user.id;
    const { data, error } = await supabase.from("recipes").insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  async update(id, recipe) {
    const { id: _, created_at, user_id, ...payload } = recipe;
    payload.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("recipes").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) throw error;
  },

  // Visibility ändern (private ↔ public)
  async setVisibility(id, visibility) {
    const { data, error } = await supabase
      .from("recipes")
      .update({ visibility })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Rezept ins öffentliche Kochbuch hochladen (= Kopie mit visibility=public)
  async uploadToPublic(recipe) {
    const user = await authAPI.getUser();
    if (!user) throw new Error("Nicht eingeloggt");
    const copy = { ...recipe };
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    copy.user_id = user.id;
    copy.visibility = "public";
    copy.copied_from = recipe.id;
    const { data, error } = await supabase.from("recipes").insert([copy]).select().single();
    if (error) throw error;
    return data;
  },

  // Eigene Kopie eines Rezepts erstellen (privat)
  async copyToMine(recipe) {
    const user = await authAPI.getUser();
    if (!user) throw new Error("Nicht eingeloggt");
    const copy = { ...recipe };
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    copy.user_id = user.id;
    copy.visibility = "private";
    copy.copied_from = recipe.id;
    const { data, error } = await supabase.from("recipes").insert([copy]).select().single();
    if (error) throw error;
    return data;
  },
};

// ─── FAVORITES ───
export const favoritesAPI = {
  async list() {
    const user = await authAPI.getUser();
    if (!user) return [];
    const { data, error } = await supabase.from("favorites").select("recipe_id").eq("user_id", user.id);
    if (error) throw error;
    return (data || []).map((f) => f.recipe_id);
  },
  async add(recipeId) {
    const user = await authAPI.getUser();
    if (!user) throw new Error("Nicht eingeloggt");
    const { error } = await supabase.from("favorites").insert([{ recipe_id: recipeId, user_id: user.id }]);
    if (error && error.code !== "23505") throw error;
  },
  async remove(recipeId) {
    const user = await authAPI.getUser();
    if (!user) throw new Error("Nicht eingeloggt");
    const { error } = await supabase.from("favorites").delete().eq("recipe_id", recipeId).eq("user_id", user.id);
    if (error) throw error;
  },
};

// ─── REQUESTS (Übernahme-Anfragen) ───
export const requestsAPI = {
  // Eingehende Anfragen (für Owner)
  async listIncoming() {
    const user = await authAPI.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from("recipe_requests")
      .select(`
        id, status, message, created_at, responded_at,
        recipe_id, requester_id,
        recipes (id, title_de, title_en, image_url, emoji),
        requester:profiles!recipe_requests_requester_id_fkey (id, email, display_name)
      `)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Ausgehende Anfragen (für Requester)
  async listOutgoing() {
    const user = await authAPI.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from("recipe_requests")
      .select(`
        id, status, message, created_at, responded_at,
        recipe_id, owner_id,
        recipes (id, title_de, title_en, image_url, emoji),
        owner:profiles!recipe_requests_owner_id_fkey (id, email, display_name)
      `)
      .eq("requester_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(recipeId, ownerId, message = null) {
    const user = await authAPI.getUser();
    if (!user) throw new Error("Nicht eingeloggt");
    if (user.id === ownerId) throw new Error("Eigene Rezepte musst du nicht anfragen");

    const { data, error } = await supabase
      .from("recipe_requests")
      .insert([{
        recipe_id: recipeId,
        requester_id: user.id,
        owner_id: ownerId,
        message,
        status: "pending",
      }])
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Du hast für dieses Rezept bereits eine Anfrage gestellt");
      throw error;
    }
    return data;
  },

  async accept(requestId) {
    // 1. Request laden
    const { data: req, error: reqErr } = await supabase
      .from("recipe_requests")
      .select("recipe_id, requester_id, owner_id")
      .eq("id", requestId)
      .single();
    if (reqErr) throw reqErr;

    // 2. Rezept laden
    const { data: recipe, error: recErr } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", req.recipe_id)
      .single();
    if (recErr) throw recErr;

    // 3. Kopie für den Requester anlegen
    const copy = { ...recipe };
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    copy.user_id = req.requester_id;
    copy.visibility = "private";
    copy.copied_from = recipe.id;

    const { error: insErr } = await supabase.from("recipes").insert([copy]);
    if (insErr) throw insErr;

    // 4. Request auf "accepted" setzen
    const { error: updErr } = await supabase
      .from("recipe_requests")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", requestId);
    if (updErr) throw updErr;
  },

  async reject(requestId) {
    const { error } = await supabase
      .from("recipe_requests")
      .update({ status: "rejected", responded_at: new Date().toISOString() })
      .eq("id", requestId);
    if (error) throw error;
  },

  async cancel(requestId) {
    const { error } = await supabase.from("recipe_requests").delete().eq("id", requestId);
    if (error) throw error;
  },
};

// ─── STORAGE ───
export const storageAPI = {
  async uploadImage(file) {
    const ext = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("recipe-images")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("recipe-images").getPublicUrl(fileName);
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

// ─── IMPORT (URL → Rezept) ───
export const importAPI = {
  async fromUrl(url) {
    const response = await fetch(`${supabaseUrl}/functions/v1/import-recipe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Import fehlgeschlagen (${response.status})`);
    }
    const data = await response.json();
    return data.recipe;
  },
};
