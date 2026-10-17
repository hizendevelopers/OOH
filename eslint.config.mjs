import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
const config = [
  ...next,
  ...ts,
  {
    ignores: [
      ".local/**",
      "**/.next/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "apps/web/next-env.d.ts",
    ],
  },
  {
    settings: { next: { rootDir: "apps/web/" } },
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
];
export default config;
