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

/** A generation request that was rejected before anything was written. */
export class GeneratorError extends Error {
  name = "GeneratorError";
}

/**
 * Format generated files with the project's own Prettier config.
 *
 * Templates cannot reliably produce formatted output — line length depends on
 * the name being interpolated — so the generator formats what it writes.
 *
 * A file Prettier cannot PARSE is a template bug that would put broken code in
 * someone's feature directory. This used to warn and write the file anyway,
 * which is the worst outcome: a half-generated feature that does not compile,
 * mixed in with files that do, and no clean way back. Now it aborts the whole
 * request — every failure at once, so a broken template is fixed in one pass.
 */
export async function formatFiles(files) {
  const failures = [];

  const formatted = await Promise.all(
    files.map(async (file) => {
      const config = await prettier.resolveConfig(file.destination);
      try {
        const contents = await prettier.format(file.contents, {
          ...config,
          filepath: file.destination,
        });
        return { ...file, contents };
      } catch (error) {
        failures.push(`  ${file.destination}\n    from ${file.template}\n    ${error.message}`);
        return file;
      }
    }),
  );

  if (failures.length > 0) {
    throw new GeneratorError(
      `${failures.length} generated file(s) could not be parsed, so NOTHING was written:\n\n` +
        `${failures.join("\n\n")}\n\n` +
        `Fix the template, then re-run. No partial output was left behind.`,
    );
  }

  return formatted;
}

/**
 * Reject a plan that would write somewhere it should not, before writing.
 *
 * The invariant this protects is what lets several agents generate in parallel:
 * a capability writes inside its own feature, and the single exception is one
 * Expo Router file. Nothing may touch a shared registry, a barrel, or another
 * feature. Enforced here rather than left to template review, because a
 * front-matter typo is otherwise invisible until it lands in someone's branch.
 */
export function validatePlan(files, { feature, routeDir }) {
  const problems = [];
  const featureDir = `features/${feature}/`;
  const seen = new Set();

  for (const file of files) {
    const destination = file.destination.split(path.sep).join("/");

    if (destination.includes("..")) {
      problems.push(`${destination} escapes the project root.`);
      continue;
    }
    if (seen.has(destination)) {
      problems.push(`${destination} is planned twice.`);
      continue;
    }
    seen.add(destination);

    if (file.contents.trim().length === 0) {
      problems.push(`${destination} would be empty.`);
    }

    const insideFeature = destination.startsWith(featureDir);
    const isRoute = routeDir && destination.startsWith(`${routeDir}/`);
    if (!insideFeature && !isRoute) {
      problems.push(
        `${destination} is outside features/${feature}/ and is not a route. ` +
          `Generated code must stay feature-local.`,
      );
    }
  }

  if (problems.length > 0) {
    throw new GeneratorError(
      `The plan was rejected, so NOTHING was written:\n\n` +
        problems.map((problem) => `  - ${problem}`).join("\n"),
    );
  }

  return files;
}

/**
 * Write planned files, all or nothing.
 *
 * Never overwrites without `force`: a generator that can silently destroy a
 * half-finished feature is worse than no generator. Re-running a capability on
 * an existing feature is a normal, safe thing to do.
 *
 * If a write fails part-way — a permission error, a full disk — everything
 * already written by THIS call is removed again, along with any directory it
 * created. A failed generation must leave the repository exactly as it was.
 */
export function writeFiles(files, { root, force = false, dryRun = false }) {
  const written = [];
  const skipped = [];

  const planned = [];
  for (const file of files) {
    const absolute = path.join(root, file.destination);
    if (fs.existsSync(absolute) && !force) {
      skipped.push(file.destination);
      continue;
    }
    planned.push({ ...file, absolute });
  }

  if (dryRun) {
    return { written: planned.map((file) => file.destination), skipped };
  }

  const createdFiles = [];
  const createdDirs = [];

  try {
    for (const file of planned) {
      const directory = path.dirname(file.absolute);
      // Remember which directories did not exist, so a rollback can take them
      // away too rather than leaving empty scaffolding behind.
      for (const candidate of missingAncestors(directory, root)) createdDirs.push(candidate);
      fs.mkdirSync(directory, { recursive: true });

      const existed = fs.existsSync(file.absolute);
      fs.writeFileSync(file.absolute, file.contents, "utf8");
      if (!existed) createdFiles.push(file.absolute);
      written.push(file.destination);
    }
  } catch (error) {
    for (const absolute of createdFiles.reverse()) {
      try {
        fs.rmSync(absolute, { force: true });
      } catch {
        // Best effort: report the original failure, not the cleanup's.
      }
    }
    for (const directory of createdDirs.reverse()) {
      try {
        fs.rmdirSync(directory);
      } catch {
        // Non-empty because something else lives there — correct to keep.
      }
    }
    throw new GeneratorError(
      `Writing failed part-way and was rolled back; the repository is unchanged.\n  ${error.message}`,
    );
  }

  return { written, skipped };
}

/** Directories between `root` and `directory` that do not exist yet, outermost first. */
function missingAncestors(directory, root) {
  const missing = [];
  let current = directory;
  while (current.startsWith(root) && current !== root && !fs.existsSync(current)) {
    missing.unshift(current);
    current = path.dirname(current);
  }
  return missing;
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
    // Screens own a directory: screens/<name>/<name>-screen.tsx. Tests and
    // screen-local components live there too and must not be exported.
    const match = /features\/[^/]+\/screens\/([^/]+)\/([^/]+)-screen\.tsx$/.exec(
      file.destination.split(path.sep).join("/"),
    );
    if (!match) continue;

    const [, directory, basename] = match;
    const componentName = `${basename
      .split("-")
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join("")}Screen`;

    const line = `export { ${componentName} } from "./screens/${directory}/${basename}-screen";`;
    if (next.includes(line)) continue;

    next = `${next.replace(/\s*$/, "")}\n${line}\n`;
    appended.push(`${indexPath} — added ${componentName}`);
  }

  if (next !== current && !dryRun) fs.writeFileSync(absolute, next, "utf8");
  return appended;
}
