import React from "react";
import { cn } from "@/lib/utils";

// The brand mark is a photograph — a 3D copper-and-navy gear rendered on a
// blurred kitchen — not a flat vector with transparency. That has one practical
// consequence this component exists to handle: it needs a container with its
// own edge, or it reads as a stray image pasted onto the page. A round tile with
// a hairline border gives it one, and round is right because the mark is a gear.
//
// It is also how the mark survives the light theme without being re-rendered.
// The tile keeps its own night in both themes (`bg-mark`), so the photograph is
// never asked to sit on paper — on a light screen it reads as a stamped
// medallion, which is how a photographic mark is used in print anyway. What
// flips is only the hairline: white at 10% disappears against a light page, so
// the edge is a token.
export function LogoMark({ className, size = 36 }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "bg-mark ring-1 ring-mark-edge/20",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={size > 96 ? "/logo-512.jpg" : "/logo-192.png"}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
        // Decorative wherever it appears next to the wordmark; the accessible
        // name comes from the text beside it.
        aria-hidden="true"
      />
    </span>
  );
}

// The full lockup — mark plus "KITCHOPS · Restaurant Management Platform".
// Used where the brand is the subject (login, onboarding) rather than where it
// is chrome (the sidebar).
//
// Same problem as the mark, one size up: the JPEG's background is baked in, so
// on a light page a bare <img> reads as an image that failed to load its
// transparency. It gets a plate of its own night, with padding, so it reads as
// a printed panel instead — and the plate is the only thing that changes
// between themes, because in the dark theme it is nearly invisible.
export function LogoLockup({ className, width = 260 }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md bg-mark p-2 ring-1 ring-mark-edge/20",
        className,
      )}
    >
      <img
        src={width > 600 ? "/logo-lockup-1200.jpg" : "/logo-lockup-600.jpg"}
        alt="KitchOps"
        width={width}
        height={Math.round((width * 514) / 1200)}
        className="h-auto rounded-sm"
        style={{ width }}
      />
    </span>
  );
}

// Mark plus typeset wordmark. Preferred over the image lockup at small sizes:
// the lockup's own type is a photograph and goes soft under about 200px, while
// this stays crisp and picks up the app's display face.
export function LogoWordmark({ className, size = 32 }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className="font-display text-lg font-bold uppercase leading-none tracking-wide">
        <span className="text-copper">Kitch</span>
        <span className="text-chalk">Ops</span>
      </span>
    </span>
  );
}
