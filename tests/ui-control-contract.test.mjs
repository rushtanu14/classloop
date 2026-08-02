import { strict as assert } from "node:assert";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const appPath = new URL("../src/App.tsx", import.meta.url);
const source = fs.readFileSync(appPath, "utf8");
const sourceFile = ts.createSourceFile("src/App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function attribute(openingElement, name) {
  return openingElement.attributes.properties.find(
    (candidate) => ts.isJsxAttribute(candidate) && candidate.name.getText(sourceFile) === name,
  );
}

function lineFor(node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

test("every native ClassLoop button has an action contract", () => {
  const buttons = [];
  const deadButtons = [];

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (opening.tagName.getText(sourceFile) === "button") {
        buttons.push(opening);
        const onClick = attribute(opening, "onClick");
        const type = attribute(opening, "type")?.initializer?.getText(sourceFile) ?? "";
        const disabled = attribute(opening, "disabled");
        const hasAction = Boolean(onClick) || /submit/.test(type) || Boolean(disabled);
        if (!hasAction) deadButtons.push(lineFor(opening));
        if (onClick) {
          assert.doesNotMatch(
            onClick.getText(sourceFile),
            /=>\s*\{\s*\}/,
            `Button at src/App.tsx:${lineFor(opening)} has an empty click handler.`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.ok(buttons.length >= 180, `Expected the full ClassLoop control surface, found only ${buttons.length} buttons.`);
  assert.deepEqual(deadButtons, [], `Buttons without onClick, submit behavior, or an intentional disabled state: ${deadButtons.join(", ")}`);
});

test("every native ClassLoop link has a real destination", () => {
  const links = [];
  const missingDestinations = [];

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (opening.tagName.getText(sourceFile) === "a") {
        links.push(opening);
        const href = attribute(opening, "href");
        if (!href) missingDestinations.push(lineFor(opening));
        if (href) {
          assert.doesNotMatch(
            href.getText(sourceFile),
            /javascript:|href\s*=\s*["']#["']/i,
            `Link at src/App.tsx:${lineFor(opening)} uses a placeholder or unsafe destination.`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.ok(links.length >= 6, `Expected the ClassLoop link surface, found only ${links.length} links.`);
  assert.deepEqual(missingDestinations, [], `Links without href: ${missingDestinations.join(", ")}`);
});
