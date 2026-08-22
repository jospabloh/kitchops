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

  theme: {
    // This app ships one theme on purpose (see CLAUDE.md); the suite
    //         asserts the switcher's ABSENCE instead of its behaviour.
    kind: 'none',
    root: '[data-theme-switcher]',
  },
};
