// Validates a content JSON file against the site's config schema.
// Used by Drayspo Studio (before preview) and by the publish workflow (before build),
// so a bad edit can never reach drayspo.com.
//
//   bun tools/content/validate.ts path/to/content.json
import { configSchema } from "../../src/config/schema";

const file = process.argv[2];
if (!file) {
  console.error("Usage: bun tools/content/validate.ts <content.json>");
  process.exit(2);
}

let data: unknown;
try {
  data = await Bun.file(file).json();
} catch (e) {
  console.error(`Could not read ${file} as JSON: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

const result = configSchema.safeParse(data);
if (!result.success) {
  console.error(`Content is not valid (${result.error.issues.length} problem(s)):`);
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}
console.log("Content is valid.");
