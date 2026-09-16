import { createContext } from "react";
import type { FormState } from "@/lib/api-types";

export interface BoundaryDetailTarget {
  epochId: string;
  attempt: number;
  step: string;
}

export interface BoundaryDetailContextValue {
  form: FormState;
  runId: string;
  epochId: string;
  attempt: number;
  openDetail: (target: BoundaryDetailTarget) => void;
}

export const BoundaryDetailContext = createContext<BoundaryDetailContextValue | null>(null);
