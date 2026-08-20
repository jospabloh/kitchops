import React from "react";
import { cn } from "@/lib/utils";

// The brand mark is a photograph — a 3D copper-and-navy gear rendered on a
// blurred kitchen — not a flat vector with transparency. That has one practical
// consequence this component exists to handle: it needs a container with its
// own edge, or it reads as a stray image pasted onto the page. A round tile with
// a hairline border gives it one, and round is right because the mark is a gear.
export function LogoMark({ className, size = 36 }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "ring-1 ring-white/10 bg-carbon",
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
export function LogoLockup({ className, width = 260 }) {
  return (
    <img
      src={width > 600 ? "/logo-lockup-1200.jpg" : "/logo-lockup-600.jpg"}
      alt="KitchOps"
      width={width}
      height={Math.round((width * 514) / 1200)}
      className={cn("h-auto rounded-md", className)}
      style={{ width }}
    />
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
