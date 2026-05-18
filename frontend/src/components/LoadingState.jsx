import React from "react";
import { Loader2 } from "lucide-react";

export default function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <Loader2 className="w-12 h-12 text-brand-orange animate-spin" />
      <div className="text-center">
        <p className="font-medium text-gray-800">Analyzing your photo…</p>
        <p className="text-sm text-gray-500 mt-1">
          Identifying make, model, and specs…
        </p>
      </div>
    </div>
  );
}
