import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the dashboard and field settings pages in the app source", async () => {
  const [page, layout, settings, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/field-settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /Rosetta Sales Performance/);
  assert.match(page, /export default function Home/);
  assert.match(page, /\/api\/field-settings/);
  assert.match(settings, /export default function FieldSettingsPage/);
  assert.match(packageJson, /"react-loading-skeleton": "3\.5\.0"/);
});
