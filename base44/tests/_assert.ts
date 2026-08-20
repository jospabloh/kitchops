// Assertions, hand-rolled.
//
// Deliberately not jsr:@std/assert. These tests cover the permission resolver
// and the webhook's signature check — the two things you most want to be able
// to run anywhere, including in a CI job with no network egress and on a
// machine that has never fetched a Deno dependency. A remote import means those
// tests are one registry outage away from being skipped, and a skipped
// permission test is worse than no permission test, because the build still
// goes green.
//
// The whole surface needed by base44/tests/ is four functions.

export function assert(condition: unknown, msg = "se esperaba un valor verdadero"): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

export function assertFalse(condition: unknown, msg = "se esperaba un valor falso"): void {
  if (condition) throw new Error(`Assertion failed: ${msg}`);
}

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (!deepEqual(actual, expected)) {
    throw new Error(
      `Assertion failed${msg ? `: ${msg}` : ""}\n` +
        `  esperado: ${format(expected)}\n` +
        `  recibido: ${format(actual)}`,
    );
  }
}

export function assertThrows(fn: () => unknown, msg = "se esperaba una excepción"): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`Assertion failed: ${msg}`);
}

function format(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Structural equality, enough for the plain data these tests compare. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}
