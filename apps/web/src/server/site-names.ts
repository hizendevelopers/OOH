import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Actor } from "@ibvs/domain";
import { getDb } from "./db";
import { ApiError, audit, requireAdmin } from "./service";

// Arabic site names. Each site's English description is machine-translated once and stored with the text it came
// from (face_name_translations). Only the description is sent to the translation service: no codes, coordinates,
// people or photos. Nothing else about a site changes.

const MODEL = "claude-opus-5-5";
const BATCH = 60;

export function translationConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Sites whose current description has no matching Arabic translation yet.
const missing = `FROM billboard_faces f LEFT JOIN face_name_translations t ON t.face_id=f.id AND t.source_text=f.description
  WHERE f.organization_id=$1 AND length(trim(f.description))>0 AND t.face_id IS NULL`;

export async function translationStatus(actor: Actor) {
  requireAdmin(actor);
  const [row] = await (await getDb()).query<{ remaining: number }>(`SELECT count(*)::int remaining ${missing}`, [actor.organizationId]);
  return { configured: translationConfigured(), remaining: row?.remaining ?? 0 };
}

const Translations = z.object({
  items: z.array(z.object({ id: z.string(), arabic: z.string() })),
});

const instructions = `You translate the names of billboard locations in Iraq from English into Arabic for an Arabic-language app used by Iraqi field workers and supervisors.
Each name describes where a billboard stands, for example "Opposite Al-Kindi Hospital Gate towards Al-Nahda".
Write natural Modern Standard Arabic as it would appear on Iraqi street signs and in local usage.
Write place, street, district, hospital, bridge, square and brand names in their usual Arabic form (for example Al-Kindi -> الكندي, Al-Nahda -> النهضة, Amana Bridge -> جسر الأمانة); keep Latin letters only for codes or brands that are normally written in Latin letters.
Keep numbers and directions exact. Do not add, explain or drop anything.
Return one item for every input item, with the same id.`;

// Translates one batch of untranslated names. Called repeatedly by the dashboard until nothing remains.
export async function translateSiteNames(actor: Actor) {
  requireAdmin(actor);
  if (!translationConfigured()) throw new ApiError(503, "Site name translation is not set up");
  const db = await getDb();
  const rows = await db.query<{ id: string; description: string }>(
    `SELECT f.id, f.description ${missing} ORDER BY f.created_at, f.id LIMIT ${BATCH * 3}`,
    [actor.organizationId],
  );
  if (!rows.length) return { translated: 0, remaining: 0 };
  // Many sites share the same name text; each distinct text is translated once.
  const texts = [...new Set(rows.map((r) => r.description.trim()))].slice(0, BATCH);
  const input = texts.map((text, i) => ({ id: String(i), english: text }));
  const client = new Anthropic();
  let parsed: z.infer<typeof Translations> | null;
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(Translations) },
      system: instructions,
      messages: [{ role: "user", content: JSON.stringify(input) }],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new Error(response.stop_reason);
    parsed = response.parsed_output;
  } catch (error) {
    // Only the error type is logged, never the names that were sent.
    console.error(JSON.stringify({ category: "site_name_translation_failed", error: error instanceof Error ? error.name : "unknown" }));
    throw new ApiError(502, "Site name translation failed; try again");
  }
  const arabicByText = new Map<string, string>();
  for (const item of parsed?.items ?? []) {
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
