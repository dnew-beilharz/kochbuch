// src/App.jsx
// ═══════════════════════════════════════════════════════════════
//  🍳 MEIN KOCHBUCH — Full Featured
//  Features: CRUD, Auth, Realtime, Dark Mode, Public Share,
//  Duplicate, Print, Shopping List
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase, recipesAPI, favoritesAPI, storageAPI, authAPI, importAPI } from "./supabaseClient";
import AuthScreen from "./AuthScreen";

const CATEGORIES = {
  all:      { de: "Alle",           en: "All",            icon: "📚" },
  soups:    { de: "Suppen",         en: "Soups",          icon: "🍲" },
  mains:    { de: "Hauptgerichte",  en: "Main Courses",   icon: "🍽️" },
  desserts: { de: "Desserts",       en: "Desserts",       icon: "🍰" },
  salads:   { de: "Salate",         en: "Salads",         icon: "🥗" },
  bread:    { de: "Brot & Gebäck",  en: "Bread & Pastry", icon: "🍞" },
};

const DIFFICULTIES = {
  easy:   { de: "Einfach", en: "Easy",   icon: "🟢" },
  medium: { de: "Mittel",  en: "Medium", icon: "🟡" },
  hard:   { de: "Schwer",  en: "Hard",   icon: "🔴" },
};

// ═════════════════════════════════════════════
//  MAIN APP
// ═════════════════════════════════════════════
export default function CookbookApp() {
  const [lang, setLang] = useState("de");
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("cb_dark") === "1"; } catch { return false; }
  });
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [recipes, setRecipes] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("list"); // list | detail | form | edit | shopping | publicShare
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [servings, setServings] = useState(4);
  const [toast, setToast] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [shoppingSelection, setShoppingSelection] = useState([]);
  const [publicRecipe, setPublicRecipe] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedRecipe, setImportedRecipe] = useState(null);

  // Theme-Variablen
  const C = dark ? DARK : LIGHT;

  // Dark-Mode Persistenz
  useEffect(() => {
    try { localStorage.setItem("cb_dark", dark ? "1" : "0"); } catch {}
    document.body.style.background = C.bg1;
  }, [dark, C.bg1]);

  // ─── Public-Share Handling ───
  // URL-Format: #/share/RECIPE-ID → zeigt Rezept ohne Login
  useEffect(() => {
    const checkHash = async () => {
      const hash = window.location.hash;
      const match = hash.match(/^#\/share\/([a-f0-9-]+)/);
      if (match) {
        try {
          const r = await recipesAPI.getPublic(match[1]);
          setPublicRecipe(r);
          setView("publicShare");
          setAuthChecking(false);
        } catch (err) {
          setPublicRecipe("notfound");
          setView("publicShare");
          setAuthChecking(false);
        }
      }
    };
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, []);

  // ─── Auth + Daten laden ───
  useEffect(() => {
    if (window.location.hash.startsWith("#/share/")) return;

    authAPI.getUser().then((u) => {
      setUser(u);
      setAuthChecking(false);
      if (u) loadData();
    });

    const authSubscription = authAPI.onAuthChange((u) => {
      setUser(u);
      if (u) loadData();
      else { setRecipes([]); setFavorites([]); }
    });

    // Realtime
    const recipesChannel = supabase
      .channel("recipes-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "recipes" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setRecipes((prev) => prev.find((r) => r.id === payload.new.id) ? prev : [payload.new, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setRecipes((prev) => prev.map((r) => (r.id === payload.new.id ? payload.new : r)));
        } else if (payload.eventType === "DELETE") {
          setRecipes((prev) => prev.filter((r) => r.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      authSubscription?.unsubscribe();
      supabase.removeChannel(recipesChannel);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [recipesData, favsData] = await Promise.all([recipesAPI.list(), favoritesAPI.list()]);
      setRecipes(recipesData);
      setFavorites(favsData);
    } catch (err) {
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
        await recipesAPI.update(recipe.id, recipe);
        showToast(lang === "de" ? "Rezept aktualisiert ✓" : "Recipe updated ✓");
      } else {
        await recipesAPI.create(recipe);
        showToast(lang === "de" ? "Rezept gespeichert ✓" : "Recipe saved ✓");
      }
      setView("list");
    } catch (err) {
      showToast((lang === "de" ? "Fehler: " : "Error: ") + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteRecipe = async (id) => {
    try {
      const recipe = recipes.find((r) => r.id === id);
      await recipesAPI.delete(id);
      if (recipe?.image_url) await storageAPI.deleteImage(recipe.image_url);
      setDeleteConfirm(null);
      setView("list");
      showToast(lang === "de" ? "Rezept gelöscht" : "Recipe deleted");
    } catch (err) {
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
      showToast((lang === "de" ? "Fehler: " : "Error: ") + err.message, "error");
    }
  };

  // ─── Duplizieren ───
  const duplicateRecipe = async (recipe) => {
    try {
      const copy = { ...recipe };
      delete copy.id;
      delete copy.created_at;
      delete copy.updated_at;
      delete copy.user_id;
      copy.title_de = recipe.title_de + (lang === "de" ? " (Kopie)" : " (Copy)");
      if (recipe.title_en) copy.title_en = recipe.title_en + (lang === "de" ? " (Kopie)" : " (Copy)");
      copy.is_public = false; // Kopien sind standardmäßig privat
      await recipesAPI.create(copy);
      showToast(lang === "de" ? "Rezept dupliziert ✓" : "Recipe duplicated ✓");
      setView("list");
    } catch (err) {
      showToast((lang === "de" ? "Fehler: " : "Error: ") + err.message, "error");
    }
  };

  // ─── Public Toggle ───
  const togglePublic = async (recipe) => {
    try {
      const updated = await recipesAPI.setPublic(recipe.id, !recipe.is_public);
      setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      if (updated.is_public) {
        const url = `${window.location.origin}${window.location.pathname}#/share/${updated.id}`;
        try {
          await navigator.clipboard.writeText(url);
          showToast(lang === "de" ? "Link kopiert! 🔗" : "Link copied! 🔗");
        } catch {
          showToast(lang === "de" ? "Öffentlich gemacht ✓" : "Made public ✓");
        }
      } else {
        showToast(lang === "de" ? "Privat gemacht" : "Made private");
      }
    } catch (err) {
      showToast((lang === "de" ? "Fehler: " : "Error: ") + err.message, "error");
    }
  };

  const handleImport = async () => {
    if (!importUrl.trim() || !importUrl.startsWith("http")) {
      showToast(lang === "de" ? "Bitte gültige URL eingeben" : "Please enter a valid URL", "error");
      return;
    }
    setImporting(true);
    try {
      const recipe = await importAPI.fromUrl(importUrl.trim());
      setImportedRecipe(recipe);
      setImportOpen(false);
      setImportUrl("");
      setSelectedId(null);
      setView("form");
      showToast(lang === "de" ? "Rezept geladen ✓ Bitte prüfen & speichern" : "Recipe loaded ✓ Please review & save");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setImporting(false);
    }
  };
  const handleLogout = async () => {
    try {
      await authAPI.signOut();
      showToast(lang === "de" ? "Abgemeldet" : "Logged out");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // ─── Shopping List ───
  const toggleShoppingItem = (id) => {
    setShoppingSelection((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  // ─── Filtering ───
  const filtered = useMemo(() => {
    return recipes.filter((r) => {
      const s = search.toLowerCase();
      const matchSearch = !s
        || (r.title_de || "").toLowerCase().includes(s)
        || (r.title_en || "").toLowerCase().includes(s)
        || (r.tags || []).some((t) => t.toLowerCase().includes(s))
        || (r.ingredients || []).some((i) =>
            (i.name_de || "").toLowerCase().includes(s) ||
            (i.name_en || "").toLowerCase().includes(s));
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

  // ─── Styles für Theme ───
  const S = makeStyles(C);

  // ─── Public Share View (ohne Auth) ───
  if (view === "publicShare") {
    return (
      <div style={S.app}>
        <style>{globalCSS(C)}</style>
        {publicRecipe === "notfound" ? (
          <div style={S.errorScreen}>
            <div style={{ fontSize: 64 }}>🔒</div>
            <h2 style={S.errorTitle}>
              {lang === "de" ? "Rezept nicht verfügbar" : "Recipe not available"}
            </h2>
            <p style={S.errorText}>
              {lang === "de"
                ? "Dieses Rezept ist privat oder existiert nicht."
                : "This recipe is private or doesn't exist."}
            </p>
            <a href={window.location.pathname} style={S.retryBtn}>
              {lang === "de" ? "Zum Kochbuch" : "Go to cookbook"}
            </a>
          </div>
        ) : publicRecipe ? (
          <PublicRecipeView recipe={publicRecipe} lang={lang} setLang={setLang} C={C} S={S} dark={dark} setDark={setDark} />
        ) : (
          <div style={S.loadingScreen}>
            <div style={S.loadingEmoji}>📖</div>
          </div>
        )}
      </div>
    );
  }

  if (authChecking) {
    return (
      <div style={S.loadingScreen}>
        <style>{globalCSS(C)}</style>
        <div style={S.loadingEmoji}>📖</div>
        <p style={S.loadingText}>{lang === "de" ? "Wird geladen…" : "Loading…"}</p>
      </div>
    );
  }

  if (!user) return <AuthScreen onAuth={(u) => setUser(u)} />;

  if (loading) {
    return (
      <div style={S.loadingScreen}>
        <style>{globalCSS(C)}</style>
        <div style={S.loadingEmoji}>📖</div>
        <p style={S.loadingText}>{lang === "de" ? "Kochbuch wird geladen…" : "Loading cookbook…"}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={S.errorScreen}>
        <style>{globalCSS(C)}</style>
        <div style={{ fontSize: 64 }}>⚠️</div>
        <h2 style={S.errorTitle}>{lang === "de" ? "Verbindungsfehler" : "Connection Error"}</h2>
        <p style={S.errorText}>{error}</p>
        <button style={S.retryBtn} onClick={loadData}>
          {lang === "de" ? "Erneut versuchen" : "Retry"}
        </button>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <style>{globalCSS(C)}</style>

      {toast && (
        <div style={{ ...S.toast, background: toast.type === "error" ? "#C0392B" : C.warm }}>
          {toast.msg}
        </div>
      )}

      {importOpen && (
        <div style={S.overlay} onClick={() => !importing && setImportOpen(false)}>
          <div style={{ ...S.modal, maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontFamily: font, margin: "0 0 8px", color: C.warm, fontSize: 22 }}>
              🔗 {lang === "de" ? "Rezept importieren" : "Import Recipe"}
            </h2>
            <p style={{ color: C.soft, fontSize: 14, marginTop: 0, marginBottom: 16, fontStyle: "italic" }}>
              {lang === "de"
                ? "URL einer Rezeptseite einfügen (z.B. Chefkoch, BBC Good Food). Funktioniert mit den meisten großen Rezeptseiten."
                : "Paste a recipe URL (e.g. Chefkoch, BBC Good Food). Works with most popular recipe sites."}
            </p>
            <input
              style={S.input}
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://www.chefkoch.de/rezepte/..."
              disabled={importing}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && !importing && handleImport()}
            />
            <div style={{ ...S.modalBtns, marginTop: 20 }}>
              <button style={S.modalCancel} onClick={() => setImportOpen(false)} disabled={importing}>
                {lang === "de" ? "Abbrechen" : "Cancel"}
              </button>
              <button
                style={{ ...S.saveBtn, padding: "10px 24px", opacity: importing ? 0.6 : 1 }}
                onClick={handleImport}
                disabled={importing}
              >
                {importing
                  ? (lang === "de" ? "Lädt…" : "Loading…")
                  : (lang === "de" ? "Importieren" : "Import")}
              </button>
            </div>
          </div>
        </div>
      )}{deleteConfirm && (
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

      {/* ─── LIST ─── */}
      {view === "list" && (
        <>
          <header style={S.header}>
            <div style={S.headerLeft}>
              <span style={S.logo}>📖</span>
              <div>
                <h1 style={S.title}>{lang === "de" ? "Mein Kochbuch" : "My Cookbook"}</h1>
                <p style={S.subtitle}>
                  {lang === "de" ? `${recipes.length} Rezepte in deiner Sammlung` : `${recipes.length} recipes in your collection`}
                </p>
              </div>
            </div>
            <div style={S.headerRight}>
              <button style={S.addBtn} onClick={openNew}>+ {lang === "de" ? "Neues Rezept" : "New"}</button>
              <button style={S.iconBtn} onClick={() => setImportOpen(true)} title={lang === "de" ? "Von URL importieren" : "Import from URL"}>
                🔗 {lang === "de" ? "Importieren" : "Import"}
              </button>
              <button style={S.iconBtn} onClick={() => setView("shopping")} title={lang === "de" ? "Einkaufsliste" : "Shopping"}>
                🛒 {shoppingSelection.length > 0 && <span style={S.badge}>{shoppingSelection.length}</span>}
              </button>
              <button style={S.iconBtn} onClick={() => setDark(!dark)} title={dark ? "Light" : "Dark"}>
                {dark ? "☀️" : "🌙"}
              </button>
              <button style={S.langToggle} onClick={() => setLang(lang === "de" ? "en" : "de")}>
                {lang === "de" ? "🇬🇧 EN" : "🇩🇪 DE"}
              </button>
              <button style={{ ...S.iconBtn, color: "#D32323", borderColor: "#D3232340" }} onClick={handleLogout} title={user?.email}>
                ⏻
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
                  <button key={key} style={{ ...S.catChip, ...(catFilter === key ? S.catChipActive : {}) }} onClick={() => setCatFilter(key)}>
                    {val.icon} {val[lang]}
                  </button>
                ))}
              </div>
              <button style={{ ...S.favToggle, ...(showFavsOnly ? S.favToggleActive : {}) }} onClick={() => setShowFavsOnly(!showFavsOnly)}>
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
              <button style={S.emptyBtn} onClick={openNew}>+ {lang === "de" ? "Rezept hinzufügen" : "Add recipe"}</button>
            </div>
          ) : (
            <div style={S.grid}>
              {filtered.map((r, idx) => (
                <div key={r.id} className="recipe-card" style={{ ...S.card, animationDelay: `${idx * 60}ms` }}>
                  <div style={S.cardImgWrap} onClick={() => openDetail(r.id)}>
                    {r.image_url ? <img src={r.image_url} alt="" style={S.cardImg} /> : <span style={S.cardEmoji}>{r.emoji || "🍳"}</span>}
                    <button className="fav-btn" style={S.cardFav} onClick={(e) => { e.stopPropagation(); toggleFavorite(r.id); }}>
                      {favorites.includes(r.id) ? "❤️" : "🤍"}
                    </button>
                    <span style={S.cardCatBadge}>
                      {CATEGORIES[r.category]?.icon} {CATEGORIES[r.category]?.[lang]}
                    </span>
                    {r.is_public && <span style={S.publicBadge}>🔗</span>}
                  </div>
                  <div style={S.cardBody} onClick={() => openDetail(r.id)}>
                    <h3 style={S.cardTitle}>{lang === "de" ? r.title_de : (r.title_en || r.title_de)}</h3>
                    <p style={S.cardDesc}>{lang === "de" ? r.description_de : (r.description_en || r.description_de)}</p>
                    <div style={S.cardMeta}>
                      <span style={S.cardMetaItem}>⏱ {r.time_minutes} min</span>
                      <span style={S.cardMetaItem}>{DIFFICULTIES[r.difficulty]?.icon} {DIFFICULTIES[r.difficulty]?.[lang]}</span>
                      <span style={S.cardMetaItem}>🍽 {r.base_servings}</span>
                    </div>
                  </div>
                  <div style={S.cardFooter}>
                    <label style={S.shoppingCheckLabel} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={shoppingSelection.includes(r.id)}
                        onChange={() => toggleShoppingItem(r.id)}
                        style={S.shoppingCheck}
                      />
                      <span>{lang === "de" ? "🛒 Liste" : "🛒 List"}</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === "detail" && selectedRecipe && (
        <DetailView
          recipe={selectedRecipe} lang={lang} setLang={setLang}
          servings={servings} setServings={setServings}
          isFav={favorites.includes(selectedRecipe.id)}
          onToggleFav={() => toggleFavorite(selectedRecipe.id)}
          onBack={() => setView("list")}
          onEdit={() => openEdit(selectedRecipe.id)}
          onDelete={() => setDeleteConfirm(selectedRecipe.id)}
          onDuplicate={() => duplicateRecipe(selectedRecipe)}
          onTogglePublic={() => togglePublic(selectedRecipe)}
          dark={dark} setDark={setDark}
          C={C} S={S}
        />
      )}

      {(view === "form" || view === "edit") && (
        <RecipeForm
          lang={lang} setLang={setLang}
          recipe={view === "edit" ? selectedRecipe : importedRecipe}
          onSave={(r) => { saveRecipe(r); setImportedRecipe(null); }}
          onCancel={() => { setView("list"); setImportedRecipe(null); }}
          saving={saving} showToast={showToast} C={C} S={S}
        />
      )}

      {view === "shopping" && (
        <ShoppingListView
          recipes={recipes.filter((r) => shoppingSelection.includes(r.id))}
          lang={lang}
          onBack={() => setView("list")}
          onClear={() => { setShoppingSelection([]); setView("list"); }}
          C={C} S={S}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════
//  DETAIL VIEW
// ═════════════════════════════════════════════
function DetailView({ recipe: r, lang, setLang, servings, setServings, isFav, onToggleFav, onBack, onEdit, onDelete, onDuplicate, onTogglePublic, dark, setDark, C, S }) {
  const ratio = servings / (r.base_servings || 4);
  const steps = lang === "de" ? r.steps_de : (r.steps_en || r.steps_de);
  const [checkedSteps, setCheckedSteps] = useState([]);

  const toggleStep = (i) =>
    setCheckedSteps((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);

  const handlePrint = () => window.print();

  return (
    <div style={S.detailWrap} className="printable">
      <div style={S.detailNav} className="no-print">
        <button style={S.backBtn} onClick={onBack}>← {lang === "de" ? "Zurück" : "Back"}</button>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={S.editBtn} onClick={onTogglePublic} title={r.is_public ? (lang === "de" ? "Privat machen" : "Make private") : (lang === "de" ? "Teilen" : "Share")}>
            {r.is_public ? "🔗 " + (lang === "de" ? "Öffentlich" : "Public") : "🔒 " + (lang === "de" ? "Teilen" : "Share")}
          </button>
          <button style={S.editBtn} onClick={onDuplicate}>📋 {lang === "de" ? "Kopieren" : "Copy"}</button>
          <button style={S.editBtn} onClick={handlePrint}>🖨️</button>
          <button style={S.editBtn} onClick={onEdit}>✏️</button>
          <button style={S.deleteBtn} onClick={onDelete}>🗑️</button>
          <button style={S.iconBtn} onClick={() => setDark(!dark)}>{dark ? "☀️" : "🌙"}</button>
          <button style={S.langToggle} onClick={() => setLang(lang === "de" ? "en" : "de")}>
            {lang === "de" ? "🇬🇧" : "🇩🇪"}
          </button>
        </div>
      </div>

      <div style={S.detailHero}>
        <div style={S.heroImgWrap}>
          {r.image_url ? <img src={r.image_url} alt="" style={S.heroImg} /> : <span style={S.heroEmoji}>{r.emoji || "🍳"}</span>}
        </div>
        <div style={S.heroInfo}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 style={S.detailTitle}>{lang === "de" ? r.title_de : (r.title_en || r.title_de)}</h1>
            <button onClick={onToggleFav} style={S.heroFav} className="no-print">{isFav ? "❤️" : "🤍"}</button>
          </div>
          <p style={S.detailDesc}>{lang === "de" ? r.description_de : (r.description_en || r.description_de)}</p>
          <div style={S.detailChips}>
            <span style={S.chip}>{CATEGORIES[r.category]?.icon} {CATEGORIES[r.category]?.[lang]}</span>
            <span style={S.chip}>⏱ {r.time_minutes} min</span>
            <span style={S.chip}>{DIFFICULTIES[r.difficulty]?.icon} {DIFFICULTIES[r.difficulty]?.[lang]}</span>
          </div>
          {r.tags?.length > 0 && (
            <div style={S.tagRow}>{r.tags.map((t, i) => <span key={i} style={S.tag}>#{t}</span>)}</div>
          )}
        </div>
      </div>

      <div style={S.portionBar}>
        <span style={S.portionLabel}>{lang === "de" ? "🍽 Portionen" : "🍽 Servings"}</span>
        <div style={S.portionControls}>
          <button style={S.portionBtn} onClick={() => setServings(Math.max(1, servings - 1))} className="no-print">−</button>
          <span style={S.portionNum}>{servings}</span>
          <button style={S.portionBtn} onClick={() => setServings(servings + 1)} className="no-print">+</button>
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
              <div key={i} style={{ ...S.stepRow, opacity: checkedSteps.includes(i) ? 0.45 : 1 }} onClick={() => toggleStep(i)}>
                <div style={{ ...S.stepNum, background: checkedSteps.includes(i) ? "#aaa" : C.accent }}>
                  {checkedSteps.includes(i) ? "✓" : i + 1}
                </div>
                <p style={{ ...S.stepText, textDecoration: checkedSteps.includes(i) ? "line-through" : "none" }}>{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════
//  PUBLIC RECIPE VIEW (ohne Auth)
// ═════════════════════════════════════════════
function PublicRecipeView({ recipe: r, lang, setLang, C, S, dark, setDark }) {
  const [servings, setServings] = useState(r.base_servings || 4);
  const ratio = servings / (r.base_servings || 4);
  const steps = lang === "de" ? r.steps_de : (r.steps_en || r.steps_de);
  const handlePrint = () => window.print();

  return (
    <div style={S.detailWrap} className="printable">
      <div style={S.detailNav} className="no-print">
        <a href={window.location.pathname} style={S.backBtn}>📖 {lang === "de" ? "Zum Kochbuch" : "To cookbook"}</a>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.editBtn} onClick={handlePrint}>🖨️</button>
          <button style={S.iconBtn} onClick={() => setDark(!dark)}>{dark ? "☀️" : "🌙"}</button>
          <button style={S.langToggle} onClick={() => setLang(lang === "de" ? "en" : "de")}>
            {lang === "de" ? "🇬🇧" : "🇩🇪"}
          </button>
        </div>
      </div>

      <div style={{ ...S.chip, display: "inline-block", marginBottom: 16, background: C.accent + "15", color: C.accent, borderColor: C.accent + "40" }} className="no-print">
        🔗 {lang === "de" ? "Geteiltes Rezept" : "Shared recipe"}
      </div>

      <div style={S.detailHero}>
        <div style={S.heroImgWrap}>
          {r.image_url ? <img src={r.image_url} alt="" style={S.heroImg} /> : <span style={S.heroEmoji}>{r.emoji || "🍳"}</span>}
        </div>
        <div style={S.heroInfo}>
          <h1 style={S.detailTitle}>{lang === "de" ? r.title_de : (r.title_en || r.title_de)}</h1>
          <p style={S.detailDesc}>{lang === "de" ? r.description_de : (r.description_en || r.description_de)}</p>
          <div style={S.detailChips}>
            <span style={S.chip}>{CATEGORIES[r.category]?.icon} {CATEGORIES[r.category]?.[lang]}</span>
            <span style={S.chip}>⏱ {r.time_minutes} min</span>
            <span style={S.chip}>{DIFFICULTIES[r.difficulty]?.icon} {DIFFICULTIES[r.difficulty]?.[lang]}</span>
          </div>
        </div>
      </div>

      <div style={S.portionBar}>
        <span style={S.portionLabel}>{lang === "de" ? "🍽 Portionen" : "🍽 Servings"}</span>
        <div style={S.portionControls}>
          <button style={S.portionBtn} onClick={() => setServings(Math.max(1, servings - 1))} className="no-print">−</button>
          <span style={S.portionNum}>{servings}</span>
          <button style={S.portionBtn} onClick={() => setServings(servings + 1)} className="no-print">+</button>
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
              <div key={i} style={S.stepRow}>
                <div style={S.stepNum}>{i + 1}</div>
                <p style={S.stepText}>{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 40, paddingTop: 24, borderTop: `1px dashed ${C.border}`, fontSize: 14, color: C.soft }} className="no-print">
        {lang === "de" ? "📖 Erstellt mit Mein Kochbuch" : "📖 Created with My Cookbook"}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════
//  SHOPPING LIST VIEW
// ═════════════════════════════════════════════
function ShoppingListView({ recipes, lang, onBack, onClear, C, S }) {
  // Zutaten zusammenfassen
  const aggregated = useMemo(() => {
    const map = {};
    recipes.forEach((r) => {
      (r.ingredients || []).forEach((ing) => {
        const name = lang === "de" ? ing.name_de : (ing.name_en || ing.name_de);
        if (!name) return;
        const unit = lang === "de" ? (ing.unit_de || ing.unit || "") : (ing.unit_en || ing.unit || "");
        const key = `${name.toLowerCase()}|${unit}`;
        if (!map[key]) {
          map[key] = { name, unit, amount: 0, recipes: [] };
        }
        map[key].amount += (parseFloat(ing.amount) || 0);
        const recipeTitle = lang === "de" ? r.title_de : (r.title_en || r.title_de);
        if (!map[key].recipes.includes(recipeTitle)) {
          map[key].recipes.push(recipeTitle);
        }
      });
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, lang]);

  const [checked, setChecked] = useState([]);
  const handlePrint = () => window.print();

  if (recipes.length === 0) {
    return (
      <div style={S.formWrap}>
        <div style={S.formNav}>
          <button style={S.backBtn} onClick={onBack}>← {lang === "de" ? "Zurück" : "Back"}</button>
        </div>
        <div style={S.emptyState}>
          <span style={{ fontSize: 56 }}>🛒</span>
          <p style={S.emptyText}>
            {lang === "de" ? "Keine Rezepte ausgewählt. Wähle Rezepte für deine Einkaufsliste aus." : "No recipes selected. Pick recipes for your shopping list."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={S.formWrap} className="printable">
      <div style={S.formNav} className="no-print">
        <button style={S.backBtn} onClick={onBack}>← {lang === "de" ? "Zurück" : "Back"}</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.editBtn} onClick={handlePrint}>🖨️ {lang === "de" ? "Drucken" : "Print"}</button>
          <button style={S.deleteBtn} onClick={onClear}>🗑️ {lang === "de" ? "Leeren" : "Clear"}</button>
        </div>
      </div>

      <h1 style={S.formTitle}>🛒 {lang === "de" ? "Einkaufsliste" : "Shopping List"}</h1>
      <p style={{ color: C.soft, marginBottom: 24, fontStyle: "italic" }}>
        {lang === "de" ? `Aus ${recipes.length} Rezept${recipes.length === 1 ? "" : "en"}:` : `From ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}:`}{" "}
        {recipes.map((r) => lang === "de" ? r.title_de : (r.title_en || r.title_de)).join(", ")}
      </p>

      <div style={S.ingList}>
        {aggregated.map((item, i) => {
          const isChecked = checked.includes(i);
          const display = item.amount % 1 === 0 ? item.amount : item.amount.toFixed(1);
          return (
            <div
              key={i}
              style={{ ...S.ingRow, cursor: "pointer", opacity: isChecked ? 0.4 : 1, textDecoration: isChecked ? "line-through" : "none" }}
              onClick={() => setChecked((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i])}
            >
              <span style={{ ...S.ingAmt, minWidth: 100 }}>
                {isChecked ? "☑" : "☐"} {item.amount > 0 ? `${display} ${item.unit}` : ""}
              </span>
              <span style={S.ingName}>{item.name}</span>
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 24, fontSize: 13, color: C.soft, textAlign: "center" }} className="no-print">
        {lang === "de" ? "Tipp: Tippe eine Zeile an, um sie abzuhaken." : "Tip: Tap a row to check it off."}
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════
//  RECIPE FORM
// ═════════════════════════════════════════════
function RecipeForm({ lang, setLang, recipe, onSave, onCancel, saving, showToast, C, S }) {
  const isEdit = !!recipe;
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const empty = {
    title_de: "", title_en: "", description_de: "", description_en: "",
    category: "mains", difficulty: "easy", time_minutes: 30, base_servings: 4,
    image_url: null, emoji: "🍳",
    ingredients: [{ name_de: "", name_en: "", amount: "", unit: "g" }],
    steps_de: [""], steps_en: [""], tags: [], is_public: false,
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
  const addIng = () => setForm((f) => ({ ...f, ingredients: [...f.ingredients, { name_de: "", name_en: "", amount: "", unit: "g" }] }));
  const removeIng = (idx) => setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));

  const setStep = (lang2, idx, val) => {
    const key = `steps_${lang2}`;
    const updated = [...form[key]];
    updated[idx] = val;
    setForm((f) => ({ ...f, [key]: updated }));
  };
  const addStep = (lang2) => setForm((f) => ({ ...f, [`steps_${lang2}`]: [...f[`steps_${lang2}`], ""] }));
  const removeStep = (lang2, idx) => setForm((f) => ({ ...f, [`steps_${lang2}`]: f[`steps_${lang2}`].filter((_, i) => i !== idx) }));

  const addTag = () => {
    if (tagInput.trim() && !form.tags.includes(tagInput.trim().toLowerCase())) {
      set("tags", [...form.tags, tagInput.trim().toLowerCase()]);
      setTagInput("");
    }
  };
  const removeTag = (t) => set("tags", form.tags.filter((x) => x !== t));

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast(lang === "de" ? "Bild zu groß (max 5MB)" : "Image too large (max 5MB)", "error");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
    try {
      const publicUrl = await storageAPI.uploadImage(file);
      set("image_url", publicUrl);
      showToast(lang === "de" ? "Bild hochgeladen ✓" : "Image uploaded ✓");
    } catch (err) {
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
    photo: lang === "de" ? "📷 Foto hochladen (JPG/PNG)" : "📷 Upload Photo (JPG/PNG)",
    emoji: "Emoji",
    ingTitle: lang === "de" ? "Zutaten" : "Ingredients",
    stepsDE: lang === "de" ? "Zubereitung (DE)" : "Steps (DE)",
    stepsEN: lang === "de" ? "Zubereitung (EN)" : "Steps (EN)",
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
        <button style={S.langToggle} onClick={() => setLang(lang === "de" ? "en" : "de")}>{lang === "de" ? "🇬🇧" : "🇩🇪"}</button>
      </div>

      <h1 style={S.formTitle}>{L.title}</h1>

      <div style={S.imageUploadArea}>
        {imagePreview ? (
          <div style={S.imagePreviewWrap}>
            <img src={imagePreview} alt="" style={S.imagePreview} />
            {uploading && <div style={S.uploadOverlay}><span>{lang === "de" ? "Wird hochgeladen…" : "Uploading…"}</span></div>}
            <button style={S.removeImgBtn} onClick={() => { setImagePreview(null); set("image_url", null); }}>✕</button>
          </div>
        ) : (
          <div style={S.uploadPlaceholder} onClick={() => fileRef.current?.click()}>
            <span style={{ fontSize: 40 }}>{form.emoji || "📷"}</span>
            <p style={S.uploadText}>{L.photo}</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={handleImage} />
        {!imagePreview && (
          <div style={S.emojiPicker}>
            <label style={S.fieldLabel}>{L.emoji}</label>
            <div style={S.emojiRow}>
              {["🍳","🥘","🍲","🥗","🍰","🍞","🥩","🍜","🍕","🥔","🐟","🥧"].map((e) => (
                <button key={e} style={{ ...S.emojiBtn, ...(form.emoji === e ? S.emojiBtnActive : {}) }} onClick={() => set("emoji", e)}>{e}</button>
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
            {Object.entries(DIFFICULTIES).map(([k, v]) => (<option key={k} value={k}>{v.icon} {v[lang]}</option>))}
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
          <input style={{ ...S.input, flex: 1 }} value={tagInput} onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder={lang === "de" ? "Tag eingeben + Enter" : "Enter tag + Enter"} />
          <button style={{ ...S.addRowBtn, width: "auto", padding: "10px 20px" }} onClick={addTag}>+</button>
        </div>
        <div style={S.tagList}>
          {form.tags.map((t) => (
            <span key={t} style={S.tagBubble}>#{t} <button style={S.tagRemove} onClick={() => removeTag(t)}>✕</button></span>
          ))}
        </div>
      </div>

      <div style={S.formActions}>
        <button style={S.cancelBtn} onClick={onCancel} disabled={saving}>{L.cancel}</button>
        <button style={{ ...S.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSubmit} disabled={saving || uploading}>{L.save}</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════
//  THEMES
// ═════════════════════════════════════════════
const LIGHT = {
  warm: "#4A3228", cream: "#FDF6EC", parchment: "#F0E0C8",
  accent: "#B8532E", accentLight: "#D4835F", soft: "#8B7262",
  card: "#FFFBF5", border: "#DFC9AF", red: "#D32F2F",
  bg1: "#FDF6EC", bg2: "#F0E0C8", fieldBg: "#fff",
  text: "#4A3228",
};
const DARK = {
  warm: "#E8D5C0", cream: "#1F1814", parchment: "#2A2019",
  accent: "#E88B6B", accentLight: "#F0A88D", soft: "#9B8676",
  card: "#2D231C", border: "#4A3A2C", red: "#FF6B6B",
  bg1: "#1A140F", bg2: "#2A2019", fieldBg: "#2D231C",
  text: "#E8D5C0",
};

const font = "'Playfair Display', 'Palatino', 'Georgia', serif";
const body = "'Crimson Text', 'Palatino', 'Georgia', serif";

const globalCSS = (C) => `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400&display=swap');
  @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes toastIn { from { opacity: 0; transform: translateY(-20px) translateX(-50%); } to { opacity: 1; transform: translateY(0) translateX(-50%); } }
  .recipe-card { animation: fadeSlideIn 0.4s ease both; transition: transform 0.22s ease, box-shadow 0.22s ease; }
  .recipe-card:hover { transform: translateY(-4px); box-shadow: 0 12px 36px ${C.warm}22; }
  .recipe-card:hover .fav-btn { transform: scale(1.15); }
  input:focus, textarea:focus, select:focus { outline: none; border-color: ${C.accent} !important; box-shadow: 0 0 0 3px ${C.accent}28 !important; }
  ::selection { background: ${C.accent}40; }
  * { box-sizing: border-box; }
  body { margin: 0; background: ${C.bg1}; color: ${C.text}; }

  @media print {
    body, .printable, .printable * { background: white !important; color: black !important; }
    .no-print { display: none !important; }
    .printable { max-width: 100% !important; padding: 0 !important; font-size: 12pt; }
    h1 { font-size: 22pt !important; margin-bottom: 8pt !important; }
    h2 { font-size: 14pt !important; }
    img { max-width: 200px !important; max-height: 200px !important; }
    @page { margin: 1.5cm; }
  }
`;

// ═════════════════════════════════════════════
//  STYLES (Theme-abhängig)
// ═════════════════════════════════════════════
function makeStyles(C) {
  return {
    app: {
      fontFamily: body,
      background: `linear-gradient(178deg, ${C.bg1} 0%, ${C.bg2} 50%, ${C.bg1} 100%)`,
      minHeight: "100vh", color: C.text, maxWidth: 1040, margin: "0 auto",
      padding: "0 20px 48px", position: "relative",
    },
    loadingScreen: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, background: C.bg1, fontFamily: body },
    loadingEmoji: { fontSize: 64, animation: "fadeSlideIn 0.6s ease" },
    loadingText: { fontSize: 18, color: C.soft, fontStyle: "italic" },
    errorScreen: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 12, padding: 20, textAlign: "center", background: C.bg1, fontFamily: body },
    errorTitle: { fontFamily: font, fontSize: 26, color: C.warm, margin: 0 },
    errorText: { color: C.red, fontSize: 15, maxWidth: 500 },
    errorHint: { color: C.soft, fontSize: 14, fontStyle: "italic" },
    retryBtn: { marginTop: 16, background: C.accent, color: "#fff", border: "none", borderRadius: 12, padding: "12px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: body, textDecoration: "none", display: "inline-block" },
    toast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "12px 28px", borderRadius: 12, fontSize: 15, fontWeight: 600, zIndex: 999, animation: "toastIn 0.3s ease", boxShadow: `0 8px 24px ${C.warm}40` },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center" },
    modal: { background: C.card, borderRadius: 18, padding: 32, maxWidth: 360, width: "90%", boxShadow: `0 20px 60px rgba(0,0,0,0.4)` },
    modalText: { fontSize: 17, fontWeight: 600, textAlign: "center", margin: "0 0 24px", color: C.text },
    modalBtns: { display: "flex", gap: 12, justifyContent: "center" },
    modalCancel: { padding: "10px 24px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 600, color: C.soft, fontFamily: body },
    modalDelete: { padding: "10px 24px", borderRadius: 10, border: "none", background: C.red, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: body },

    header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "28px 0 16px", flexWrap: "wrap", gap: 12 },
    headerLeft: { display: "flex", alignItems: "center", gap: 14 },
    logo: { fontSize: 44 },
    title: { fontFamily: font, fontSize: 30, margin: 0, fontWeight: 800, letterSpacing: "-0.03em", color: C.warm },
    subtitle: { margin: "2px 0 0", fontSize: 14, color: C.soft, fontStyle: "italic", fontFamily: body },
    headerRight: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
    addBtn: { background: C.accent, color: "#fff", border: "none", borderRadius: 12, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: body, transition: "all 0.2s" },
    iconBtn: { background: `${C.accent}12`, border: `1.5px solid ${C.accent}35`, borderRadius: 12, padding: "8px 12px", cursor: "pointer", fontSize: 15, color: C.accent, fontFamily: body, position: "relative" },
    badge: { position: "absolute", top: -5, right: -5, background: C.red, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 11, fontWeight: 700, minWidth: 18 },
    langToggle: { background: `${C.accent}12`, border: `1.5px solid ${C.accent}35`, borderRadius: 12, padding: "8px 14px", cursor: "pointer", fontSize: 14, fontWeight: 600, color: C.accent, fontFamily: body, transition: "all 0.2s" },

    toolbar: { marginTop: 8 },
    searchWrap: { position: "relative", display: "flex", alignItems: "center", background: C.fieldBg, borderRadius: 14, border: `1.5px solid ${C.border}`, padding: "0 16px", boxShadow: `0 2px 8px rgba(0,0,0,0.06)` },
    searchIcon: { fontSize: 18, marginRight: 10, opacity: 0.4 },
    searchInput: { flex: 1, border: "none", outline: "none", padding: "14px 0", fontSize: 15, background: "transparent", fontFamily: body, color: C.text },
    clearBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.soft, padding: 4 },
    filterBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 10, flexWrap: "wrap" },
    catRow: { display: "flex", gap: 6, flexWrap: "wrap" },
    catChip: { background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 20, padding: "7px 14px", fontSize: 13, cursor: "pointer", color: C.soft, fontWeight: 600, fontFamily: body, transition: "all 0.2s", whiteSpace: "nowrap" },
    catChipActive: { background: C.accent, color: "#fff", borderColor: C.accent },
    favToggle: { background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 20, padding: "7px 14px", fontSize: 13, cursor: "pointer", color: C.soft, fontWeight: 600, fontFamily: body, transition: "all 0.2s" },
    favToggleActive: { background: "#C0392B20", borderColor: "#C0392B55", color: "#C0392B" },

    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 22, marginTop: 24 },
    card: { background: C.card, borderRadius: 18, overflow: "hidden", border: `1px solid ${C.border}`, position: "relative", display: "flex", flexDirection: "column" },
    cardImgWrap: { height: 160, position: "relative", overflow: "hidden", background: `linear-gradient(135deg, ${C.parchment}, ${C.bg1})`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
    cardImg: { width: "100%", height: "100%", objectFit: "cover" },
    cardEmoji: { fontSize: 64 },
    cardFav: { position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.85)", border: "none", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.15s", backdropFilter: "blur(4px)" },
    cardCatBadge: { position: "absolute", bottom: 10, left: 10, background: "rgba(255,255,255,0.88)", borderRadius: 10, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#4A3228", backdropFilter: "blur(4px)" },
    publicBadge: { position: "absolute", bottom: 10, right: 10, background: C.accent, color: "#fff", borderRadius: 10, padding: "4px 10px", fontSize: 11, fontWeight: 700 },
    cardBody: { padding: "14px 18px 10px", cursor: "pointer", flex: 1 },
    cardTitle: { fontFamily: font, fontSize: 19, margin: "0 0 6px", fontWeight: 700, color: C.warm },
    cardDesc: { fontSize: 14, color: C.soft, margin: "0 0 12px", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
    cardMeta: { display: "flex", gap: 8, flexWrap: "wrap" },
    cardMetaItem: { fontSize: 12, background: C.parchment, padding: "4px 10px", borderRadius: 10, color: C.soft, fontWeight: 600 },
    cardFooter: { padding: "8px 18px 14px", borderTop: `1px dashed ${C.border}80` },
    shoppingCheckLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.soft, cursor: "pointer", userSelect: "none" },
    shoppingCheck: { cursor: "pointer", width: 16, height: 16, accentColor: C.accent },

    emptyState: { textAlign: "center", padding: "64px 20px" },
    emptyText: { fontSize: 17, color: C.soft, margin: "12px 0 20px" },
    emptyBtn: { background: C.accent, color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: body },

    detailWrap: { paddingBottom: 40 },
    detailNav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0", flexWrap: "wrap", gap: 10 },
    backBtn: { background: "none", border: `1.5px solid ${C.accent}40`, borderRadius: 12, padding: "9px 20px", cursor: "pointer", fontSize: 14, color: C.accent, fontWeight: 600, fontFamily: body, textDecoration: "none", display: "inline-block" },
    editBtn: { background: `${C.accent}10`, border: `1.5px solid ${C.accent}35`, borderRadius: 12, padding: "9px 14px", cursor: "pointer", fontSize: 13, color: C.accent, fontWeight: 600, fontFamily: body },
    deleteBtn: { background: `${C.red}10`, border: `1.5px solid ${C.red}40`, borderRadius: 12, padding: "9px 14px", cursor: "pointer", fontSize: 13, color: C.red, fontWeight: 600, fontFamily: body },
    detailHero: { display: "flex", gap: 28, alignItems: "flex-start", padding: "0 0 28px", borderBottom: `2px dashed ${C.border}`, flexWrap: "wrap" },
    heroImgWrap: { width: 180, height: 180, borderRadius: 20, overflow: "hidden", background: `linear-gradient(135deg, ${C.parchment}, ${C.bg1})`, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border}`, flexShrink: 0 },
    heroImg: { width: "100%", height: "100%", objectFit: "cover" },
    heroEmoji: { fontSize: 80 },
    heroInfo: { flex: 1, minWidth: 240 },
    heroFav: { background: "none", border: "none", fontSize: 26, cursor: "pointer" },
    detailTitle: { fontFamily: font, fontSize: 32, margin: 0, fontWeight: 800, color: C.warm, lineHeight: 1.2 },
    detailDesc: { fontSize: 16, color: C.soft, margin: "10px 0 16px", lineHeight: 1.6, fontStyle: "italic" },
    detailChips: { display: "flex", gap: 8, flexWrap: "wrap" },
    chip: { fontSize: 13, background: C.fieldBg, padding: "6px 14px", borderRadius: 14, color: C.soft, fontWeight: 600, border: `1px solid ${C.border}` },
    tagRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 },
    tag: { fontSize: 12, color: C.accent, fontWeight: 600, opacity: 0.8 },

    portionBar: { display: "flex", alignItems: "center", justifyContent: "center", gap: 24, margin: "28px 0", padding: 20, background: C.card, borderRadius: 16, border: `1px solid ${C.border}` },
    portionLabel: { fontFamily: font, fontSize: 20, fontWeight: 700, color: C.warm },
    portionControls: { display: "flex", alignItems: "center", gap: 16 },
    portionBtn: { width: 42, height: 42, borderRadius: "50%", border: `2.5px solid ${C.accent}`, background: "transparent", color: C.accent, fontSize: 22, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: body, transition: "all 0.15s" },
    portionNum: { fontSize: 30, fontWeight: 800, color: C.accent, minWidth: 36, textAlign: "center", fontFamily: font },

    detailColumns: { display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 28, marginTop: 28 },
    sectionHead: { fontFamily: font, fontSize: 22, marginBottom: 16, fontWeight: 700, color: C.warm },
    ingList: { background: C.card, borderRadius: 16, padding: 18, border: `1px solid ${C.border}` },
    ingRow: { display: "flex", justifyContent: "space-between", padding: "10px 4px", borderBottom: `1px dotted ${C.border}`, fontSize: 15 },
    ingAmt: { fontWeight: 700, color: C.accent, minWidth: 90 },
    ingName: { color: C.text, flex: 1, textAlign: "right" },
    stepsList: { display: "flex", flexDirection: "column", gap: 16 },
    stepRow: { display: "flex", gap: 16, alignItems: "flex-start", cursor: "pointer", transition: "opacity 0.2s" },
    stepNum: { width: 36, height: 36, borderRadius: "50%", background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0, fontFamily: font, transition: "background 0.2s" },
    stepText: { margin: 0, lineHeight: 1.7, fontSize: 15, color: C.text, paddingTop: 6, transition: "all 0.2s" },

    formWrap: { paddingBottom: 40 },
    formNav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0", flexWrap: "wrap", gap: 10 },
    formTitle: { fontFamily: font, fontSize: 30, fontWeight: 800, color: C.warm, margin: "0 0 24px" },

    imageUploadArea: { marginBottom: 28 },
    imagePreviewWrap: { position: "relative", width: "100%", maxWidth: 400, borderRadius: 16, overflow: "hidden" },
    imagePreview: { width: "100%", height: 220, objectFit: "cover", borderRadius: 16, border: `1px solid ${C.border}`, display: "block" },
    uploadOverlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600 },
    removeImgBtn: { position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 16 },
    uploadPlaceholder: { width: "100%", maxWidth: 400, height: 160, borderRadius: 16, border: `2px dashed ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: `${C.parchment}60`, transition: "all 0.2s" },
    uploadText: { fontSize: 14, color: C.soft, marginTop: 8 },
    emojiPicker: { marginTop: 12 },
    emojiRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 },
    emojiBtn: { width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.border}`, background: C.fieldBg, fontSize: 22, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center" },
    emojiBtnActive: { borderColor: C.accent, background: `${C.accent}20`, boxShadow: `0 0 0 2px ${C.accent}40` },

    fieldGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
    fieldFull: { gridColumn: "1 / -1" },
    fieldLabel: { display: "block", fontSize: 13, fontWeight: 700, color: C.soft, marginBottom: 6, fontFamily: body },
    input: { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 15, fontFamily: body, color: C.text, background: C.fieldBg, transition: "all 0.2s" },
    textarea: { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 15, fontFamily: body, color: C.text, background: C.fieldBg, resize: "vertical", transition: "all 0.2s" },
    select: { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 15, fontFamily: body, color: C.text, background: C.fieldBg, cursor: "pointer" },

    formSection: { marginTop: 32 },
    formSectionTitle: { fontFamily: font, fontSize: 20, fontWeight: 700, color: C.warm, marginBottom: 14 },
    ingFormRow: { display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" },
    stepFormRow: { display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" },
    stepFormNum: { width: 32, height: 32, borderRadius: "50%", background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0, marginTop: 8, fontFamily: font },
    removeRowBtn: { background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 18, padding: "4px 8px", opacity: 0.6 },
    addRowBtn: { background: `${C.accent}15`, border: `1.5px dashed ${C.accent}50`, borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontSize: 14, color: C.accent, fontWeight: 600, fontFamily: body, marginTop: 8, width: "100%", transition: "all 0.2s" },
    tagInputRow: { display: "flex", gap: 8 },
    tagList: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
    tagBubble: { background: `${C.accent}20`, border: `1px solid ${C.accent}40`, borderRadius: 16, padding: "5px 12px", fontSize: 13, color: C.accent, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 },
    tagRemove: { background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 14, padding: 0 },
    formActions: { display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 36, paddingTop: 24, borderTop: `2px dashed ${C.border}` },
    cancelBtn: { padding: "12px 28px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: "transparent", cursor: "pointer", fontSize: 15, fontWeight: 600, color: C.soft, fontFamily: body },
    saveBtn: { padding: "12px 32px", borderRadius: 12, border: "none", background: C.accent, color: "#fff", cursor: "pointer", fontSize: 15, fontWeight: 700, fontFamily: body, boxShadow: `0 4px 16px ${C.accent}50`, transition: "all 0.2s" },
  };
}
