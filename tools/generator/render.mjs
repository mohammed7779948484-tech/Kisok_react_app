import fs from "node:fs";
import path from "node:path";
import ejs from "ejs";
import prettier from "prettier";

/**
 * Template rendering for the KISOK generator.
 *
 * Templates are EJS with YAML-ish front matter. Front matter is rendered through
 * EJS FIRST, so `destinationDir`, `filename` and `skip` can depend on the
 * options a capability was invoked with.
 *
 * These conventions were modelled on Infinite Red's ignite-cli, which is a good
 * design. The implementation is local rather than that package — see
 * docs/adr/0005-generator.md.
 */
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Parse `key: value` front matter. Values are plain strings; `true`/`false`
 * become booleans. Nested structures are deliberately unsupported — a template
 * that needs them is doing too much.
 */
export function parseFrontMatter(source) {
  const match = FRONT_MATTER.exec(source);
  if (!match) return { attributes: {}, body: source };

  const attributes = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf(":");
    if (separator === -1) throw new Error(`Malformed front matter line: "${line}"`);

    const key = trimmed.slice(0, separator).trim();
    const raw = trimmed.slice(separator + 1).trim();
    attributes[key] = raw === "true" ? true : raw === "false" ? false : raw;
  }

  return { attributes, body: source.slice(match[0].length) };
}

/** Render one template into a planned file, or `null` when it opts out. */
export function renderTemplate(templatePath, props) {
  const source = fs.readFileSync(templatePath, "utf8");
  const rendered = ejs.render(source, { props }, { filename: templatePath });
  const { attributes, body } = parseFrontMatter(rendered);

  if (attributes.skip === true) return null;

  const defaultName = path.basename(templatePath).replace(/\.ejs$/, "");
  const filename = String(attributes.filename ?? defaultName).replace(/NAME/g, props.kebabCaseName);

  if (!attributes.destinationDir) {
    throw new Error(`Template ${templatePath} is missing a "destinationDir" front-matter key.`);
  }

  return {
    template: templatePath,
    destination: path.join(String(attributes.destinationDir), filename),
    // Exactly one trailing newline, so freshly generated code passes
    // `prettier --check` before anyone has touched it.
    contents: `${body.replace(/\s*$/, "")}\n`,
  };
}

/** Render every `.ejs` template in a capability's template directory. */
export function renderTemplateDir(templateDir, props) {
  if (!fs.existsSync(templateDir)) {
    throw new Error(`No templates found at ${templateDir}`);
  }

  return fs
    .readdirSync(templateDir)
    .filter((entry) => entry.endsWith(".ejs"))
    .sort()
    .map((entry) => renderTemplate(path.join(templateDir, entry), props))
    .filter((file) => file !== null);
}

/** The case conversions available to every template. */
export function caseProps(input) {
  const words = String(input)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_\-/]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

  if (words.length === 0) throw new Error("A name is required.");

  const pascalCaseName = words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");

  return {
    originalName: String(input),
    name: words.join("-"),
    pascalCaseName,
    camelCaseName: pascalCaseName[0].toLowerCase() + pascalCaseName.slice(1),
    kebabCaseName: words.join("-"),
    snakeCaseName: words.join("_"),
  };
}

/**
 * Format generated files with the project's own Prettier config.
 *
 * Templates cannot reliably produce formatted output — line length depends on
 * the name being interpolated — so the generator formats what it writes.
 */
export async function formatFiles(files) {
  return Promise.all(
    files.map(async (file) => {
      const config = await prettier.resolveConfig(file.destination);
      try {
        const contents = await prettier.format(file.contents, {
          ...config,
          filepath: file.destination,
        });
        return { ...file, contents };
      } catch (error) {
        // A template producing unparseable output is a bug worth seeing, but it
        // should not stop the rest of the files from being written.
        console.warn(`Could not format ${file.destination}: ${error.message}`);
        return file;
      }
    }),
  );
}

/**
 * Write planned files.
 *
 * Never overwrites without `force`: a generator that can silently destroy a
 * half-finished feature is worse than no generator. Re-running a capability on
 * an existing feature is a normal, safe thing to do.
 */
export function writeFiles(files, { root, force = false, dryRun = false }) {
  const written = [];
  const skipped = [];

  for (const file of files) {
    const absolute = path.join(root, file.destination);
    if (fs.existsSync(absolute) && !force) {
      skipped.push(file.destination);
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, file.contents, "utf8");
    }
    written.push(file.destination);
  }

  return { written, skipped };
}

/**
 * Append a screen's export to the feature's own `index.ts` when it is missing.
 *
 * A route renders its screen through the feature's public API, so adding a
 * screen to an EXISTING feature has to be exported there or the route will not
 * compile — and "generated code compiles immediately" has to stay true.
 *
 * This is the ONLY file the generator appends to, and it is deliberately safe:
 * `features/<name>/index.ts` belongs to exactly one feature, so unlike a shared
 * registry it is never a cross-agent conflict. It appends only when the exact
 * export is absent, never reorders, and never rewrites existing lines.
 */
export function ensureFeatureExport(files, { root, feature, dryRun, alreadyWritten }) {
  const indexPath = `features/${feature}/index.ts`;
  const absolute = path.join(root, indexPath);
  const appended = [];

  // A freshly generated feature already exports its screen from the template.
  if (alreadyWritten.includes(indexPath) || !fs.existsSync(absolute)) return appended;

  const current = fs.readFileSync(absolute, "utf8");
  let next = current;

  for (const file of files) {
    const match = /features\/[^/]+\/screens\/(.+)\.tsx$/.exec(file.destination);
    if (!match) continue;

    const basename = match[1];
    const componentName = `${basename
      .replace(/-screen$/, "")
      .split("-")
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join("")}Screen`;

    const line = `export { ${componentName} } from "./screens/${basename}";`;
    if (next.includes(line)) continue;

    next = `${next.replace(/\s*$/, "")}\n${line}\n`;
    appended.push(`${indexPath} — added ${componentName}`);
  }

  if (next !== current && !dryRun) fs.writeFileSync(absolute, next, "utf8");
  return appended;
}
