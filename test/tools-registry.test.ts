import { describe, expect, it } from "vitest";
import {
  executeTool,
  getPublicToolMetadata,
  getToolSpecs,
} from "@/ai/tools/registry";

/**
 * These are contract tests, not coverage. They encode the invariants that
 * `app_arc.md` §5/§17 depend on and that have already broken once in
 * production (duplicate model ids in the provider catalogue).
 */
describe("tool registry — schema invariants", () => {
  const specs = getToolSpecs();

  it("exposes at least one tool", () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it("has no duplicate tool names", () => {
    const names = specs.map((s) => s.function.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every tool a non-empty description", () => {
    for (const spec of specs) {
      expect(spec.function.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("names every tool with a snake_case identifier", () => {
    for (const spec of specs) {
      expect(spec.function.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("gives every tool an object input schema", () => {
    for (const spec of specs) {
      expect(spec.function.parameters.type).toBe("object");
    }
  });

  it("declares every required parameter in properties", () => {
    // A `required` key with no matching `properties` entry means the model is
    // being asked for a field it cannot legally describe.
    for (const spec of specs) {
      const { required = [], properties } = spec.function.parameters;
      for (const key of required) {
        expect(
          Object.prototype.hasOwnProperty.call(properties, key),
          `tool "${spec.function.name}" requires "${key}" but does not declare it`,
        ).toBe(true);
      }
    }
  });

  it("declares a type for every declared property", () => {
    for (const spec of specs) {
      for (const [key, value] of Object.entries(spec.function.parameters.properties)) {
        expect(
          typeof (value as { type?: unknown }).type,
          `tool "${spec.function.name}" property "${key}" has no type`,
        ).toBe("string");
      }
    }
  });
});

describe("getPublicToolMetadata", () => {
  const meta = getPublicToolMetadata();

  it("never leaks the executor", () => {
    // `execute` is the server-side capability. If it ever reaches the client the
    // /tools page becomes an execution endpoint.
    for (const tool of meta) {
      expect(tool).not.toHaveProperty("execute");
    }
  });

  it("describes every registered tool", () => {
    expect(meta.length).toBe(getToolSpecs().length);
  });

  it("returns a boolean for requiresApproval", () => {
    for (const tool of meta) {
      expect(typeof tool.requiresApproval).toBe("boolean");
    }
  });

  it("keeps permissions honest: nothing is marked as auto-approved", () => {
    // Guards the §10 gap recorded in tasks.md: `requiresApproval` is declared
    // but NOT yet enforced by `executeTool`. Until Step 1 wires the Permission
    // Manager in, no tool may quietly claim to be gated.
    const claiming = meta.filter((t) => t.requiresApproval);
    expect(claiming).toEqual([]);
  });
});

describe("executeTool — dispatch", () => {
  it("rejects an unknown tool by name", async () => {
    await expect(executeTool("no_such_tool", "{}")).rejects.toThrow(/Unknown tool/i);
  });

  it("rejects malformed JSON arguments instead of guessing", async () => {
    await expect(executeTool("calculate", "{not json")).rejects.toThrow(/invalid JSON/i);
  });

  it("always resolves to a string", async () => {
    const result = await executeTool("get_time", "{}");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("tolerates empty arguments for a tool that takes none", async () => {
    await expect(executeTool("get_time", "")).resolves.toBeTypeOf("string");
  });
});

describe("calculate — argument sanitisation", () => {
  const calc = (expression: string) =>
    executeTool("calculate", JSON.stringify({ expression }));

  it("evaluates ordinary arithmetic", async () => {
    expect(await calc("2 + 2")).toBe("4");
    expect(await calc("(1984 * 3) / 2")).toBe("2976");
    expect(await calc("10 % 3")).toBe("1");
  });

  it("treats ^ as exponentiation", async () => {
    expect(await calc("2 ^ 3")).toBe("8");
    expect(await calc("2 ^ 3 ^ 2")).toBe("512");
  });

  it("never executes a JavaScript payload", async () => {
    // The security property, stated as "cannot execute" rather than "returns X":
    // `safeEvaluate` reduces input to [0-9+\-*/().%^] before evaluating, so
    // code payloads collapse into inert arithmetic. If this ever starts
    // succeeding with a side effect, this test is the tripwire.
    await expect(calc("process.exit(1)")).rejects.toThrow();
    await expect(calc("globalThis.process = undefined")).rejects.toThrow();
    await expect(calc("while(true){}")).rejects.toThrow();
    // Survives stripping as the inert expression `(1)`.
    expect(await calc("alert(1)")).toBe("1");
  });

  it("refuses an empty or unusable expression", async () => {
    await expect(calc("")).rejects.toThrow(/Empty expression/i);
    await expect(calc("abc")).rejects.toThrow(/Empty expression/i);
  });

  it("refuses a non-finite result rather than reporting Infinity", async () => {
    await expect(calc("1 / 0")).rejects.toThrow(/Uncomputable/i);
  });

  it("treats a missing expression as empty, not as a crash", async () => {
    await expect(executeTool("calculate", "{}")).rejects.toThrow(/Empty expression/i);
  });

  /**
   * KNOWN DEFECT (found by this suite; fix tracked in tasks.md Step 1).
   *
   * `safeEvaluate` guards empty input and non-finite *results*, but never checks
   * that the stripped source is parseable. Anything that survives the character
   * strip without being valid arithmetic reaches `new Function` and throws a raw
   * engine error, which escapes the tool layer and surfaces as a `tool_error`
   * event — i.e. "Unexpected token '.'" can reach the user and the voice.
   *
   * Asserted here so the current behaviour is pinned: when this is fixed, these
   * expectations flip from raw engine errors to /Uncomputable/i.
   */
  it("KNOWN DEFECT: unparseable input escapes as a raw engine error", async () => {
    for (const bad of ["process.exit(1)", "1)", "1.2.3", "()", "1+"]) {
      let caught: Error | null = null;
      try {
        await calc(bad);
      } catch (err) {
        caught = err as Error;
      }
      expect(caught, `"${bad}" should throw`).not.toBeNull();
      // Asserted on the constructor, not the message: a *raw engine* error is
      // exactly the defect. When fixed, this becomes /Uncomputable/i on message.
      expect(["SyntaxError", "TypeError"]).toContain(caught!.constructor.name);
    }
  });
});
