import { z } from "zod";
export const RULE_VERSION = "ibvs-risk/1.0.0";
export const severityOrder = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type Severity = (typeof severityOrder)[number];
export type RiskSignal = {
  code: string;
  severity: Severity;
  ruleVersion: string;
  evidence: Record<string, unknown>;
  recommendedAction: "human_review" | "independent_review" | "resurvey";
  blocksApproval: boolean;
};
export type Candidate = {
  id: string;
  code: string;
  structure_code: string;
  orientation: string;
  latitude: number;
  longitude: number;
  distanceM: number;
  uncertainty_m: number;
};
export type PhotoFacts = {
  kind: string;
  mediaId: string;
  width: number;
  height: number;
  sha256: string;
  phash: string;
  mean: number;
  deviation: number;
  edgeEnergy: number;
  valid: boolean;
  integrity: boolean;
};
export type SpatialObservation = {
  kind: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  observedAt: string;
  distanceM: number;
};
export type RiskReport = {
  ruleVersion: string;
  assessmentHash: string;
  level: Severity;
  signals: RiskSignal[];
  requiresIndependentReview: boolean;
  blocksApproval: boolean;
  spatialEngine: "postgis" | "haversine_development";
  candidates: Candidate[];
  observations: SpatialObservation[];
  photos: PhotoFacts[];
};
export const ruleLabels: Record<string, { en: string; ar: string }> = {
  human_review_required: {
    en: "Human identity review required",
    ar: "يلزم تحقق بشري من الهوية",
  },
  integrity_failure: {
    en: "File integrity or decoding failure",
    ar: "فشل سلامة الملف أو فك الصورة",
  },
  task_binding_mismatch: {
    en: "Task and face binding mismatch",
    ar: "عدم تطابق المهمة والواجهة",
  },
  missing_evidence: {
    en: "Required photograph missing",
    ar: "صورة مطلوبة مفقودة",
  },
  exact_duplicate: {
    en: "Exact photo reused in another inspection",
    ar: "إعادة استخدام صورة مطابقة في معاينة أخرى",
  },
  cross_worker_duplicate: {
    en: "Exact photo also submitted by another worker",
    ar: "صورة مطابقة أرسلها موظف آخر",
  },
  perceptual_similarity: {
    en: "Visually similar photo candidate",
    ar: "صورة مرشحة لتشابه بصري",
  },
  neighboring_faces: {
    en: "Nearby faces require identity disambiguation",
    ar: "واجهات مجاورة تتطلب حسم الهوية",
  },
  gps_missing: {
    en: "GPS unavailable or denied",
    ar: "GPS غير متاح أو الإذن مرفوض",
  },
  gps_low_accuracy: { en: "Large GPS uncertainty", ar: "عدم دقة كبيرة في GPS" },
  gps_mismatch: {
    en: "Assigned point outside reported uncertainty",
    ar: "الموقع المكلّف خارج نطاق الدقة المبلغ عنه",
  },
  gps_stale: {
    en: "Stale GPS according to device clock",
    ar: "قراءة GPS قديمة حسب ساعة الجهاز",
  },
  capture_receipt_discrepancy: {
    en: "Delayed receipt or suspicious device time",
    ar: "استلام متأخر أو وقت جهاز مشتبه به",
  },
  offline_capture: {
    en: "Offline capture — device claim",
    ar: "التقاط دون اتصال — ادعاء الجهاز",
  },
  unchallenged_capture: {
    en: "Online without a valid challenge claim",
    ar: "متصل دون ادعاء تحدٍ صالح",
  },
  challenge_expired: {
    en: "Challenge expired before receipt",
    ar: "انتهت صلاحية التحدي قبل الاستلام",
  },
  online_challenged: {
    en: "Challenge supplied; capture is not attested",
    ar: "تحدٍ مقدم؛ أصالة الالتقاط غير مثبتة",
  },
  impossible_travel: {
    en: "Unusually high conservative travel speed",
    ar: "سرعة انتقال دنيا غير معتادة",
  },
  overlapping_inspections: {
    en: "Claimed capture intervals overlap at distant sites",
    ar: "تداخل أوقات الالتقاط المزعومة في مواقع متباعدة",
  },
  low_resolution: {
    en: "Resolution may limit identity review",
    ar: "قد تحد دقة الصورة من التحقق",
  },
  poor_quality: {
    en: "Low detail or exposure warning",
    ar: "تحذير نقص تفاصيل أو تعرض ضوئي",
  },
  analysis_scope_limited: {
    en: "Analysis scope reached its safety limit",
    ar: "بلغ التحليل حد النطاق الآمن",
  },
};
export function signal(
  code: string,
  severity: Severity,
  evidence: Record<string, unknown>,
  options: { blocksApproval?: boolean; independent?: boolean } = {},
): RiskSignal {
  return {
    code,
    severity,
    ruleVersion: RULE_VERSION,
    evidence,
    blocksApproval: !!options.blocksApproval,
    recommendedAction: options.blocksApproval
      ? "resurvey"
      : options.independent
        ? "independent_review"
        : "human_review",
  };
}
export function summarize(signals: RiskSignal[]) {
  const level = signals.reduce<Severity>(
    (max, s) =>
      severityOrder.indexOf(s.severity) > severityOrder.indexOf(max)
        ? s.severity
        : max,
    "info",
  );
  return {
    level,
    requiresIndependentReview: signals.some(
      (s) => s.recommendedAction === "independent_review",
    ),
    blocksApproval: signals.some((s) => s.blocksApproval),
  };
}
export function hamming(a: string, b: string) {
  if (!/^[a-f0-9]{16}$/.test(a) || !/^[a-f0-9]{16}$/.test(b)) return 64;
  let n = BigInt("0x" + a) ^ BigInt("0x" + b),
    count = 0;
  while (n) {
    count += Number(n & 1n);
    n >>= 1n;
  }
  return count;
}
export function travelSignal(
  distanceM: number,
  accuracyA: number,
  accuracyB: number,
  elapsedSeconds: number,
  overlapping: boolean,
) {
  const minimumDistanceM = Math.max(0, distanceM - accuracyA - accuracyB);
  if (overlapping && minimumDistanceM > 500)
    return signal(
      "overlapping_inspections",
      "high",
      { minimumDistanceM, elapsedSeconds, claim: "untrusted_device_intervals" },
      { independent: true },
    );
  if (elapsedSeconds > 0 && (minimumDistanceM / elapsedSeconds) * 3.6 > 160)
    return signal(
      "impossible_travel",
      "high",
      {
        minimumDistanceM,
        elapsedSeconds,
        minimumSpeedKmh: (minimumDistanceM / elapsedSeconds) * 3.6,
        thresholdKmh: 160,
        claim: "untrusted_device_time_and_gps",
      },
      { independent: true },
    );
  return null;
}
export const decisionInput = z
  .object({
    operationId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    assessmentHash: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.enum(["approve", "reject", "resurvey", "ambiguous"]),
    reason: z.string().trim().min(5).max(2000),
    identityConfirmed: z.boolean().default(false),
    riskAcknowledged: z.boolean().default(false),
    instructions: z.string().trim().max(2000).optional(),
    workerId: z.string().min(1).max(100).optional(),
    dueDate: z.iso.date().optional(),
  })
  .refine(
    (v) =>
      v.action !== "resurvey" ||
      (!!v.instructions && v.instructions.length >= 10 && !!v.dueDate),
    "Resurvey needs specific instructions and a due date",
  );
export type DecisionInput = z.infer<typeof decisionInput>;
export const baselineInput = z.object({
  operationId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  assessmentHash: z.string().regex(/^[a-f0-9]{64}$/),
  faceId: z.uuid(),
  identityConfirmed: z.literal(true),
  shape: z.string().trim().min(3).max(200),
  mounting: z.string().trim().min(3).max(300),
  numberOfFaces: z.number().int().min(1).max(16),
  facing: z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]),
  landmarks: z.string().trim().min(5).max(1000),
  reason: z.string().trim().min(5).max(2000),
});
export type BaselineInput = z.infer<typeof baselineInput>;
