import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Flat config, imported directly.
 *
 * `eslint-config-next` 16 ships flat configs at these subpaths, so the old
 * `FlatCompat` bridge is no longer needed — and worse than unnecessary: it
 * crashed on ESLint 9.39 trying to serialise a config object containing a
 * circular plugin reference, which meant `npm run lint` did nothing at all.
 */
const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [".next/**", "node_modules/**", "drizzle/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];

export default eslintConfig;
