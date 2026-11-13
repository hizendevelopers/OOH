import { z } from "zod";
import type { Actor } from "@ibvs/domain";
import { getDb, type Database } from "./db";
import { ApiError, audit, requireAdmin } from "./service";

// Arabic site names. Each site's English description is machine-translated once by the Gemini API and stored with
// the text it came from (face_name_translations). Only the description is sent: no codes, coordinates, people or
// photos. Nothing else about a site changes.

const MODEL = "gemini-3.5-flash-lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
// Names are short, so a larger batch means far fewer round trips: about 2,750 names take
// roughly 18 requests rather than 46, each still well inside the route's time limit.
const BATCH = 150;

const apiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

export function translationConfigured() {
  return Boolean(apiKey());
}

// Sites whose current description has no matching Arabic translation yet.
const missing = `FROM billboard_faces f
  JOIN billboard_structures s ON s.id=f.structure_id
  LEFT JOIN face_name_translations t ON t.face_id=f.id AND t.source_text=f.description
  WHERE f.organization_id=$1 AND length(trim(f.description))>0 AND t.face_id IS NULL`;

export async function translationStatus(actor: Actor) {
  requireAdmin(actor);
  const [row] = await (await getDb()).query<{ remaining: number }>(`SELECT count(*)::int remaining ${missing}`, [actor.organizationId]);
  return { configured: translationConfigured(), remaining: row?.remaining ?? 0 };
}

const Translations = z.object({
  items: z.array(z.object({ id: z.string(), arabic: z.string() })),
});

const responseSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, arabic: { type: "string" } },
        required: ["id", "arabic"],
      },
    },
  },
  required: ["items"],
};

const instructions = `You translate the names of billboard locations in Iraq from English into Arabic for an Arabic-language app used by Iraqi field workers and supervisors.
Each name describes where a billboard stands, for example "Opposite Al-Kindi Hospital Gate towards Al-Nahda".
Write natural Modern Standard Arabic as it would appear on Iraqi street signs and in local usage.
Write place, street, district, hospital, bridge, square and brand names in their usual Arabic form (for example Al-Kindi -> الكندي, Al-Nahda -> النهضة, Amana Bridge -> جسر الأمانة); keep Latin letters only for codes or brands that are normally written in Latin letters.
Keep numbers and directions exact. Do not add, explain or drop anything.
Return one item for every input item, with the same id, as JSON of the form {"items":[{"id":"0","arabic":"..."}]}.`;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

// One call to Gemini. The structured-output schema is dropped and retried once if this API version rejects it,
// because the answer is validated here either way.
async function askGemini(prompt: string, key: string): Promise<string> {
  const body = (withSchema: boolean) => ({
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 32768,
      ...(withSchema ? { responseJsonSchema: responseSchema } : {}),
    },
  });
  let response: Response | null = null;
  for (const withSchema of [true, false]) {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body(withSchema)),
      // Must finish inside the route's own time limit, so a slow answer fails cleanly instead of
      // being cut off by the platform.
      signal: AbortSignal.timeout(40000),
    });
    if (response.ok) break;
    if (response.status !== 400 || !withSchema) break;
  }
  if (!response || !response.ok) throw new Error(`gemini_http_${response?.status ?? "none"}`);
  const result = (await response.json()) as GeminiResponse;
  if (result.promptFeedback?.blockReason) throw new Error(`gemini_blocked_${result.promptFeedback.blockReason}`);
  const candidate = result.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") throw new Error(`gemini_${candidate.finishReason}`);
  const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");
  if (!text.trim()) throw new Error("gemini_empty");
  return text;
}

// The next sites to translate. A chosen city comes first, so the city an administrator is looking at
// finishes quickly instead of waiting behind every other city in import order; the rest follow in
// import order. Exported so the ordering can be tested without calling the translation service.
export async function untranslatedSites(
  db: Pick<Database, "query">,
  organizationId: string,
  city?: string | null,
  limit = BATCH * 3,
) {
  const chosen = (city ?? "").trim().slice(0, 120) || null;
  return db.query<{ id: string; description: string }>(
    `SELECT f.id, f.description ${missing}
     ORDER BY ${chosen ? "(s.city = $2) DESC, " : ""}f.created_at, f.id LIMIT ${Number(limit)}`,
    chosen ? [organizationId, chosen] : [organizationId],
  );
}

// Translates one batch of untranslated names. Called repeatedly by the dashboard until nothing remains.
export async function translateSiteNames(actor: Actor, city?: string | null) {
  requireAdmin(actor);
  const key = apiKey();
  if (!key) throw new ApiError(503, "Site name translation is not set up");
  const db = await getDb();
  const rows = await untranslatedSites(db, actor.organizationId, city);
  if (!rows.length) return { translated: 0, remaining: 0 };
  // Many sites share the same name text; each distinct text is translated once.
  const texts = [...new Set(rows.map((r) => r.description.trim()))].slice(0, BATCH);
  const input = texts.map((text, i) => ({ id: String(i), english: text }));
  let parsed: z.infer<typeof Translations>;
  try {
    parsed = Translations.parse(JSON.parse(await askGemini(JSON.stringify(input), key)));
  } catch (error) {
    // Only the failure kind is logged, never the names that were sent.
    console.error(JSON.stringify({ category: "site_name_translation_failed", error: error instanceof Error ? error.message.slice(0, 60) : "unknown" }));
    throw new ApiError(502, "Site name translation failed; try again");
  }
  const arabicByText = new Map<string, string>();
  for (const item of parsed.items) {
    const english = texts[Number(item.id)];
    const arabic = item.arabic.trim();
    if (english !== undefined && arabic && arabic.length <= 1000) arabicByText.set(english, arabic);
  }
  let translated = 0;
  await db.transaction(async (tx) => {
    for (const row of rows) {
      const arabic = arabicByText.get(row.description.trim());
      if (!arabic) continue;
      await tx.query(
        `INSERT INTO face_name_translations(face_id,organization_id,source_text,name_ar,model) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT (face_id) DO UPDATE SET source_text=EXCLUDED.source_text, name_ar=EXCLUDED.name_ar, model=EXCLUDED.model, translated_at=now()`,
        [row.id, actor.organizationId, row.description, arabic, MODEL],
      );
      translated++;
    }
    if (translated) await audit(tx, actor, "site_names.translate", actor.organizationId, { translated, model: MODEL });
  });
  if (!translated) throw new ApiError(502, "Site name translation failed; try again");
  const { remaining } = await translationStatus(actor);
  return { translated, remaining };
}
