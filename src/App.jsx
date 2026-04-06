// src/App.jsx
// ═══════════════════════════════════════════════════════════════
//  🍳 MEIN KOCHBUCH / MY COOKBOOK
//  Full-Stack App mit echter Supabase-Integration
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useRef } from "react";
import { recipesAPI, favoritesAPI, storageAPI } from "./supabaseClient";

// ─── Kategorien & Schwierigkeitsgrade ───
const CATEGORIES = {
  all:      { de: "Alle",           en: "All",            icon: "📚" },
  soups:    { de: "Suppen",         en: "Soups",          icon: "🍲" },
  mains:    { de: "Hauptgerichte",  en: "Main Courses",   icon: "🍽️" },
  desserts: { de: "Desserts",       en: "Desserts",       icon: "🍰" },
  salads:   { de: "Salate",         en: "Salads",         icon: "🥗" },
  bread:    { de: "Brot & Gebäck",  en: "Bread & Pastry", icon: "🍞" },
};

const DIFFICULTIES = {
  easy:   { de: "Einfach", en: "Easy",   color: "#4CAF50", icon: "🟢" },
  medium: { de: "Mittel",  en: "Medium", color: "#FF9800", icon: "🟡" },
  hard:   { de: "Schwer",  en: "Hard",   color: "#E53935", icon: "🔴" },
};

// ═════════════════════════════════════════════
//  MAIN APP
// ═════════════════════════════════════════════
export default function CookbookApp() {
  const [lang, setLang] = useState("de");
  const [recipes, setRecipes] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("list"); // list | detail | form | edit
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [servings, setServings] = useState(4);
  const [toast, setToast] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  // ─── Initial-Daten laden ───
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [recipesData, favsData] = await Promise.all([
        recipesAPI.list(),
        favoritesAPI.list(),
      ]);
      setRecipes(recipesData);
      setFavorites(favsData);
    } catch (err) {
      console.error("Fehler beim Laden:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  // ─── CRUD ───
  const saveRecipe = async (recipe) => {
    setSaving(true);
    try {
      if (recipe.id) {
        // Update
        const updated = await recipesAPI.update(recipe.id, recipe);
        setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        showToast(lang === "de" ? "Rezept aktualisiert ✓" : "Recipe updated ✓");
      } else {
        // Create
        const created = await recipesAPI.create(recipe);
        setRecipes((prev) => [created, ...prev]);
        showToast(lang === "de" ? "Rezept gespeichert ✓" : "Recipe saved ✓");
      }
      setView("list");
    } catch (err) {
      console.error("Fehler beim Speichern:", err);
      showToast(
        (lang === "de" ? "Fehler: " : "Error: ") + err.message,
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteRecipe = async (id) => {
    try {
      const recipe = recipes.find((r) => r.id === id);
      await recipesAPI.delete(id);
      if (recipe?.image_url) {
        await storageAPI.deleteImage(recipe.image_url);
      }
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      setFavorites((prev) => prev.filter((f) => f !== id));
      setDeleteConfirm(null);
      setView("list");
      showToast(lang === "de" ? "Rezept gelöscht" : "Recipe deleted");
    } catch (err) {
      console.error("Fehler beim Löschen:", err);
      showToast((lang === "de" ? "Fehler: " : "Error: ") + err.message, "error");
    }
  };

  const toggleFavorite = async (id) => {
    const isFav = favorites.includes(id);
    try {
      if (isFav) {
        await favoritesAPI.remove(id);
        setFavorites((prev) => prev.filter((f) => f !== id));
      } else {
        await favoritesAPI.add(id);
        setFavorites((prev) => [...prev, id]);
      }
    } catch (err) {
      console.error("Favorit-Fehler:", err);
      showToast((lang === "de" ? "Fehler: " : "Error: ") + err.message, "error");
    }
  };

  // ─── Filtern ───
  const filtered = useMemo(() => {
    return recipes.filter((r) => {
      const s = search.toLowerCase();
      const matchSearch = !s
        || (r.title_de || "").toLowerCase().includes(s)
        || (r.title_en || "").toLowerCase().includes(s)
        || (r.tags || []).some((t) => t.toLowerCase().includes(s))
        || (r.ingredients || []).some((i) =>
            (i.name_de || "").toLowerCase().includes(s) ||
            (i.name_en || "").toLowerCase().includes(s)
          );
      const matchCat = catFilter === "all" || r.category === catFilter;
      const matchFav = !showFavsOnly || favorites.includes(r.id);
      return matchSearch && matchCat && matchFav;
    });
  }, [recipes, search, catFilter, showFavsOnly, favorites]);

  const selectedRecipe = recipes.find((r) => r.id === selectedId);

  const openDetail = (id) => {
    setSelectedId(id);
    const r = recipes.find((x) => x.id === id);
    if (r) setServings(r.base_servings || 4);
    setView("detail");
  };
  const openEdit = (id) => { setSelectedId(id); setView("edit"); };
  const openNew = () => { setSelectedId(null); setView("form"); };

  // ─── Loading State ───
  if (loading) {
    return (
      <div style={S.loadingScreen}>
        <style>{globalCSS}</style>
        <div style={S.loadingEmoji}>📖</div>
        <p style={S.loadingText}>
          {lang === "de" ? "Kochbuch wird geladen…" : "Loading cookbook…"}
        </p>
      </div>
    );
  }

  // ─── Error State ───
  if (error) {
    return (
      <div style={S.errorScreen}>
        <style>{globalCSS}</style>
        <div style={{ fontSize: 64 }}>⚠️</div>
        <h2 style={S.errorTitle}>
          {lang === "de" ? "Verbindungsfehler" : "Connection Error"}
        </h2>
        <p style={S.errorText}>{error}</p>
        <p style={S.errorHint}>
          {lang === "de"
            ? "Prüfe deine .env-Datei und Supabase-Zugangsdaten."
            : "Check your .env file and Supabase credentials."}
        </p>
        <button style={S.retryBtn} onClick={loadData}>
          {lang === "de" ? "Erneut versuchen" : "Retry"}
        </button>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <style>{globalCSS}</style>

      {toast && (
        <div style={{ ...S.toast, background: toast.type === "error" ? "#C0392B" : C.warm }}>
          {toast.msg}
        </div>
      )}

      {deleteConfirm && (
        <div style={S.overlay} onClick={() => setDeleteConfirm(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <p style={S.modalText}>
              {lang === "de" ? "Dieses Rezept wirklich löschen?" : "Really delete this recipe?"}
            </p>
            <div style={S.modalBtns}>
              <button style={S.modalCancel} onClick={() => setDeleteConfirm(null)}>
                {lang === "de" ? "Abbrechen" : "Cancel"}
              </button>
              <button style={S.modalDelete} onClick={() => deleteRecipe(deleteConfirm)}>
                {lang === "de" ? "Löschen" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── LIST VIEW ─── */}
      {view === "list" && (
        <>
          <header style={S.header}>
            <div style={S.headerLeft}>
              <span style={S.logo}>📖</span>
              <div>
                <h1 style={S.title}>{lang === "de" ? "Mein Kochbuch" : "My Cookbook"}</h1>
                <p style={S.subtitle}>
                  {lang === "de"
                    ? `${recipes.length} Rezepte in deiner Sammlung`
                    : `${recipes.length} recipes in your collection`}
                </p>
              </div>
            </div>
            <div style={S.headerRight}>
              <button style={S.addBtn} onClick={openNew}>
                + {lang === "de" ? "Neues Rezept" : "New Recipe"}
              </button>
              <button style={S.langToggle} onClick={() => setLang(lang === "de" ? "en" : "de")}>
                {lang === "de" ? "🇬🇧 EN" : "🇩🇪 DE"}
              </button>
            </div>
          </header>

          <div style={S.toolbar}>
            <div style={S.searchWrap}>
              <span style={S.searchIcon}>🔍</span>
              <input
                style={S.searchInput}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === "de" ? "Rezept, Zutat oder Tag suchen…" : "Search recipe, ingredient or tag…"}
              />
              {search && <button style={S.clearBtn} onClick={() => setSearch("")}>✕</button>}
            </div>
            <div style={S.filterBar}>
              <div style={S.catRow}>
                {Object.entries(CATEGORIES).map(([key, val]) => (
                  <button
                    key={key}
                    style={{ ...S.catChip, ...(catFilter === key ? S.catChipActive : {}) }}
                    onClick={() => setCatFilter(key)}
                  >
                    {val.icon} {val[lang]}
                  </button>
                ))}
              </div>
              <button
                style={{ ...S.favToggle, ...(showFavsOnly ? S.favToggleActive : {}) }}
                onClick={() => setShowFavsOnly(!showFavsOnly)}
              >
                {showFavsOnly ? "❤️" : "🤍"} {lang === "de" ? "Favoriten" : "Favorites"}
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={S.emptyState}>
              <span style={{ fontSize: 56 }}>🍽️</span>
              <p style={S.emptyText}>
                {recipes.length === 0
                  ? (lang === "de" ? "Noch keine Rezepte. Leg los!" : "No recipes yet. Get started!")
                  : (lang === "de" ? "Keine Rezepte gefunden" : "No recipes found")}
              </p>
              <button style={S.emptyBtn} onClick={openNew}>
                + {lang === "de" ? "Rezept hinzufügen" : "Add recipe"}
              </button>
            </div>
          ) : (
            <div style={S.grid}>
              {filtered.map((r, idx) => (
                <div
                  key={r.id}
                  className="recipe-card"
                  style={{ ...S.card, animationDelay: `${idx * 60}ms` }}
                  onClick={() => openDetail(r.id)}
                >
                  <div style={S.cardImgWrap}>
                    {r.image_url ? (
                      <img src={r.image_url} alt="" style={S.cardImg} />
                    ) : (
                      <span style={S.cardEmoji}>{r.emoji || "🍳"}</span>
                    )}
                    <button
                      className="fav-btn"
                      style={S.cardFav}
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(r.id); }}
                    >
                      {favorites.includes(r.id) ? "❤️" : "🤍"}
                    </button>
                    <span style={S.cardCatBadge}>
                      {CATEGORIES[r.category]?.icon} {CATEGORIES[r.category]?.[lang]}
                    </span>
                  </div>
                  <div style={S.cardBody}>
                    <h3 style={S.cardTitle}>
                      {lang === "de" ? r.title_de : (r.title_en || r.title_de)}
                    </h3>
                    <p style={S.cardDesc}>
                      {lang === "de" ? r.description_de : (r.description_en || r.description_de)}
                    </p>
                    <div style={S.cardMeta}>
                      <span style={S.cardMetaItem}>⏱ {r.time_minutes} min</span>
                      <span style={S.cardMetaItem}>
                        {DIFFICULTIES[r.difficulty]?.icon} {DIFFICULTIES[r.difficulty]?.[lang]}
                      </span>
                      <span style={S.cardMetaItem}>🍽 {r.base_servings}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === "detail" && selectedRecipe && (
        <DetailView
          recipe={selectedRecipe}
          lang={lang}
          setLang={setLang}
          servings={servings}
          setServings={setServings}
          isFav={favorites.includes(selectedRecipe.id)}
          onToggleFav={() => toggleFavorite(selectedRecipe.id)}
          onBack={() => setView("list")}
          onEdit={() => openEdit(selectedRecipe.id)}
          onDelete={() => setDeleteConfirm(selectedRecipe.id)}
        />
      )}

      {(view === "form" || view === "edit") && (
        <RecipeForm
          lang={lang}
          setLang={setLang}
          recipe={view === "edit" ? selectedRecipe : null}
          onSave={saveRecipe}
          onCancel={() => setView("list")}
          saving={saving}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════
//  DETAIL VIEW
// ═════════════════════════════════════════════
function DetailView({ recipe: r, lang, setLang, servings, setServings, isFav, onToggleFav, onBack, onEdit, onDelete }) {
  const ratio = servings / (r.base_servings || 4);
  const steps = lang === "de" ? r.steps_de : (r.steps_en || r.steps_de);
  const [checkedSteps, setCheckedSteps] = useState([]);

  const toggleStep = (i) =>
    setCheckedSteps((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);

  return (
    <div style={S.detailWrap}>
      <div style={S.detailNav}>
        <button style={S.backBtn} onClick={onBack}>← {lang === "de" ? "Zurück" : "Back"}</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.editBtn} onClick={onEdit}>✏️ {lang === "de" ? "Bearbeiten" : "Edit"}</button>
          <button style={S.deleteBtn} onClick={onDelete}>🗑️</button>
          <button style={S.langToggle} onClick={() => setLang(lang === "de" ? "en" : "de")}>
            {lang === "de" ? "🇬🇧" : "🇩🇪"}
          </button>
        </div>
      </div>

      <div style={S.detailHero}>
        <div style={S.heroImgWrap}>
          {r.image_url ? (
            <img src={r.image_url} alt="" style={S.heroImg} />
          ) : (
            <span style={S.heroEmoji}>{r.emoji || "🍳"}</span>
          )}
        </div>
        <div style={S.heroInfo}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 style={S.detailTitle}>
              {lang === "de" ? r.title_de : (r.title_en || r.title_de)}
            </h1>
            <button onClick={onToggleFav} style={S.heroFav}>
              {isFav ? "❤️" : "🤍"}
            </button>
          </div>
          <p style={S.detailDesc}>
            {lang === "de" ? r.description_de : (r.description_en || r.description_de)}
          </p>
          <div style={S.detailChips}>
            <span style={S.chip}>{CATEGORIES[r.category]?.icon} {CATEGORIES[r.category]?.[lang]}</span>
            <span style={S.chip}>⏱ {r.time_minutes} min</span>
            <span style={{ ...S.chip, borderColor: DIFFICULTIES[r.difficulty]?.color + "60" }}>
              {DIFFICULTIES[r.difficulty]?.icon} {DIFFICULTIES[r.difficulty]?.[lang]}
            </span>
          </div>
          {r.tags?.length > 0 && (
            <div style={S.tagRow}>
              {r.tags.map((t, i) => <span key={i} style={S.tag}>#{t}</span>)}
            </div>
          )}
        </div>
      </div>

      <div style={S.portionBar}>
        <span style={S.portionLabel}>{lang === "de" ? "🍽 Portionen" : "🍽 Servings"}</span>
        <div style={S.portionControls}>
          <button style={S.portionBtn} onClick={() => setServings(Math.max(1, servings - 1))}>−</button>
          <span style={S.portionNum}>{servings}</span>
          <button style={S.portionBtn} onClick={() => setServings(servings + 1)}>+</button>
        </div>
      </div>

      <div style={S.detailColumns}>
        <div>
          <h2 style={S.sectionHead}>📝 {lang === "de" ? "Zutaten" : "Ingredients"}</h2>
          <div style={S.ingList}>
            {(r.ingredients || []).map((ing, i) => {
              const amt = (ing.amount || 0) * ratio;
              const display = amt % 1 === 0 ? amt : amt.toFixed(1);
              const unit = lang === "de" ? (ing.unit_de || ing.unit || "") : (ing.unit_en || ing.unit || "");
              const name = lang === "de" ? ing.name_de : (ing.name_en || ing.name_de);
              return (
                <div key={i} style={S.ingRow}>
                  <span style={S.ingAmt}>{display} {unit}</span>
                  <span style={S.ingName}>{name}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 style={S.sectionHead}>👨‍🍳 {lang === "de" ? "Zubereitung" : "Instructions"}</h2>
          <div style={S.stepsList}>
            {(steps || []).map((step, i) => (
              <div
                key={i}
                style={{ ...S.stepRow, opacity: checkedSteps.includes(i) ? 0.45 : 1 }}
                onClick={() => toggleStep(i)}
              >
                <div style={{ ...S.stepNum, background: checkedSteps.includes(i) ? "#aaa" : C.accent }}>
                  {checkedSteps.includes(i) ? "✓" : i + 1}
                </div>
                <p style={{
                  ...S.stepText,
                  textDecoration: checkedSteps.includes(i) ? "line-through" : "none"
                }}>{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════
//  RECIPE FORM
// ═════════════════════════════════════════════
function RecipeForm({ lang, setLang, recipe, onSave, onCancel, saving, showToast }) {
  const isEdit = !!recipe;
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const empty = {
    title_de: "", title_en: "", description_de: "", description_en: "",
    category: "mains", difficulty: "easy", time_minutes: 30, base_servings: 4,
    image_url: null, emoji: "🍳",
    ingredients: [{ name_de: "", name_en: "", amount: "", unit: "g" }],
    steps_de: [""], steps_en: [""],
    tags: [],
  };

  const [form, setForm] = useState(recipe ? { ...empty, ...recipe } : empty);
  const [tagInput, setTagInput] = useState("");
  const [imagePreview, setImagePreview] = useState(recipe?.image_url || null);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const setIng = (idx, field, val) => {
    const updated = [...form.ingredients];
    updated[idx] = { ...updated[idx], [field]: val };
    setForm((f) => ({ ...f, ingredients: updated }));
  };
  const addIng = () => setForm((f) => ({
    ...f, ingredients: [...f.ingredients, { name_de: "", name_en: "", amount: "", unit: "g" }]
  }));
  const removeIng = (idx) => setForm((f) => ({
    ...f, ingredients: f.ingredients.filter((_, i) => i !== idx)
  }));

  const setStep = (lang2, idx, val) => {
    const key = `steps_${lang2}`;
    const updated = [...form[key]];
    updated[idx] = val;
    setForm((f) => ({ ...f, [key]: updated }));
  };
  const addStep = (lang2) => setForm((f) => ({ ...f, [`steps_${lang2}`]: [...f[`steps_${lang2}`], ""] }));
  const removeStep = (lang2, idx) => setForm((f) => ({
    ...f, [`steps_${lang2}`]: f[`steps_${lang2}`].filter((_, i) => i !== idx)
  }));

  const addTag = () => {
    if (tagInput.trim() && !form.tags.includes(tagInput.trim().toLowerCase())) {
      set("tags", [...form.tags, tagInput.trim().toLowerCase()]);
      setTagInput("");
    }
  };
  const removeTag = (t) => set("tags", form.tags.filter((x) => x !== t));

  // ─── Echter Image-Upload zu Supabase Storage ───
  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast(lang === "de" ? "Bild zu groß (max 5MB)" : "Image too large (max 5MB)", "error");
      return;
    }

    setUploading(true);
    // Sofortige lokale Vorschau
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);

    try {
      const { storageAPI } = await import("./supabaseClient");
      const publicUrl = await storageAPI.uploadImage(file);
      set("image_url", publicUrl);
      showToast(lang === "de" ? "Bild hochgeladen ✓" : "Image uploaded ✓");
    } catch (err) {
      console.error("Upload-Fehler:", err);
      showToast((lang === "de" ? "Upload fehlgeschlagen: " : "Upload failed: ") + err.message, "error");
      setImagePreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!form.title_de.trim()) {
      showToast(lang === "de" ? "Bitte gib einen Titel ein" : "Please enter a title", "error");
      return;
    }
    const cleaned = {
      ...form,
      time_minutes: parseInt(form.time_minutes) || 30,
      base_servings: parseInt(form.base_servings) || 4,
      ingredients: form.ingredients.filter((i) => i.name_de.trim()),
      steps_de: form.steps_de.filter((s) => s.trim()),
      steps_en: form.steps_en.filter((s) => s.trim()),
    };
    onSave(cleaned);
  };

  const L = {
    title: lang === "de" ? (isEdit ? "Rezept bearbeiten" : "Neues Rezept") : (isEdit ? "Edit Recipe" : "New Recipe"),
    titleDe: lang === "de" ? "Titel (Deutsch) *" : "Title (German) *",
    titleEn: lang === "de" ? "Titel (Englisch)" : "Title (English)",
    descDe: lang === "de" ? "Beschreibung (DE)" : "Description (DE)",
    descEn: lang === "de" ? "Beschreibung (EN)" : "Description (EN)",
    cat: lang === "de" ? "Kategorie" : "Category",
    diff: lang === "de" ? "Schwierigkeit" : "Difficulty",
    time: lang === "de" ? "Zeit (Min.)" : "Time (min)",
    portions: lang === "de" ? "Portionen" : "Servings",
    photo: lang === "de" ? "📷 Foto hochladen" : "📷 Upload Photo",
    emoji: "Emoji",
    ingTitle: lang === "de" ? "Zutaten" : "Ingredients",
    stepsDE: lang === "de" ? "Zubereitung (Deutsch)" : "Steps (German)",
    stepsEN: lang === "de" ? "Zubereitung (Englisch)" : "Steps (English)",
    tags: "Tags",
    save: saving ? (lang === "de" ? "Speichert…" : "Saving…") : (lang === "de" ? "💾 Speichern" : "💾 Save"),
    cancel: lang === "de" ? "Abbrechen" : "Cancel",
    addIng: lang === "de" ? "+ Zutat" : "+ Ingredient",
    addStep: lang === "de" ? "+ Schritt" : "+ Step",
    nameDe: lang === "de" ? "Name (DE)" : "Name (DE)",
    nameEn: lang === "de" ? "Name (EN)" : "Name (EN)",
    amount: lang === "de" ? "Menge" : "Amount",
    unit: lang === "de" ? "Einheit" : "Unit",
  };

  return (
    <div style={S.formWrap}>
      <div style={S.formNav}>
        <button style={S.backBtn} onClick={onCancel}>← {L.cancel}</button>
        <button style={S.langToggle} onClick={() => setLang(lang === "de" ? "en" : "de")}>
          {lang === "de" ? "🇬🇧" : "🇩🇪"}
        </button>
      </div>

      <h1 style={S.formTitle}>{L.title}</h1>

      <div style={S.imageUploadArea}>
        {imagePreview ? (
          <div style={S.imagePreviewWrap}>
            <img src={imagePreview} alt="" style={S.imagePreview} />
            {uploading && (
              <div style={S.uploadOverlay}>
                <span>{lang === "de" ? "Wird hochgeladen…" : "Uploading…"}</span>
              </div>
            )}
            <button style={S.removeImgBtn} onClick={() => { setImagePreview(null); set("image_url", null); }}>✕</button>
          </div>
        ) : (
          <div style={S.uploadPlaceholder} onClick={() => fileRef.current?.click()}>
            <span style={{ fontSize: 40 }}>{form.emoji || "📷"}</span>
            <p style={S.uploadText}>{L.photo}</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImage} />
        {!imagePreview && (
          <div style={S.emojiPicker}>
            <label style={S.fieldLabel}>{L.emoji}</label>
            <div style={S.emojiRow}>
              {["🍳", "🥘", "🍲", "🥗", "🍰", "🍞", "🥩", "🍜", "🍕", "🥔", "🐟", "🥧"].map((e) => (
                <button
                  key={e}
                  style={{ ...S.emojiBtn, ...(form.emoji === e ? S.emojiBtnActive : {}) }}
                  onClick={() => set("emoji", e)}
                >{e}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={S.fieldGrid}>
        <div style={S.fieldFull}>
          <label style={S.fieldLabel}>{L.titleDe}</label>
          <input style={S.input} value={form.title_de} onChange={(e) => set("title_de", e.target.value)} />
        </div>
        <div style={S.fieldFull}>
          <label style={S.fieldLabel}>{L.titleEn}</label>
          <input style={S.input} value={form.title_en || ""} onChange={(e) => set("title_en", e.target.value)} />
        </div>
        <div style={S.fieldFull}>
          <label style={S.fieldLabel}>{L.descDe}</label>
          <textarea style={S.textarea} rows={2} value={form.description_de || ""} onChange={(e) => set("description_de", e.target.value)} />
        </div>
        <div style={S.fieldFull}>
          <label style={S.fieldLabel}>{L.descEn}</label>
          <textarea style={S.textarea} rows={2} value={form.description_en || ""} onChange={(e) => set("description_en", e.target.value)} />
        </div>
        <div>
          <label style={S.fieldLabel}>{L.cat}</label>
          <select style={S.select} value={form.category} onChange={(e) => set("category", e.target.value)}>
            {Object.entries(CATEGORIES).filter(([k]) => k !== "all").map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v[lang]}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.fieldLabel}>{L.diff}</label>
          <select style={S.select} value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
            {Object.entries(DIFFICULTIES).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v[lang]}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.fieldLabel}>{L.time}</label>
          <input style={S.input} type="number" min={1} value={form.time_minutes} onChange={(e) => set("time_minutes", e.target.value)} />
        </div>
        <div>
          <label style={S.fieldLabel}>{L.portions}</label>
          <input style={S.input} type="number" min={1} value={form.base_servings} onChange={(e) => set("base_servings", e.target.value)} />
        </div>
      </div>

      <div style={S.formSection}>
        <h2 style={S.formSectionTitle}>📝 {L.ingTitle}</h2>
        {form.ingredients.map((ing, i) => (
          <div key={i} style={S.ingFormRow}>
            <input style={{ ...S.input, flex: 2, minWidth: 120 }} placeholder={L.nameDe} value={ing.name_de} onChange={(e) => setIng(i, "name_de", e.target.value)} />
            <input style={{ ...S.input, flex: 2, minWidth: 120 }} placeholder={L.nameEn} value={ing.name_en || ""} onChange={(e) => setIng(i, "name_en", e.target.value)} />
            <input style={{ ...S.input, flex: 1, minWidth: 70 }} placeholder={L.amount} type="number" value={ing.amount} onChange={(e) => setIng(i, "amount", parseFloat(e.target.value) || "")} />
            <input style={{ ...S.input, flex: 1, minWidth: 70 }} placeholder={L.unit} value={ing.unit || ""} onChange={(e) => setIng(i, "unit", e.target.value)} />
            <button style={S.removeRowBtn} onClick={() => removeIng(i)}>✕</button>
          </div>
        ))}
        <button style={S.addRowBtn} onClick={addIng}>{L.addIng}</button>
      </div>

      <div style={S.formSection}>
        <h2 style={S.formSectionTitle}>🇩🇪 {L.stepsDE}</h2>
        {form.steps_de.map((step, i) => (
          <div key={i} style={S.stepFormRow}>
            <span style={S.stepFormNum}>{i + 1}</span>
            <textarea style={{ ...S.textarea, flex: 1 }} rows={2} value={step} onChange={(e) => setStep("de", i, e.target.value)} />
            <button style={S.removeRowBtn} onClick={() => removeStep("de", i)}>✕</button>
          </div>
        ))}
        <button style={S.addRowBtn} onClick={() => addStep("de")}>{L.addStep}</button>
      </div>

      <div style={S.formSection}>
        <h2 style={S.formSectionTitle}>🇬🇧 {L.stepsEN}</h2>
        {form.steps_en.map((step, i) => (
          <div key={i} style={S.stepFormRow}>
            <span style={S.stepFormNum}>{i + 1}</span>
            <textarea style={{ ...S.textarea, flex: 1 }} rows={2} value={step} onChange={(e) => setStep("en", i, e.target.value)} />
            <button style={S.removeRowBtn} onClick={() => removeStep("en", i)}>✕</button>
          </div>
        ))}
        <button style={S.addRowBtn} onClick={() => addStep("en")}>{L.addStep}</button>
      </div>

      <div style={S.formSection}>
        <h2 style={S.formSectionTitle}>🏷️ {L.tags}</h2>
        <div style={S.tagInputRow}>
          <input
            style={{ ...S.input, flex: 1 }}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder={lang === "de" ? "Tag eingeben + Enter" : "Enter tag + Enter"}
          />
          <button style={{ ...S.addRowBtn, width: "auto", padding: "10px 20px" }} onClick={addTag}>+</button>
        </div>
        <div style={S.tagList}>
          {form.tags.map((t) => (
            <span key={t} style={S.tagBubble}>
              #{t} <button style={S.tagRemove} onClick={() => removeTag(t)}>✕</button>
            </span>
          ))}
        </div>
      </div>

      <div style={S.formActions}>
        <button style={S.cancelBtn} onClick={onCancel} disabled={saving}>{L.cancel}</button>
        <button style={{ ...S.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSubmit} disabled={saving || uploading}>
          {L.save}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════
//  STYLES
// ═════════════════════════════════════════════
const C = {
  warm: "#4A3228", cream: "#FDF6EC", parchment: "#F0E0C8",
  accent: "#B8532E", accentLight: "#D4835F", soft: "#8B7262",
  card: "#FFFBF5", border: "#DFC9AF", red: "#D32F2F",
};

const font = "'Playfair Display', 'Palatino', 'Georgia', serif";
const body = "'Crimson Text', 'Palatino', 'Georgia', serif";

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400&display=swap');
  @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes toastIn { from { opacity: 0; transform: translateY(-20px) translateX(-50%); } to { opacity: 1; transform: translateY(0) translateX(-50%); } }
  .recipe-card { animation: fadeSlideIn 0.4s ease both; transition: transform 0.22s ease, box-shadow 0.22s ease; }
  .recipe-card:hover { transform: translateY(-4px); box-shadow: 0 12px 36px ${C.warm}18; }
  .recipe-card:hover .fav-btn { transform: scale(1.15); }
  input:focus, textarea:focus, select:focus { outline: none; border-color: ${C.accent} !important; box-shadow: 0 0 0 3px ${C.accent}18 !important; }
  ::selection { background: ${C.accent}30; }
  * { box-sizing: border-box; }
  body { margin: 0; }
`;

const S = {
  app: { fontFamily: body, background: `linear-gradient(178deg, ${C.cream} 0%, ${C.parchment} 50%, ${C.cream} 100%)`, minHeight: "100vh", color: C.warm, maxWidth: 1040, margin: "0 auto", padding: "0 20px 48px", position: "relative" },

  loadingScreen: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, background: C.cream, fontFamily: body },
  loadingEmoji: { fontSize: 64, animation: "fadeSlideIn 0.6s ease" },
  loadingText: { fontSize: 18, color: C.soft, fontStyle: "italic" },

  errorScreen: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 12, padding: 20, textAlign: "center", background: C.cream, fontFamily: body },
  errorTitle: { fontFamily: font, fontSize: 26, color: C.warm, margin: 0 },
  errorText: { color: C.red, fontSize: 15, maxWidth: 500 },
  errorHint: { color: C.soft, fontSize: 14, fontStyle: "italic" },
  retryBtn: { marginTop: 16, background: C.accent, color: "#fff", border: "none", borderRadius: 12, padding: "12px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: body },

  toast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "12px 28px", borderRadius: 12, fontSize: 15, fontWeight: 600, zIndex: 999, animation: "toastIn 0.3s ease", boxShadow: `0 8px 24px ${C.warm}40` },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: C.card, borderRadius: 18, padding: 32, maxWidth: 360, width: "90%", boxShadow: `0 20px 60px ${C.warm}30` },
  modalText: { fontSize: 17, fontWeight: 600, textAlign: "center", margin: "0 0 24px" },
  modalBtns: { display: "flex", gap: 12, justifyContent: "center" },
  modalCancel: { padding: "10px 24px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 600, color: C.soft, fontFamily: body },
  modalDelete: { padding: "10px 24px", borderRadius: 10, border: "none", background: C.red, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: body },

  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "28px 0 16px", flexWrap: "wrap", gap: 12 },
  headerLeft: { display: "flex", alignItems: "center", gap: 14 },
  logo: { fontSize: 44 },
  title: { fontFamily: font, fontSize: 30, margin: 0, fontWeight: 800, letterSpacing: "-0.03em", color: C.warm },
  subtitle: { margin: "2px 0 0", fontSize: 14, color: C.soft, fontStyle: "italic", fontFamily: body },
  headerRight: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  addBtn: { background: C.accent, color: "#fff", border: "none", borderRadius: 12, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: body, transition: "all 0.2s" },
  langToggle: { background: `${C.accent}12`, border: `1.5px solid ${C.accent}35`, borderRadius: 12, padding: "8px 16px", cursor: "pointer", fontSize: 14, fontWeight: 600, color: C.accent, fontFamily: body, transition: "all 0.2s" },

  toolbar: { marginTop: 8 },
  searchWrap: { position: "relative", display: "flex", alignItems: "center", background: "#fff", borderRadius: 14, border: `1.5px solid ${C.border}`, padding: "0 16px", boxShadow: `0 2px 8px ${C.warm}06` },
  searchIcon: { fontSize: 18, marginRight: 10, opacity: 0.4 },
  searchInput: { flex: 1, border: "none", outline: "none", padding: "14px 0", fontSize: 15, background: "transparent", fontFamily: body, color: C.warm },
  clearBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.soft, padding: 4 },

  filterBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 10, flexWrap: "wrap" },
  catRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  catChip: { background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 20, padding: "7px 14px", fontSize: 13, cursor: "pointer", color: C.soft, fontWeight: 600, fontFamily: body, transition: "all 0.2s", whiteSpace: "nowrap" },
  catChipActive: { background: C.accent, color: "#fff", borderColor: C.accent },
  favToggle: { background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 20, padding: "7px 14px", fontSize: 13, cursor: "pointer", color: C.soft, fontWeight: 600, fontFamily: body, transition: "all 0.2s" },
  favToggleActive: { background: "#C0392B12", borderColor: "#C0392B55", color: "#C0392B" },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 22, marginTop: 24 },
  card: { background: C.card, borderRadius: 18, overflow: "hidden", cursor: "pointer", border: `1px solid ${C.border}50`, position: "relative" },
  cardImgWrap: { height: 160, position: "relative", overflow: "hidden", background: `linear-gradient(135deg, ${C.parchment}80, ${C.cream})`, display: "flex", alignItems: "center", justifyContent: "center" },
  cardImg: { width: "100%", height: "100%", objectFit: "cover" },
  cardEmoji: { fontSize: 64 },
  cardFav: { position: "absolute", top: 10, right: 10, background: "#ffffffcc", border: "none", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.15s", backdropFilter: "blur(4px)" },
  cardCatBadge: { position: "absolute", bottom: 10, left: 10, background: "#ffffffdd", borderRadius: 10, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: C.warm, backdropFilter: "blur(4px)" },
  cardBody: { padding: "14px 18px 18px" },
  cardTitle: { fontFamily: font, fontSize: 19, margin: "0 0 6px", fontWeight: 700, color: C.warm },
  cardDesc: { fontSize: 14, color: C.soft, margin: "0 0 12px", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  cardMeta: { display: "flex", gap: 8, flexWrap: "wrap" },
  cardMetaItem: { fontSize: 12, background: `${C.parchment}90`, padding: "4px 10px", borderRadius: 10, color: C.soft, fontWeight: 600 },

  emptyState: { textAlign: "center", padding: "64px 20px" },
  emptyText: { fontSize: 17, color: C.soft, margin: "12px 0 20px" },
  emptyBtn: { background: C.accent, color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: body },

  detailWrap: { paddingBottom: 40 },
  detailNav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0" },
  backBtn: { background: "none", border: `1.5px solid ${C.accent}40`, borderRadius: 12, padding: "9px 20px", cursor: "pointer", fontSize: 14, color: C.accent, fontWeight: 600, fontFamily: body },
  editBtn: { background: `${C.accent}10`, border: `1.5px solid ${C.accent}35`, borderRadius: 12, padding: "9px 16px", cursor: "pointer", fontSize: 13, color: C.accent, fontWeight: 600, fontFamily: body },
  deleteBtn: { background: `${C.red}08`, border: `1.5px solid ${C.red}30`, borderRadius: 12, padding: "9px 14px", cursor: "pointer", fontSize: 13, color: C.red, fontWeight: 600, fontFamily: body },
  detailHero: { display: "flex", gap: 28, alignItems: "flex-start", padding: "0 0 28px", borderBottom: `2px dashed ${C.border}60`, flexWrap: "wrap" },
  heroImgWrap: { width: 180, height: 180, borderRadius: 20, overflow: "hidden", background: `linear-gradient(135deg, ${C.parchment}, ${C.cream})`, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border}60`, flexShrink: 0 },
  heroImg: { width: "100%", height: "100%", objectFit: "cover" },
  heroEmoji: { fontSize: 80 },
  heroInfo: { flex: 1, minWidth: 240 },
  heroFav: { background: "none", border: "none", fontSize: 26, cursor: "pointer", transition: "transform 0.15s" },
  detailTitle: { fontFamily: font, fontSize: 32, margin: 0, fontWeight: 800, color: C.warm, lineHeight: 1.2 },
  detailDesc: { fontSize: 16, color: C.soft, margin: "10px 0 16px", lineHeight: 1.6, fontStyle: "italic" },
  detailChips: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: { fontSize: 13, background: "#fff", padding: "6px 14px", borderRadius: 14, color: C.soft, fontWeight: 600, border: `1px solid ${C.border}` },
  tagRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 },
  tag: { fontSize: 12, color: C.accent, fontWeight: 600, opacity: 0.7 },

  portionBar: { display: "flex", alignItems: "center", justifyContent: "center", gap: 24, margin: "28px 0", padding: 20, background: "#fff", borderRadius: 16, border: `1px solid ${C.border}80`, boxShadow: `0 2px 12px ${C.warm}06` },
  portionLabel: { fontFamily: font, fontSize: 20, fontWeight: 700, color: C.warm },
  portionControls: { display: "flex", alignItems: "center", gap: 16 },
  portionBtn: { width: 42, height: 42, borderRadius: "50%", border: `2.5px solid ${C.accent}`, background: "transparent", color: C.accent, fontSize: 22, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: body, transition: "all 0.15s" },
  portionNum: { fontSize: 30, fontWeight: 800, color: C.accent, minWidth: 36, textAlign: "center", fontFamily: font },

  detailColumns: { display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 28, marginTop: 28 },
  sectionHead: { fontFamily: font, fontSize: 22, marginBottom: 16, fontWeight: 700, color: C.warm },
  ingList: { background: "#fff", borderRadius: 16, padding: 18, border: `1px solid ${C.border}60` },
  ingRow: { display: "flex", justifyContent: "space-between", padding: "10px 4px", borderBottom: `1px dotted ${C.border}80`, fontSize: 15 },
  ingAmt: { fontWeight: 700, color: C.accent, minWidth: 90 },
  ingName: { color: C.warm, flex: 1, textAlign: "right" },
  stepsList: { display: "flex", flexDirection: "column", gap: 16 },
  stepRow: { display: "flex", gap: 16, alignItems: "flex-start", cursor: "pointer", transition: "opacity 0.2s" },
  stepNum: { width: 36, height: 36, borderRadius: "50%", background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0, fontFamily: font, transition: "background 0.2s" },
  stepText: { margin: 0, lineHeight: 1.7, fontSize: 15, color: C.warm, paddingTop: 6, transition: "all 0.2s" },

  formWrap: { paddingBottom: 40 },
  formNav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0" },
  formTitle: { fontFamily: font, fontSize: 30, fontWeight: 800, color: C.warm, margin: "0 0 24px" },

  imageUploadArea: { marginBottom: 28 },
  imagePreviewWrap: { position: "relative", width: "100%", maxWidth: 400, borderRadius: 16, overflow: "hidden" },
  imagePreview: { width: "100%", height: 220, objectFit: "cover", borderRadius: 16, border: `1px solid ${C.border}`, display: "block" },
  uploadOverlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600 },
  removeImgBtn: { position: "absolute", top: 10, right: 10, background: "#000000aa", color: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 16 },
  uploadPlaceholder: { width: "100%", maxWidth: 400, height: 160, borderRadius: 16, border: `2px dashed ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: `${C.parchment}40`, transition: "all 0.2s" },
  uploadText: { fontSize: 14, color: C.soft, marginTop: 8 },
  emojiPicker: { marginTop: 12 },
  emojiRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 },
  emojiBtn: { width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.border}`, background: "#fff", fontSize: 22, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center" },
  emojiBtnActive: { borderColor: C.accent, background: `${C.accent}12`, boxShadow: `0 0 0 2px ${C.accent}30` },

  fieldGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  fieldFull: { gridColumn: "1 / -1" },
  fieldLabel: { display: "block", fontSize: 13, fontWeight: 700, color: C.soft, marginBottom: 6, fontFamily: body },
  input: { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 15, fontFamily: body, color: C.warm, background: "#fff", transition: "all 0.2s" },
  textarea: { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 15, fontFamily: body, color: C.warm, background: "#fff", resize: "vertical", transition: "all 0.2s" },
  select: { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 15, fontFamily: body, color: C.warm, background: "#fff", cursor: "pointer" },

  formSection: { marginTop: 32 },
  formSectionTitle: { fontFamily: font, fontSize: 20, fontWeight: 700, color: C.warm, marginBottom: 14 },

  ingFormRow: { display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" },
  stepFormRow: { display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" },
  stepFormNum: { width: 32, height: 32, borderRadius: "50%", background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0, marginTop: 8, fontFamily: font },
  removeRowBtn: { background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 18, padding: "4px 8px", opacity: 0.6 },
  addRowBtn: { background: `${C.accent}10`, border: `1.5px dashed ${C.accent}40`, borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontSize: 14, color: C.accent, fontWeight: 600, fontFamily: body, marginTop: 8, width: "100%", transition: "all 0.2s" },

  tagInputRow: { display: "flex", gap: 8 },
  tagList: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
  tagBubble: { background: `${C.accent}12`, border: `1px solid ${C.accent}30`, borderRadius: 16, padding: "5px 12px", fontSize: 13, color: C.accent, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 },
  tagRemove: { background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 14, padding: 0 },

  formActions: { display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 36, paddingTop: 24, borderTop: `2px dashed ${C.border}60` },
  cancelBtn: { padding: "12px 28px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: "transparent", cursor: "pointer", fontSize: 15, fontWeight: 600, color: C.soft, fontFamily: body },
  saveBtn: { padding: "12px 32px", borderRadius: 12, border: "none", background: C.accent, color: "#fff", cursor: "pointer", fontSize: 15, fontWeight: 700, fontFamily: body, boxShadow: `0 4px 16px ${C.accent}40`, transition: "all 0.2s" },
};

