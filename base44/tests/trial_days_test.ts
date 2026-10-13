// Pins the portfolio's 30-day trial (acacia-app-standard, Module 1).
// The trial length is a constant inside complete-onboarding/entry.ts, which
// imports npm:@base44/sdk and so cannot be loaded here; this reads the source
// instead, the same way the site's tests read HTML off disk. It also keeps the
// onboarding copy from drifting away from the constant.
//
//   deno test --allow-env --allow-read base44/tests/

import { assertEquals } from "./_assert.ts";

const entry = await Deno.readTextFile(
  new URL("../functions/complete-onboarding/entry.ts", import.meta.url),
);
const onboarding = await Deno.readTextFile(
  new URL("../../src/pages/Onboarding.jsx", import.meta.url),
);

Deno.test("complete-onboarding crea el negocio con 30 días de prueba", () => {
  const m = entry.match(/const TRIAL_DAYS = (\d+);/);
  assertEquals(m && Number(m[1]), 30);
});

Deno.test("la pantalla de onboarding anuncia los mismos 30 días", () => {
  assertEquals(/Empiezas con 30 días de prueba/.test(onboarding), true);
});
