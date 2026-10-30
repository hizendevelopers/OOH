import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";

it("renders the setup fallback for invalid production settings without throwing again or exposing values", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module"],
    {
      cwd: path.resolve("apps/web"),
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: path.resolve("apps/web/tsconfig.json"),
        NODE_ENV: "production",
        DATABASE_URL: "",
        BETTER_AUTH_SECRET: "private-invalid-value",
        IBVS_ALLOW_LOCAL_DB: "false",
      },
      input: `
      import {renderToStaticMarkup} from 'react-dom/server';
      const logs=[]; console.error=(message)=>logs.push(message);
      const {default:Page}=await import('./src/app/page.tsx');
      console.log(JSON.stringify({html:renderToStaticMarkup(await Page()),logs}));
    `,
      encoding: "utf8",
    },
  );
  const { html, logs } = JSON.parse(output);
  expect(html).toContain("IBVS needs database setup");
  expect(html).not.toContain("Open sign in");
  expect(logs).toEqual([
    JSON.stringify({
      category: "configuration_error",
      message: "Invalid environment fields: BETTER_AUTH_SECRET",
    }),
  ]);
  expect(output).not.toContain("private-invalid-value");
});
