import { expect, it } from "vitest";
import { errorFacts } from "../apps/web/src/server/error-facts";

it("keeps the error kind, database code and a short message", () => {
  const e = Object.assign(new Error("permission denied for table evidence_objects"), { code: "42501" });
  expect(errorFacts(e)).toEqual({
    errorName: "Error",
    errorCode: "42501",
    errorMessage: "permission denied for table evidence_objects",
  });
});

it("never logs a connection string and caps long messages", () => {
  const e = new Error("connect failed postgresql://ibvs_app:secret@host:5432/db " + "x".repeat(500));
  const facts = errorFacts(e);
  expect(facts.errorMessage).not.toContain("secret");
  expect(facts.errorMessage).toContain("[connection]");
  expect(facts.errorMessage.length).toBeLessThanOrEqual(300);
});
