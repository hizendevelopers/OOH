import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { getDb } from "../apps/web/src/server/db";
import { untranslatedSites } from "../apps/web/src/server/site-names";

// Sites are imported city by city, so without a chosen city the oldest import is translated first.
// An administrator looking at one city should not wait for every other city to finish.
const org = "sitenames-org";
const sites = [
  { code: "BGD-1", city: "Baghdad", description: "Opposite Al-Kindi Hospital Gate" },
  { code: "BGD-2", city: "Baghdad", description: "Ramp down from Amana Bridge" },
  { code: "BSR-1", city: "Basra", description: "Al-Seed St." },
  { code: "BSR-2", city: "Basra", description: "Bashar Intersection" },
  { code: "NONAME", city: "Basra", description: "" },
];

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("site-names-");
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
  await migrate();
  const db = await getDb();
  await db.query("INSERT INTO organizations(id,name) VALUES($1,'Site names')", [org]);
  // Baghdad is imported first, so it sorts first when no city is chosen.
  for (const site of sites) {
    const structure = randomUUID();
    await db.query("INSERT INTO billboard_structures(id,organization_id,code,city) VALUES($1,$2,$3,$4)", [
      structure,
      org,
      "STR-" + site.code,
      site.city,
    ]);
    await db.query(
      "INSERT INTO billboard_faces(id,organization_id,structure_id,code,orientation,description) VALUES($1,$2,$3,$4,'N',$5)",
      [randomUUID(), org, structure, site.code, site.description],
    );
  }
});

const codesOf = async (city?: string) =>
  (await untranslatedSites(await getDb(), org, city)).map((row) => row.description);

describe("which site names are translated next", () => {
  it("takes the oldest import first when no city is chosen", async () => {
    expect(await codesOf()).toEqual([
      "Opposite Al-Kindi Hospital Gate",
      "Ramp down from Amana Bridge",
      "Al-Seed St.",
      "Bashar Intersection",
    ]);
  });
  it("puts the chosen city first, and still returns the rest after it", async () => {
    expect(await codesOf("Basra")).toEqual([
      "Al-Seed St.",
      "Bashar Intersection",
      "Opposite Al-Kindi Hospital Gate",
      "Ramp down from Amana Bridge",
    ]);
  });
  it("ignores a city that matches nothing rather than returning none", async () => {
    expect(await codesOf("Nowhere")).toHaveLength(4);
  });
  it("skips sites that have no name to translate", async () => {
    expect((await codesOf()).some((d) => d.trim() === "")).toBe(false);
  });
  it("returns nothing for another organization's sites", async () => {
    expect(await untranslatedSites(await getDb(), "someone-else")).toEqual([]);
  });
  it("leaves out a site once its current name is translated", async () => {
    const db = await getDb();
    const [face] = await db.query<{ id: string; description: string }>(
      "SELECT id, description FROM billboard_faces WHERE code='BSR-1'",
    );
    await db.query(
      "INSERT INTO face_name_translations(face_id,organization_id,source_text,name_ar,model) VALUES($1,$2,$3,$4,'test')",
      [face.id, org, face.description, "شارع السيد"],
    );
    expect(await codesOf("Basra")).toEqual([
      "Bashar Intersection",
      "Opposite Al-Kindi Hospital Gate",
      "Ramp down from Amana Bridge",
    ]);
  });
});
