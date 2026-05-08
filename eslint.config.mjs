import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Catches catch blocks whose body has no statements (even if comments exist)
// Also catches re-throws that obscure the original error (missing { cause: e })
const catchPlugin = {
  rules: {
    "no-silent-catch": {
      create(context) {
        return {
          CatchClause(node) {
            if (node.body.body.length === 0) {
              context.report({
                node: node.body,
                message: "Empty catch block — handle the error or let it propagate.",
              });
            }
          },
        };
      },
    },
    "no-error-obscuring": {
      create(context) {
        return {
          CatchClause(node) {
            const param = node.param;
            for (const stmt of node.body.body) {
              if (stmt.type !== "ThrowStatement" ||
                stmt.argument?.type !== "NewExpression") continue;
              // Binding-less catch { throw new Error(...) } — always obscures
              if (!param) {
                context.report({
                  node: stmt,
                  message: "Error-obscuring re-throw — no catch binding, original error is lost. Use catch (e) and pass { cause: e }.",
                });
                continue;
              }
              // catch (e) { throw new Error(...) } without referencing e
              if (param.type === "Identifier") {
                const src = context.sourceCode.getText(stmt);
                if (!src.includes(param.name)) {
                  context.report({
                    node: stmt,
                    message: `Error-obscuring re-throw — original error '${param.name}' is lost. Pass it as { cause: ${param.name} }.`,
                  });
                }
              }
            }
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worker build artifacts:
    "worker/.wrangler/**",
  ]),
  {
    plugins: { catchPlugin },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // defensive.empty-catch: catch blocks that do nothing (including binding-less with only comments)
      "no-empty": ["error", { allowEmptyCatch: false }],
      "catchPlugin/no-silent-catch": "error",
      "catchPlugin/no-error-obscuring": "error",
      // defensive.error-obscuring: catch variable declared but never used
      "@typescript-eslint/no-unused-vars": [
        "error",
        { caughtErrors: "all", caughtErrorsIgnorePattern: "^_" },
      ]
    },
  },
]);

export default eslintConfig;
