import { getFieldSettings, getOptionLists } from "../../field-settings/field-settings-utils";
import {
  RecordValidationError,
  errorMessage,
  importRecords,
  parseRecordInput,
} from "../record-utils";
import { AccessError, requireRole } from "../../../lib/access";

const maximumImportRows = 500;

export async function POST(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    const payload = (await request.json()) as { records?: unknown[] };
    if (!Array.isArray(payload.records) || payload.records.length === 0) {
      throw new RecordValidationError("Choose a CSV file with at least one sales record.");
    }
    if (payload.records.length > maximumImportRows) {
      throw new RecordValidationError(`Import up to ${maximumImportRows} records at a time.`);
    }

    const settings = await getFieldSettings(true);
    const lists = await getOptionLists();
    const records = payload.records.map((record) => parseRecordInput(record, lists, settings.fields));
    const result = await importRecords(records);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof RecordValidationError ? 400 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
