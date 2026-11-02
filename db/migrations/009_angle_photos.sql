-- Optional angle photographs. Front and wide remain required. Up to four angle
-- photographs may be added, so a visit has three to six photographs.
ALTER TABLE media_evidence DROP CONSTRAINT IF EXISTS media_evidence_kind_check;
ALTER TABLE media_evidence ADD CONSTRAINT media_evidence_kind_check CHECK (kind IN ('front','wide','angle_1','angle_2','angle_3','angle_4'));
