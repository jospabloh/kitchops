import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

// What a screen shows instead of its content when the read behind it failed.
// Never fall back to empty lists or default values: an empty dashboard says
// "todo en orden" and a default form saved on top overwrites real settings.
export default function LoadError({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-lg border border-rojo/30 bg-rojo/10 px-6 py-10 text-center">
      <AlertTriangle className="mb-3 h-6 w-6 text-rojo" aria-hidden="true" />
      <p className="max-w-md text-sm leading-relaxed text-chalk">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Reintentar
        </Button>
      )}
    </div>
  );
}
