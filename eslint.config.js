import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "data/**",
      "apps/web/public/ort/**"
    ]
  },
  ...tseslint.configs.recommended,
  {
    files: ["packages/**/*.ts", "effects/**/*.ts", "apps/web/src/**/*.{ts,tsx}", "scripts/**/*.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["packages/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": ["**/effects/**", "@loki/effect-!(api)"],
              "message": "Core packages must not import concrete effects. Use packages/effect-api."
            }
          ]
        }
      ]
    }
  }
);
