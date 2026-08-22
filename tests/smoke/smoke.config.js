// Per-app half of the shared smoke suite. smoke.spec.js next to this file is
// byte-identical across the portfolio — the canonical copy lives in
// `jospabloh/acacia-app-standard` → `shared/smoke/`. Change it there and copy
// it out; everything specific to this app belongs here instead.
export default {
  name: 'KitchOps',
  url: 'https://kitchops.acaciaco.com.mx',

  // Verbatim from this repo's index.html — proves the deploy served THIS app
  // and not a stale or unrelated one.
  title: /KitchOps/,

  // Public routes the corner-collision check visits, on top of the home page
  // (which redirects to /login for a signed-out visitor). These three carry
  // different chrome from each other; anything behind the login is not reachable
  // from this suite and needs a look by hand — see Module 12.
  routes: ['./', './register', './forgot-password'],

  theme: {
    // `.dark` on <html>, toggled by next-themes. This app declined a second
    // theme until 2026-08-22 and the suite asserted the switcher's absence;
    // it now has a real light palette, so it is checked like every other app.
    // Dark is still the default for anyone who has not chosen.
    kind: 'class',
    root: '[data-theme-switcher]',
  },
};
