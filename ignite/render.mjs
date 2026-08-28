import fs from "node:fs";
import path from "node:path";
import ejs from "ejs";
import prettier from "prettier";

/**
 * Template rendering for the KISOK Ignite generator.
 *
 * Deliberately mirrors Infinite Red's ignite-cli conventions — EJS templates,
 * YAML-ish front matter with `destinationDir`/`filename`, `NAME` filename
 * substitution, and the same case props — so the templates read like Ignite
 * templates and the conventions transfer.
 *
 * It is a local implementation rather than the `ignite-cli` package because
 * this generator must (a) accept custom options such as `--role` and `--layers`,
 * which ignite-cli does not forward into template props, (b) never prompt, so a
 * CI smoke test cannot hang, and (c) avoid pulling in `sharp` and `gluegun` for
 * app-icon features this repo does not use. See docs/adr/0005-generator.md.
 */

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Parse `key: value` front matter. Values are plain strings; `true`/`false`
 * become booleans. Nested structures are intentionally unsupported — if a
 * template needs them, the generator is doing too much.
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

/**
 * Render one template.
 * Front matter is rendered through EJS first, so `destinationDir` and `skip`
 * can depend on the generator's options.
 */
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
    // A generated file always ends with exactly one newline so Prettier's
    // check does not fail on freshly generated code.
    contents: `${body.replace(/\s*$/, "")}\n`,
  };
}

/** Case conversions matching ignite-cli's prop names. */
export function caseProps(input) {
  const words = String(input)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_\-/]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

  if (words.length === 0) throw new Error("A feature name is required.");

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
 * the feature name being interpolated — so the generator formats what it writes.
 * Without this, every generated feature would fail `pnpm format:check` on its
 * first commit.
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
        // A template that produces unparseable output is a bug worth seeing,
        // but it should not stop the rest of the feature from being written.
        console.warn(`Could not format ${file.destination}: ${error.message}`);
        return file;
      }
    }),
  );
}
