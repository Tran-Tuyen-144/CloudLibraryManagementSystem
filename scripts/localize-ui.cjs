/* global require, __dirname */
const fs = require("node:fs");
const path = require("node:path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const b = require("@babel/types");
const en = require("../src/ui/en.json");

const root = path.resolve(__dirname, "../src");

const targets = [
  "App.jsx",
  "components/layout/Sidebar.jsx",
  "components/layout/Header.jsx",
  "components/books/BookCarousel.jsx",
  "components/books/HomeSections.jsx",
  "components/books/FavoriteButton.jsx",
  "components/books/TopicBar.jsx",
  "pages/CatalogPage.jsx",
  "pages/LoansPage.jsx",
  "pages/AssistantPage.jsx",
  "pages/ProfilePage.jsx",
];

const has = (key) => Object.hasOwn(en, key);

const inside = (p, name) =>
  Boolean(
    p.findParent(
      (q) => q.isCallExpression() && b.isIdentifier(q.node.callee, { name }),
    ),
  );

const parameters = (values) =>
  b.objectExpression(
    values.map((value, index) =>
      b.objectProperty(b.stringLiteral(String(index)), value),
    ),
  );

const translated = (key, values = []) =>
  b.callExpression(b.identifier("t"), [
    b.stringLiteral(key),
    ...(values.length ? [parameters(values)] : []),
  ]);

function template(node) {
  return {
    key: node.quasis
      .map(
        (part, index) =>
          part.value.cooked +
          (index < node.expressions.length ? "{{" + index + "}}" : ""),
      )
      .join(""),
    values: node.expressions,
  };
}

for (const relative of targets) {
  const file = path.join(root, relative);

  if (!fs.existsSync(file)) continue;

  const source = fs.readFileSync(file, "utf8");

  const ast = parser.parse(source, {
    sourceType: "module",
    plugins: ["jsx"],
  });

  let usedT = false;
  let usedLocale = false;

  traverse(ast, {
    CallExpression(p) {
      const node = p.node;

      if (
        b.isIdentifier(node.callee, {
          name: "setMessage",
        })
      ) {
        const arg = node.arguments[0];

        const item = b.isStringLiteral(arg)
          ? { key: arg.value, values: [] }
          : b.isTemplateLiteral(arg)
            ? template(arg)
            : null;

        if (item && has(item.key)) {
          node.arguments[0] = b.objectExpression([
            b.objectProperty(b.identifier("key"), b.stringLiteral(item.key)),
            b.objectProperty(b.identifier("params"), parameters(item.values)),
          ]);
        }
      }

      if (
        b.isMemberExpression(node.callee) &&
        b.isIdentifier(node.callee.property)
      ) {
        const name = node.callee.property.name;

        const index =
          name === "localeCompare" ? 1 : name === "toLocaleDateString" ? 0 : -1;

        if (
          index >= 0 &&
          b.isStringLiteral(node.arguments[index]) &&
          ["vi", "vi-VN"].includes(node.arguments[index].value)
        ) {
          node.arguments[index] = b.callExpression(
            b.identifier("getLocale"),
            [],
          );

          usedLocale = true;
        }
      }
    },

    JSXText(p) {
      const raw = p.node.value;
      const key = raw.replace(/\s+/g, " ").trim();

      if (!has(key)) return;

      const parts = [];

      if (/^\s/.test(raw)) {
        parts.push(b.stringLiteral(" "));
      }

      parts.push(translated(key));

      if (/\s$/.test(raw)) {
        parts.push(b.stringLiteral(" "));
      }

      const expression = parts.reduce(
        (left, right) => (left ? b.binaryExpression("+", left, right) : right),
        null,
      );

      p.replaceWith(b.jsxExpressionContainer(expression));

      usedT = true;
      p.skip();
    },

    JSXExpressionContainer(p) {
      if (inside(p, "t")) return;

      const e = p.node.expression;

      const attr = p.parentPath.isJSXAttribute() ? p.parent.name.name : null;

      if (
        attr &&
        !["title", "aria-label", "alt", "placeholder"].includes(attr)
      ) {
        return;
      }

      const member =
        b.isMemberExpression(e) &&
        !e.computed &&
        b.isIdentifier(e.property) &&
        ["category", "description", "label"].includes(e.property.name);

      const label =
        b.isIdentifier(e) &&
        ["category", "selectedCategory", "label", "title", "message"].includes(
          e.name,
        );

      const option =
        b.isIdentifier(e, { name: "item" }) &&
        p.parentPath.isJSXElement() &&
        b.isJSXIdentifier(p.parent.openingElement.name, { name: "option" });

      const description =
        b.isLogicalExpression(e) &&
        b.isMemberExpression(e.left) &&
        b.isIdentifier(e.left.property, {
          name: "description",
        });

      if (
        member ||
        label ||
        option ||
        description ||
        (attr === "title" && b.isConditionalExpression(e))
      ) {
        p.node.expression = b.callExpression(b.identifier("t"), [e]);

        usedT = true;
        p.skip();
      }
    },

    TemplateLiteral(p) {
      if (inside(p, "t") || inside(p, "setMessage")) {
        return;
      }

      const item = template(p.node);

      if (!has(item.key)) return;

      p.replaceWith(translated(item.key, item.values));

      usedT = true;
      p.skip();
    },

    StringLiteral(p) {
      const key = p.node.value;

      if (!has(key) || inside(p, "t") || inside(p, "setMessage")) {
        return;
      }

      if (["Khác", "Tiểu thuyết", "Thiếu nhi", "Kỹ năng sống"].includes(key)) {
        return;
      }

      if (p.parentPath.isJSXAttribute()) {
        if (
          !["placeholder", "aria-label", "alt", "title"].includes(
            p.parent.name.name,
          )
        ) {
          return;
        }

        p.replaceWith(b.jsxExpressionContainer(translated(key)));
      } else {
        if (!p.getFunctionParent()) return;

        if (p.parentPath.isObjectProperty() && p.key === "key") {
          return;
        }

        if (p.parentPath.isBinaryExpression()) {
          return;
        }

        p.replaceWith(translated(key));
      }

      usedT = true;
      p.skip();
    },
  });

  const names = [...(usedT ? ["t"] : []), ...(usedLocale ? ["getLocale"] : [])];

  if (names.length) {
    let spec = path
      .relative(path.dirname(file), path.join(root, "ui/settings.js"))
      .split(path.sep)
      .join("/");

    if (!spec.startsWith(".")) {
      spec = "./" + spec;
    }

    const found = ast.program.body.find(
      (node) => b.isImportDeclaration(node) && node.source.value === spec,
    );

    if (found) {
      for (const name of names) {
        if (!found.specifiers.some((item) => item.local.name === name)) {
          found.specifiers.push(
            b.importSpecifier(b.identifier(name), b.identifier(name)),
          );
        }
      }
    } else {
      ast.program.body.unshift(
        b.importDeclaration(
          names.map((name) =>
            b.importSpecifier(b.identifier(name), b.identifier(name)),
          ),
          b.stringLiteral(spec),
        ),
      );
    }
  }

  const output =
    generate(
      ast,
      {
        comments: true,
        jsescOption: { minimal: true },
      },
      source,
    ).code + "\n";

  parser.parse(output, {
    sourceType: "module",
    plugins: ["jsx"],
  });

  if (output !== source) {
    if (!fs.existsSync(file + ".before-i18n")) {
      fs.writeFileSync(file + ".before-i18n", source);
    }

    fs.writeFileSync(file, output);
    console.log("Updated:", relative);
  }
}
