# Cost engineering

M1 uses one Next.js process and PostgreSQL; local development has no external subscription. No cloud service, paid tile plan, storage bucket or AI service has been purchased. A single host plus backed-up database is the initial architecture; choose provider/region after latency and recovery requirements are known.

Planning envelope (internal budget assumptions, **not provider quotes**): application/DB hosting USD 25–80/month, encrypted backups USD 5–15/month, licensed tiles USD 0–30/month depending on plan, evidence storage/requests/egress separately metered. Procurement must verify current quotes and contractual terms. No pricing is claimed as researched or guaranteed.

Storage model: 1000 monthly inspections × 3 photos × 2MB ≈6GB new originals/month (decimal units). At 180-day retention ≈36GB steady originals before derivatives/backups; allow an initial 20% thumbnail/metadata overhead and measure the actual distribution before setting quotas. Monthly bill = GB-month × storage rate + upload/download requests + egress + processing + backups. No AI cost in M1.

Measure bytes accepted, original/derivative volume, storage age, failed/retried upload bytes, review downloads, map sessions, DB latency and queued-job lag. Set provider budget alerts at 50/80/100% of an approved budget; these alerts are not provisioned yet. Consider a separate worker at persistent processing lag >5 minutes, DB upgrade at sustained resource pressure, and a shared rate limiter before horizontal web scaling. Do not scale the embedded development engine.
