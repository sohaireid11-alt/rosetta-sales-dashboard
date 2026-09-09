import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin catalog seeds every current sales and client-care field", async () => {
  const catalog = await readFile(new URL("../app/admin-catalog.ts", import.meta.url), "utf8");
  for (const key of [
    "leadName",
    "company",
    "organizationType",
    "sourceType",
    "service",
    "nextAction",
    "stage",
    "dealValue",
    "clientName",
    "relationshipType",
    "satisfactionStatus",
    "activityType",
    "status",
  ]) {
    assert.match(catalog, new RegExp(`"${key}"`));
  }
  assert.match(catalog, /COMING_NEXT/);
  assert.match(catalog, /Add brand-new fields without a deploy/);
});

test("dashboard no longer hardcodes teammate names in import copy", async () => {
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(home, /labels.importToolbarCopy/);
  assert.doesNotMatch(home, /when Danyal is ready/);
  assert.doesNotMatch(home, /"Fady"/);
});
