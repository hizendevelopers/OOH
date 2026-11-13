"use client";
import { Check } from "lucide-react";
import type { FieldText } from "./strings";

export type VisitStep = "photos" | "brand" | "send";
export const visitSteps: VisitStep[] = ["photos", "brand", "send"];

// The three steps of a visit. Each step can be opened directly; a tick marks a finished step.
export default function VisitSteps({
  step,
  onStep,
  done,
  t,
}: {
  step: VisitStep;
  onStep: (step: VisitStep) => void;
  done: Record<VisitStep, boolean>;
  t: FieldText;
}) {
  const label = { photos: t.stepPhotos, brand: t.stepBrand, send: t.stepSend };
  return (
    <nav className="visit-steps" aria-label={t.steps}>
      <ol>
        {visitSteps.map((s, i) => (
          <li key={s}>
            <button
              className={step === s ? "active" : ""}
              aria-current={step === s ? "step" : undefined}
              onClick={() => onStep(s)}
            >
              <span className="visit-step-number" aria-hidden="true">
                {done[s] ? <Check size={14} /> : i + 1}
              </span>
              {label[s]}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
