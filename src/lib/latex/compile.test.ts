import { describe, expect, it } from "vitest";

import { parseDiagnostics, sanitizedLatexEnv } from "./compile";

describe("sanitizedLatexEnv", () => {
  it("includes PATH, HOME, TMPDIR and excludes secrets", () => {
    process.env.DOSSIER_SECRET = "super-secret-key-12345";
    process.env.DATABASE_URL = "postgres://dossier:secret@localhost/dossier";

    const env = sanitizedLatexEnv();
    expect(env.PATH).toBeDefined();
    expect(env.DOSSIER_SECRET).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });
});

describe("parseDiagnostics", () => {
  it("extracts TeX errors and line numbers", () => {
    const rawStderr = `
Running TeX ...
! Undefined control sequence.
l.42 \\invalidmacro
                   {something}
The compiler stopped here.
`;
    const diagnostics = parseDiagnostics(rawStderr);
    expect(diagnostics.some((d) => d.includes("! Undefined control sequence."))).toBe(true);
    expect(diagnostics.some((d) => d.includes("l.42"))).toBe(true);
  });

  it("handles empty stderr gracefully", () => {
    expect(parseDiagnostics("")).toEqual(["Compilation failed with unknown error."]);
  });
});

