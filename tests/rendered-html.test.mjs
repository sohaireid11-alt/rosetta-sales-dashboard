import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the dashboard, history, reports, and field settings pages in the app source", async () => {
  const [page, layout, settings, history, reports, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/field-settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/history/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reports/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /Rosetta Sales Performance/);
  assert.match(page, /export default function Home/);
  assert.match(page, /\/api\/field-settings/);
  assert.match(settings, /export default function FieldSettingsPage/);
  assert.match(settings, /Admin Control Center/);
  assert.match(history, /export default function HistoryPage/);
  assert.match(history, /\/api\/history/);
  assert.match(reports, /export default function ReportsPage/);
  assert.match(reports, /\/api\/deals\/export\?days=/);
  assert.match(packageJson, /"react-loading-skeleton": "3\.5\.0"/);
});
