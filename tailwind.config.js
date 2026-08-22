/** @type {import('tailwindcss').Config} */
module.exports = {
  // next-themes toggles the `dark` class on <html>; dark is the default and the
  // ground this app was designed on, light is for the desk in the morning. See
  // the header of src/index.css.
  //
  // Almost nothing in this codebase should need a `dark:` variant: every colour
  // is a CSS variable that both themes restate, so a screen written against the
  // tokens follows the theme for free. A `dark:` prefix here is a signal that
  // something is hardcoded that should not be.
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        // shadcn/ui contract
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },

        // KitchOps palette, sampled from the logo. Exposed by name so a screen
        // can reach for the brand directly (`text-copper`, `bg-navy`) instead of
        // routing everything through the generic shadcn slots — which is what
        // makes `border-l-2 border-copper` read as intent rather than accident.
        carbon: "hsl(var(--carbon))",
        steel: {
          DEFAULT: "hsl(var(--steel))",
          high: "hsl(var(--steel-high))",
        },
        copper: "hsl(var(--copper))",
        ember: "hsl(var(--ember))",
        navy: {
          DEFAULT: "hsl(var(--navy))",
          high: "hsl(var(--navy-high))",
        },
        chalk: "hsl(var(--chalk))",
        slate: {
          DEFAULT: "hsl(var(--slate))",
          dim: "hsl(var(--slate-dim))",
        },
        rojo: "hsl(var(--rojo))",
        amber: "hsl(var(--amber))",
        verde: "hsl(var(--verde))",
        // The brand mark is a photograph rendered on a dark kitchen, so it
        // carries its own ground into daylight rather than being re-lit — see
        // Logo.jsx. `mark` is that ground, identical in both themes; `mark-edge`
        // is the hairline that separates the tile from whatever is behind it,
        // and that one does flip.
        mark: {
          DEFAULT: "hsl(var(--mark))",
          edge: "hsl(var(--mark-edge))",
        },
        // Text that sits on a saturated navy / rojo fill. Those fills are dark
        // in both themes, so their text must NOT be --chalk (which flips to
        // dark ink in daylight and vanishes).
        "on-brand": "hsl(var(--on-brand))",
      },
      fontFamily: {
        heading: ["var(--font-heading)"],
        body: ["var(--font-body)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // The page-load reveal. One orchestrated moment, staggered by index,
        // rather than animation scattered across every element.
        "rise-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "rise-in": "rise-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
