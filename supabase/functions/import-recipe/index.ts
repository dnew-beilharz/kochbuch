// supabase/functions/import-recipe/index.ts
// Lädt eine Rezept-URL und extrahiert Schema.org/Recipe JSON-LD Daten

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || !url.startsWith("http")) {
      return new Response(
        JSON.stringify({ error: "Ungültige URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Webseite laden
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KochbuchBot/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`Webseite nicht erreichbar (${response.status})`);
    }

    const html = await response.text();

    // Alle JSON-LD Script-Tags finden
    const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    const matches = [...html.matchAll(scriptRegex)];

    let recipe = null;

    for (const match of matches) {
      try {
        const json = JSON.parse(match[1].trim());
        // Kann ein Array, ein Objekt mit @graph, oder direkt ein Recipe sein
        recipe = findRecipe(json);
        if (recipe) break;
      } catch (e) {
        // Ignore parse errors, try next script
      }
    }

    if (!recipe) {
      return new Response(
        JSON.stringify({ error: "Kein Rezept-Format auf dieser Seite gefunden. Die Seite unterstützt kein Schema.org/Recipe." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse in unser Format
    const parsed = parseRecipe(recipe, url);

    return new Response(
      JSON.stringify({ recipe: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Sucht rekursiv nach einem Recipe-Objekt in JSON-LD
function findRecipe(data: any): any {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipe(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== "object") return null;

  const type = data["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
    return data;
  }
  if (data["@graph"]) return findRecipe(data["@graph"]);
  return null;
}

// Konvertiert Schema.org Recipe in unser Datenformat
function parseRecipe(r: any, sourceUrl: string) {
  // Bild: kann String, Array oder Objekt mit url sein
  let imageUrl = null;
  const img = r.image;
  if (typeof img === "string") imageUrl = img;
  else if (Array.isArray(img) && img.length > 0) {
    imageUrl = typeof img[0] === "string" ? img[0] : img[0]?.url;
  } else if (img?.url) imageUrl = img.url;

  // Zutaten
  const ingredients = (r.recipeIngredient || []).map((line: string) => {
    const parsed = parseIngredientLine(line);
    return { name_de: parsed.name, name_en: "", amount: parsed.amount, unit: parsed.unit };
  });

  // Schritte: können Array von Strings, Array von HowToStep-Objekten, oder Array mit HowToSection sein
  const steps = extractSteps(r.recipeInstructions);

  // Zeit (ISO 8601 Duration)
  const totalMinutes = parseDuration(r.totalTime) || parseDuration(r.cookTime) || parseDuration(r.prepTime) || 30;

  // Portionen
  let servings = 4;
  if (r.recipeYield) {
    const yieldStr = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
    const match = String(yieldStr).match(/\d+/);
    if (match) servings = parseInt(match[0]);
  }

  // Kategorie raten
  const categoryText = (r.recipeCategory || r.recipeCuisine || "").toString().toLowerCase();
  let category = "mains";
  if (/suppe|soup/.test(categoryText)) category = "soups";
  else if (/dessert|nachspeise|kuchen|cake/.test(categoryText)) category = "desserts";
  else if (/salat|salad/.test(categoryText)) category = "salads";
  else if (/brot|bread|gebäck|pastry/.test(categoryText)) category = "bread";

  return {
    title_de: r.name || "Importiertes Rezept",
    title_en: "",
    description_de: cleanText(r.description || ""),
    description_en: "",
    category,
    difficulty: "medium",
    time_minutes: totalMinutes,
    base_servings: servings,
    image_url: imageUrl,
    emoji: "🍳",
    ingredients,
    steps_de: steps,
    steps_en: [],
    tags: ["importiert"],
    source_url: sourceUrl,
  };
}

// Parst einzelne Zutatenzeile wie "200 g Mehl" → {amount: 200, unit: "g", name: "Mehl"}
function parseIngredientLine(line: string): { amount: number | string; unit: string; name: string } {
  const cleaned = line.replace(/\s+/g, " ").trim();
  // Regex: Zahl (optional mit Komma/Punkt/Bruch) + optionale Einheit + Rest
  const match = cleaned.match(/^([\d.,½¼¾⅓⅔\/]+)\s*([a-zA-ZäöüÄÖÜ]+\.?)?\s+(.+)$/);
  if (!match) {
    return { amount: "", unit: "", name: cleaned };
  }
  const [, amountStr, unitRaw, name] = match;
  const amount = parseAmount(amountStr);
  const unit = normalizeUnit(unitRaw || "");
  // Prüfen ob das "unit" eher Teil des Namens ist (z.B. "Apfel")
  const knownUnits = ["g", "kg", "ml", "l", "el", "tl", "tsp", "tbsp", "cup", "stk", "prise"];
  if (unit && !knownUnits.includes(unit.toLowerCase())) {
    return { amount, unit: "", name: `${unitRaw} ${name}` };
  }
  return { amount, unit, name };
}

function parseAmount(s: string): number | string {
  // Brüche
  if (s.includes("½")) return 0.5;
  if (s.includes("¼")) return 0.25;
  if (s.includes("¾")) return 0.75;
  if (s.includes("⅓")) return 0.33;
  if (s.includes("⅔")) return 0.67;
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    if (a && b) return a / b;
  }
  const num = parseFloat(s.replace(",", "."));
  return isNaN(num) ? "" : num;
}

function normalizeUnit(u: string): string {
  const map: Record<string, string> = {
    "gramm": "g", "gr": "g", "g.": "g",
    "kilogramm": "kg", "kg.": "kg",
    "milliliter": "ml", "ml.": "ml",
    "liter": "l", "l.": "l",
    "esslöffel": "EL", "el": "EL", "tbsp": "EL", "tablespoon": "EL",
    "teelöffel": "TL", "tl": "TL", "tsp": "TL", "teaspoon": "TL",
    "stück": "Stk.", "stk": "Stk.", "stk.": "Stk.",
    "prise": "Prise",
    "tasse": "Tasse", "cup": "Tasse",
  };
  return map[u.toLowerCase()] || u;
}

function extractSteps(instr: any): string[] {
  if (!instr) return [];
  if (typeof instr === "string") {
    // Manchmal ist alles in einem langen String mit Nummern
    return instr.split(/\n+|\.\s+(?=[A-ZÄÖÜ])/).map(s => s.trim()).filter(s => s.length > 5);
  }
  if (!Array.isArray(instr)) instr = [instr];

  const steps: string[] = [];
  for (const item of instr) {
    if (typeof item === "string") {
      steps.push(cleanText(item));
    } else if (item["@type"] === "HowToStep") {
      steps.push(cleanText(item.text || item.name || ""));
    } else if (item["@type"] === "HowToSection" && item.itemListElement) {
      for (const sub of item.itemListElement) {
        if (sub.text) steps.push(cleanText(sub.text));
      }
    } else if (item.text) {
      steps.push(cleanText(item.text));
    }
  }
  return steps.filter(s => s.length > 0);
}

// ISO 8601 Duration parser (PT1H30M → 90)
function parseDuration(d: string | null | undefined): number {
  if (!d) return 0;
  const match = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  return hours * 60 + minutes;
}

function cleanText(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
