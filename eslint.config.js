// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

// Rules here intentionally map 1:1 to the "Hold the Line" items in .cursorrules
// (type safety, no direct DOM manipulation, no silent error swallowing).
// Pure code-style preferences (tseslint stylistic, WCAG/a11y template rules) are
// deliberately left out - see .cursorrules Section 0 "Let It Go".
module.exports = defineConfig([
  {
    ignores: ["src/app/apps/jaxfr/archive/**"],
  },
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        // Allow destructuring-to-omit-fields, e.g.
        // `const { created_at, updated_at, ...payload } = data;`
        { ignoreRestSiblings: true },
      ],
      "no-console": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='document'][callee.property.name='getElementById']",
          message:
            "Avoid document.getElementById; use Angular's viewChild/ElementRef signal queries instead.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^querySelector(All)?$/]",
          message:
            "Avoid querySelector/querySelectorAll; use Angular's viewChild/ElementRef signal queries instead.",
        },
        {
          selector: "AssignmentExpression[left.object.property.name='style']",
          message:
            "Avoid direct element.style manipulation; use Angular class/style bindings driven by signals instead.",
        },
      ],
    },
  },
  {
    files: ["**/*.html"],
    extends: [angular.configs.templateRecommended],
    rules: {},
  },
]);
