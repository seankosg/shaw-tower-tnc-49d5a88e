-- 1. Add columns to defect_items
ALTER TABLE public.defect_items
  ADD COLUMN IF NOT EXISTS hdec_verification text,
  ADD COLUMN IF NOT EXISTS hdec_reason text;

ALTER TABLE public.defect_items
  DROP CONSTRAINT IF EXISTS defect_items_hdec_verification_check;
ALTER TABLE public.defect_items
  ADD CONSTRAINT defect_items_hdec_verification_check
  CHECK (hdec_verification IS NULL OR hdec_verification IN (
    'Cat A - Major Defect (Before SC)',
    'Cat B - Minor Defect',
    'Review Needed'
  ));

CREATE INDEX IF NOT EXISTS idx_defect_items_hdec_verification
  ON public.defect_items (hdec_verification);

-- 2. Rules table
CREATE TABLE IF NOT EXISTS public.defect_priority_verification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verdict text NOT NULL CHECK (verdict IN ('cat_a_major', 'review_needed', 'cat_b_minor')),
  step int NOT NULL CHECK (step IN (1,2,3)),
  order_no int NOT NULL,
  match_type text NOT NULL DEFAULT 'contains_any' CHECK (match_type IN ('contains_any','contains_all','regex')),
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclude_keywords jsonb,
  category text NOT NULL,
  explanation text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dpv_rules_step_order
  ON public.defect_priority_verification_rules (is_active, step, order_no);

ALTER TABLE public.defect_priority_verification_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read priority verification rules" ON public.defect_priority_verification_rules;
CREATE POLICY "Anyone can read priority verification rules"
  ON public.defect_priority_verification_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage priority verification rules" ON public.defect_priority_verification_rules;
CREATE POLICY "Admins can manage priority verification rules"
  ON public.defect_priority_verification_rules FOR ALL TO authenticated
  USING (is_admin_or_superuser(auth.uid()))
  WITH CHECK (is_admin_or_superuser(auth.uid()));

DROP TRIGGER IF EXISTS update_dpv_rules_updated_at ON public.defect_priority_verification_rules;
CREATE TRIGGER update_dpv_rules_updated_at
  BEFORE UPDATE ON public.defect_priority_verification_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Clear any pre-existing rules then seed
DELETE FROM public.defect_priority_verification_rules;

INSERT INTO public.defect_priority_verification_rules (verdict, step, order_no, match_type, keywords, exclude_keywords, category, explanation, is_active) VALUES
  ('cat_a_major', 1, 1, 'contains_any', '["height of handrail"]'::jsonb, NULL, 'Statutory Non-Compliance', 'Handrail height deviates from approved drawing; affects fall protection and BCA code compliance', true),
  ('cat_a_major', 1, 2, 'contains_any', '["bulging lift door","bulging  lift door"]'::jsonb, NULL, 'Lift Component Defect', 'Bulging lift door frame compromises structural integrity of lift car; subject to BCA statutory lift inspection failure', true),
  ('cat_a_major', 1, 3, 'contains_any', '["metal wire protruding"]'::jsonb, NULL, 'Safety Hazard', 'Protruding metal wire presents physical injury risk to building occupants or maintenance personnel', true),
  ('cat_a_major', 1, 4, 'contains_any', '["to replace the broken glass","broken glass"]'::jsonb, NULL, 'Safety Hazard', 'Broken glass requires replacement; broken glass in occupied area constitutes physical safety risk to building users', true),
  ('cat_a_major', 1, 5, 'contains_any', '["poor acoustic seals and fire stops"]'::jsonb, NULL, 'Fire Compartmentation + Acoustic', 'Poor acoustic seals and fire stops at wall penetrations; dual breach of acoustic spec and SCDF fire compartmentation', true),
  ('cat_a_major', 1, 6, 'contains_any', '["does not meet the acoustic","does not meet acoustic","acoustic door drop seal missing"]'::jsonb, NULL, 'Acoustic Non-Compliance', 'Specified acoustic requirement not met or acoustic door seal missing; constitutes specification and statutory compliance breach', true),
  ('cat_a_major', 1, 7, 'contains_any', '["fire stop to putty and seal up","fire stop to make good","seal up fire stopper","seal up fire wall penetration","fire wall to seal up","patch up fire wall penetration","missing fire stopping"]'::jsonb, NULL, 'Fire Compartmentation', 'Fire stop or fire wall penetration unsealed or incomplete; direct breach of fire compartmentation affecting SCDF compliance and TOP approval', true),
  ('cat_a_major', 1, 8, 'contains_any', '["seal up fire stop"]'::jsonb, NULL, 'Fire Compartmentation', 'Fire stop or fire wall penetration unsealed or incomplete; direct breach of fire compartmentation affecting SCDF compliance and TOP approval', true),
  ('cat_a_major', 1, 9, 'contains_any', '["insulation to fire damper"]'::jsonb, NULL, 'Fire / Life Safety System', 'Fire damper insulation incomplete; affects fire damper thermal performance and SCDF compliance', true),
  ('cat_a_major', 1, 10, 'contains_any', '["cable not terminated","cable to terminated","cable not terinated","cable not teminated","cable nont connected","incomplete cabling works","tidy up the cable and terminate properly"]'::jsonb, NULL, 'Electrical System Incomplete', 'Cable unterminated or cabling incomplete; electrical circuit cannot be commissioned or energised', true),
  ('cat_a_major', 1, 11, 'contains_any', '["water leakage through roof","leakage into l3 podium from facade","structural leakage from","water leakage at ahu room"]'::jsonb, NULL, 'Waterproofing Failure', 'Active water ingress through roof, facade, or structure; affects building integrity and occupation', true),
  ('cat_a_major', 1, 12, 'contains_any', '["leaking from toilet bowl"]'::jsonb, NULL, 'Plumbing Functional Defect', 'Leaking toilet bowl during flushing; active plumbing failure affecting sanitary system functionality', true),
  ('cat_a_major', 1, 13, 'contains_any', '["em lock and card access not working"]'::jsonb, NULL, 'Security System Failure', 'EM lock and card access system not functioning; building access control and fire egress fail-safe operation compromised', true),
  ('cat_a_major', 1, 14, 'contains_any', '["wc flushing system activated","wc flushing activated","sensor to rectify for wc flushing"]'::jsonb, NULL, 'Functional Defect – MEP', 'WC flushing sensor malfunction causing activation outside intended zone; requires recalibration', true),
  ('cat_a_major', 1, 15, 'contains_any', '["does not follow shd"]'::jsonb, NULL, 'Statutory Non-Compliance', 'Installation does not follow Shop Drawing (SHD); statutory and design compliance breach to be rectified', true),
  ('review_needed', 2, 1, 'contains_any', '["ducting acoustic seal"]'::jsonb, NULL, 'Review Needed – Acoustic / Fire', 'Ducting acoustic seal improperly installed; acoustic and fire compartmentation performance to be verified', true),
  ('review_needed', 2, 2, 'contains_any', '["acoustic seal","confirm this is acoustic door","meeting acoustic requirements"]'::jsonb, NULL, 'Review Needed – Acoustic', 'Acoustic seal or door performance requires on-site verification of specification compliance', true),
  ('review_needed', 2, 3, 'contains_any', '["assessibilty to","accessibility to pahu","accessibility to ahu","access to perform maintanai","access to ba able for maintenacee","unable to reach without overreaching"]'::jsonb, NULL, 'Review Needed – Safe Access', 'Safe access to critical MEP equipment requires assessment per WSH requirements', true),
  ('review_needed', 2, 4, 'contains_any', '["solar panel installation not at angle"]'::jsonb, NULL, 'Review Needed – Statutory Compliance', 'Solar panel installation angle requires confirmation against approved installation detail', true),
  ('review_needed', 2, 5, 'contains_any', '["no cut off drain provided"]'::jsonb, NULL, 'Review Needed – Statutory Compliance', 'Drainage element missing per AFC approved drawing; requires site confirmation', true),
  ('review_needed', 2, 6, 'contains_any', '["drain cover some not functioning","drain cover not able to press down","drain cover not functioning"]'::jsonb, NULL, 'Review Needed – Drainage', 'Drain cover not functioning; drainage system performance to be verified across affected locations', true),
  ('review_needed', 2, 7, 'contains_any', '["syphonic drain blocked"]'::jsonb, NULL, 'Review Needed – Drainage System', 'Syphonic drain blocked; CCTV survey required to confirm clear drainage; potential flooding risk', true),
  ('review_needed', 2, 8, 'contains_any', '["motion sensor not working","sensor not working"]'::jsonb, NULL, 'Review Needed – MEP System', 'Sensor not functioning; confirm whether safety-critical or convenience-only before classifying', true),
  ('review_needed', 2, 9, 'contains_any', '["sprinkler cover to install properly"]'::jsonb, NULL, 'Review Needed – Fire System', 'Sprinkler cover installation adequacy requires verification; improper installation may affect coverage pattern', true),
  ('review_needed', 2, 10, 'contains_any', '["facade glazing cracked"]'::jsonb, NULL, 'Review Needed – Facade Glass Safety', 'Cracked facade glazing requires structural assessment; safety risk and envelope integrity to be assessed', true),
  ('review_needed', 2, 11, 'contains_any', '["bowing glass"]'::jsonb, NULL, 'Review Needed – Facade Glass Safety', 'Bowing facade glass panels; structural adequacy and safety of installation to be assessed', true),
  ('review_needed', 2, 12, 'contains_any', '["exit light flickering"]'::jsonb, NULL, 'Review Needed – Life Safety Lighting', 'Exit light flickering; functional reliability of emergency exit signage to be verified', true),
  ('review_needed', 2, 13, 'contains_any', '["exit sign slanted"]'::jsonb, NULL, 'Review Needed – Life Safety Signage', 'Exit sign slanted; confirm visibility meets SCDF / BCA life safety requirements', true),
  ('review_needed', 2, 14, 'contains_any', '["sharp edges to rectify at the"]'::jsonb, NULL, 'Review Needed – Safety Hazard', 'Sharp edges present physical injury risk; extent and location to be assessed and mitigated', true),
  ('review_needed', 2, 15, 'contains_any', '["exposed pipes for mep services for publicly"]'::jsonb, NULL, 'Review Needed – Safety Hazard', 'Exposed MEP pipes in publicly accessible area; safety risk to building users to be assessed', true),
  ('review_needed', 2, 16, 'contains_any', '["mouldy partition board"]'::jsonb, NULL, 'Review Needed – Health / Material', 'Mould growth indicates potential moisture ingress; extent, cause, and health risk to be investigated', true),
  ('review_needed', 2, 17, 'contains_any', '["exposed steel support at mid stairs"]'::jsonb, NULL, 'Review Needed – Safety', 'Exposed and untreated steel support at staircase; fire protection and injury risk to be assessed', true),
  ('review_needed', 2, 18, 'contains_any', '["seal up fire stop and clean up"]'::jsonb, NULL, 'Review Needed – Fire Compartmentation', 'Fire stop sealing combined with cleaning scope; fire compartmentation adequacy to be confirmed on site', true),
  ('cat_b_minor', 3, 1, 'contains_any', '["hosereel","hose reel","hoserell"]'::jsonb, NULL, 'Minor – Fire Area Cleaning Only', 'Cleaning of hosereel, piping, and pipe sleeve; no fire system functional failure or compartmentation breach stated', true),
  ('cat_b_minor', 3, 2, 'contains_all', '["fire stop","clean"]'::jsonb, '["seal up","putty","make good"]'::jsonb, 'Minor – Fire Area Cleaning Only', 'Cleaning around fire stop area; no compartmentation breach stated', true),
  ('cat_b_minor', 3, 3, 'contains_all', '["fire stop","tidy"]'::jsonb, '["seal up","putty","make good"]'::jsonb, 'Minor – Fire Area Cleaning Only', 'Cleaning around fire stop area; no compartmentation breach stated', true),
  ('cat_b_minor', 3, 4, 'contains_all', '["fire stop","stain"]'::jsonb, '["seal up","putty","make good"]'::jsonb, 'Minor – Fire Area Cleaning Only', 'Cleaning around fire stop area; no compartmentation breach stated', true),
  ('cat_b_minor', 3, 5, 'contains_all', '["fire stop","dust"]'::jsonb, '["seal up","putty","make good"]'::jsonb, 'Minor – Fire Area Cleaning Only', 'Cleaning around fire stop area; no compartmentation breach stated', true),
  ('cat_b_minor', 3, 6, 'contains_any', '["ceiling board","ceiling tile","ceiling grid","ceiling alignment","ceiling sagg","damaged ceiling","stained ceiling"]'::jsonb, NULL, 'Minor – Ceiling Finish', 'Ceiling board/tile alignment, damage, or staining; no structural or fire system impact', true),
  ('cat_b_minor', 3, 7, 'contains_any', '["ceiling"]'::jsonb, NULL, 'Minor – Ceiling Finish', 'Ceiling element requiring make-good; no structural or fire system impact', true),
  ('cat_b_minor', 3, 8, 'contains_any', '["shadow gap","shaow gap"]'::jsonb, NULL, 'Minor – Shadow Gap Finish', 'Shadow gap inconsistent or incompletely painted; purely aesthetic item with no structural or functional impact', true),
  ('cat_b_minor', 3, 9, 'contains_any', '["remove putty","putty stain","putty to remove"]'::jsonb, NULL, 'Minor – Cleaning / Housekeeping', 'Construction putty residue requiring removal; no material defect', true),
  ('cat_b_minor', 3, 10, 'contains_any', '["repaint","uneven paint","peeled paint","coating peeled","bubbled"]'::jsonb, NULL, 'Minor – Paint / Stain', 'Paint surface deficiency requiring rectification; no structural or functional impact', true),
  ('cat_b_minor', 3, 11, 'contains_any', '["paint stain","remove stain","white stain","cement stain"]'::jsonb, NULL, 'Minor – Paint / Stain', 'Stain requiring removal or touch-up; no structural or functional impact', true),
  ('cat_b_minor', 3, 12, 'contains_any', '["clean up","to clean","tidy up","remove dust","dusty","remove debris","final cleaning"]'::jsonb, NULL, 'Minor – Cleaning / Housekeeping', 'Construction dust, residue, or debris removal; no material defect or system impact', true),
  ('cat_b_minor', 3, 13, 'contains_any', '["pointing dropped","uneven pointing","irregular pointing","inconsistent pointing","pointing to make good"]'::jsonb, NULL, 'Minor – Pointing / Jointing', 'Tile or stone pointing uneven or dropped; no structural or waterproofing failure', true),
  ('cat_b_minor', 3, 14, 'contains_any', '["scratch on mullion","damaged mullion","damaged aluminium mullion","silver adhesive tape"]'::jsonb, NULL, 'Minor – Facade / Mullion Cosmetic', 'Paint scratch or cosmetic damage to facade/mullion; no structural or waterproofing failure', true),
  ('cat_b_minor', 3, 15, 'contains_any', '["mullion","million"]'::jsonb, '["bowing"]'::jsonb, 'Minor – Facade / Mullion Finish', 'Facade mullion surface finish requiring make-good; no structural or waterproofing impact', true),
  ('cat_b_minor', 3, 16, 'contains_any', '["uneven sealant","irregular sealant","messy sealant","poor sealant","incomplete sealant","sealant works"]'::jsonb, NULL, 'Minor – Sealant Workmanship', 'Sealant finish irregular or incomplete in non-waterproofing context; cosmetic workmanship item', true),
  ('cat_b_minor', 3, 17, 'contains_any', '["sealant"]'::jsonb, NULL, 'Minor – Sealant Workmanship', 'Sealant application requiring rectification; no confirmed waterproofing failure', true),
  ('cat_b_minor', 3, 18, 'contains_any', '["seal up"]'::jsonb, '["fire"]'::jsonb, 'Minor – Gap / Joint Sealing', 'Non-fire-related gap requiring sealing and painting; cosmetic finishing item', true),
  ('cat_b_minor', 3, 19, 'contains_all', '["sprinkler","stain"]'::jsonb, NULL, 'Minor – Sprinkler Cover Finish', 'Sprinkler cover finish requiring cleaning or gap adjustment; no sprinkler system functional failure', true),
  ('cat_b_minor', 3, 20, 'contains_all', '["sprinkler","cover"]'::jsonb, NULL, 'Minor – Sprinkler Cover Finish', 'Sprinkler cover finish requiring cleaning or gap adjustment; no sprinkler system functional failure', true),
  ('cat_b_minor', 3, 21, 'contains_all', '["sprinkler","clean"]'::jsonb, NULL, 'Minor – Sprinkler Cover Finish', 'Sprinkler cover finish requiring cleaning or gap adjustment; no sprinkler system functional failure', true),
  ('cat_b_minor', 3, 22, 'contains_all', '["sprinkler","gap"]'::jsonb, NULL, 'Minor – Sprinkler Cover Finish', 'Sprinkler cover finish requiring cleaning or gap adjustment; no sprinkler system functional failure', true),
  ('cat_b_minor', 3, 23, 'contains_all', '["sprinkler","putty"]'::jsonb, NULL, 'Minor – Sprinkler Cover Finish', 'Sprinkler cover finish requiring cleaning or gap adjustment; no sprinkler system functional failure', true),
  ('cat_b_minor', 3, 24, 'contains_any', '["baffing","baffling","buffing","buffling"]'::jsonb, NULL, 'Minor – Floor Finish', 'Marble/stone floor buffing or polishing required; no structural or waterproofing impact', true),
  ('cat_b_minor', 3, 25, 'contains_any', '["stone floor","floor stone","chipped marble","marble chip","inlay"]'::jsonb, NULL, 'Minor – Floor Finish', 'Stone/marble floor surface condition requiring attention; no structural impact', true),
  ('cat_b_minor', 3, 26, 'contains_any', '["tile","grouting","grout","tiling"]'::jsonb, NULL, 'Minor – Tile / Grouting', 'Tile alignment, damage, or grouting deficiency; no structural or waterproofing failure', true),
  ('cat_b_minor', 3, 27, 'contains_any', '["access panel","access apnel","ap to provide","ap to rectify"]'::jsonb, NULL, 'Minor – Access Panel Finish', 'Access panel finish or gap tolerance requiring adjustment; no functional or fire-rated system impact', true),
  ('cat_b_minor', 3, 28, 'contains_any', '["lift call button","call button"]'::jsonb, NULL, 'Minor – Lift Lobby Finish', 'Lift call button alignment requiring adjustment; no lift system functional impact', true),
  ('cat_b_minor', 3, 29, 'contains_any', '["lift transom"]'::jsonb, NULL, 'Minor – Lift Lobby Finish', 'Lift lobby panel or transom damage requiring replacement; no lift system or safety impact', true),
  ('cat_b_minor', 3, 30, 'contains_all', '["lift","dent"]'::jsonb, NULL, 'Minor – Lift Lobby Finish', 'Lift lobby panel or transom damage requiring replacement; no lift system or safety impact', true),
  ('cat_b_minor', 3, 31, 'contains_all', '["lift","jam"]'::jsonb, NULL, 'Minor – Lift Lobby Finish', 'Lift lobby or door surround finish requiring adjustment; no lift system or safety impact', true),
  ('cat_b_minor', 3, 32, 'contains_all', '["lift","jumb"]'::jsonb, NULL, 'Minor – Lift Lobby Finish', 'Lift lobby or door surround finish requiring adjustment; no lift system or safety impact', true),
  ('cat_b_minor', 3, 33, 'contains_all', '["lift","gap"]'::jsonb, NULL, 'Minor – Lift Lobby Finish', 'Lift lobby or door surround finish requiring adjustment; no lift system or safety impact', true),
  ('cat_b_minor', 3, 34, 'contains_all', '["lift","clean"]'::jsonb, NULL, 'Minor – Lift Lobby Finish', 'Lift lobby or door surround finish requiring adjustment; no lift system or safety impact', true),
  ('cat_b_minor', 3, 35, 'contains_all', '["lift","align"]'::jsonb, NULL, 'Minor – Lift Lobby Finish', 'Lift lobby or door surround finish requiring adjustment; no lift system or safety impact', true),
  ('cat_b_minor', 3, 36, 'contains_all', '["lift","exposed"]'::jsonb, NULL, 'Minor – Lift Lobby Finish', 'Lift lobby or door surround finish requiring adjustment; no lift system or safety impact', true),
  ('cat_b_minor', 3, 37, 'contains_any', '["door frame","door gap","door jamb","door jam","door stopper"]'::jsonb, NULL, 'Minor – Door / Frame Alignment', 'Door frame alignment or gap requiring adjustment; no fire-rated integrity or functional impact', true),
  ('cat_b_minor', 3, 38, 'contains_all', '["door","align"]'::jsonb, NULL, 'Minor – Door Alignment / Finish', 'Door or surround finish requiring make-good; no fire rating or functional impact', true),
  ('cat_b_minor', 3, 39, 'contains_all', '["door","misalign"]'::jsonb, NULL, 'Minor – Door Alignment / Finish', 'Door or surround finish requiring make-good; no fire rating or functional impact', true),
  ('cat_b_minor', 3, 40, 'contains_all', '["door","irregular"]'::jsonb, NULL, 'Minor – Door Alignment / Finish', 'Door or surround finish requiring make-good; no fire rating or functional impact', true),
  ('cat_b_minor', 3, 41, 'contains_all', '["door","make good"]'::jsonb, NULL, 'Minor – Door Alignment / Finish', 'Door or surround finish requiring make-good; no fire rating or functional impact', true),
  ('cat_b_minor', 3, 42, 'contains_all', '["door","termination"]'::jsonb, NULL, 'Minor – Door Alignment / Finish', 'Door or surround finish requiring make-good; no fire rating or functional impact', true),
  ('cat_b_minor', 3, 43, 'contains_any', '["speaker","intercom"]'::jsonb, NULL, 'Minor – MEP Finishing', 'Speaker or intercom panel alignment or quality requiring rectification; no emergency communication system failure stated', true),
  ('cat_b_minor', 3, 44, 'contains_any', '["messy cable","cable management"]'::jsonb, NULL, 'Minor – MEP Finishing', 'Cable management or dressing required; no system functional or safety impact', true),
  ('cat_b_minor', 3, 45, 'contains_all', '["cable","tidy"]'::jsonb, NULL, 'Minor – MEP Finishing', 'Cable management or dressing required; no system functional or safety impact', true),
  ('cat_b_minor', 3, 46, 'contains_any', '["led strip","led light","lighting strip","led mirror","lighting align","light flush","lighting not flush"]'::jsonb, NULL, 'Minor – Lighting Finish', 'LED or lighting strip alignment or installation quality; no emergency lighting system failure', true),
  ('cat_b_minor', 3, 47, 'contains_any', '["label","labelling","labeling"]'::jsonb, '["fire alarm"]'::jsonb, 'Minor – MEP Finishing', 'Label provision or repositioning required; no system functional impact', true),
  ('cat_b_minor', 3, 48, 'contains_any', '["signage"]'::jsonb, NULL, 'Minor – Signage / Wayfinding Finish', 'Signage surface finish requiring make-good; no safety-critical wayfinding function impaired', true),
  ('cat_b_minor', 3, 49, 'contains_any', '["grill","grille"]'::jsonb, NULL, 'Minor – MEP Finishing', 'ACMV grill alignment or installation quality requiring adjustment; no ACMV functional impact', true),
  ('cat_b_minor', 3, 50, 'contains_any', '["services alignment","service alignment","services not align","make good termination around services","edges around services","services gap","make good services"]'::jsonb, NULL, 'Minor – MEP Services Finishing', 'MEP services alignment, edge finish, or gap consistency; no functional system impact', true),
  ('cat_b_minor', 3, 51, 'contains_any', '["acb"]'::jsonb, NULL, 'Minor – MEP Finishing', 'Active Chilled Beam (ACB) installation alignment or finish; no ACMV functional impact', true),
  ('cat_b_minor', 3, 52, 'contains_any', '["uneven wall","wall not straight","plaster","plastering","exposed cement","bare cement","raw rc","raw finish"]'::jsonb, NULL, 'Minor – Wall Finish', 'Wall surface irregularity or exposed substrate requiring finishing; no structural impact', true),
  ('cat_b_minor', 3, 53, 'contains_all', '["wall","make good"]'::jsonb, NULL, 'Minor – Wall Finish', 'Wall surface finish or termination requiring make-good; no structural impact', true),
  ('cat_b_minor', 3, 54, 'contains_all', '["wall","uneven"]'::jsonb, NULL, 'Minor – Wall Finish', 'Wall surface finish or termination requiring make-good; no structural impact', true),
  ('cat_b_minor', 3, 55, 'contains_all', '["wall","inconsistent"]'::jsonb, NULL, 'Minor – Wall Finish', 'Wall surface finish or termination requiring make-good; no structural impact', true),
  ('cat_b_minor', 3, 56, 'contains_all', '["wall","messy"]'::jsonb, NULL, 'Minor – Wall Finish', 'Wall surface finish or termination requiring make-good; no structural impact', true),
  ('cat_b_minor', 3, 57, 'contains_all', '["wall","termination"]'::jsonb, NULL, 'Minor – Wall Finish', 'Wall surface finish or termination requiring make-good; no structural impact', true),
  ('cat_b_minor', 3, 58, 'contains_all', '["wall","edge"]'::jsonb, NULL, 'Minor – Wall Finish', 'Wall surface finish or termination requiring make-good; no structural impact', true),
  ('cat_b_minor', 3, 59, 'contains_any', '["pelmet"]'::jsonb, NULL, 'Minor – Wall / Pelmet Finish', 'Pelmet surface finish or joint requiring make-good; no structural or functional impact', true),
  ('cat_b_minor', 3, 60, 'contains_any', '["entrance portal","along the entrance","finishes along the entrance"]'::jsonb, NULL, 'Minor – Entrance / Portal Finish', 'Entrance portal surface finish uneven or inconsistent; cosmetic workmanship item', true),
  ('cat_b_minor', 3, 61, 'contains_any', '["skirting"]'::jsonb, NULL, 'Minor – Wall Finish', 'Skirting alignment, termination, or surface condition; no structural or waterproofing impact', true),
  ('cat_b_minor', 3, 62, 'contains_any', '["raised floor","rasied floor","floor screed","screed"]'::jsonb, NULL, 'Minor – Raised Floor / Screed', 'Raised floor or screed level, termination, or condition; no structural impact', true),
  ('cat_b_minor', 3, 63, 'contains_any', '["floor trap","floor edge","around floor trap"]'::jsonb, NULL, 'Minor – Floor Finish', 'Floor trap edge or surround finish requiring make-good; no drainage function impact', true),
  ('cat_b_minor', 3, 64, 'contains_any', '["bollard","soil infill","sliding gate"]'::jsonb, NULL, 'Minor – External Works Finish', 'External element alignment or finish requiring adjustment; no structural or statutory impact', true),
  ('cat_b_minor', 3, 65, 'contains_any', '["bidet","shower head","tap off unit","tap to install"]'::jsonb, NULL, 'Minor – Sanitary Fitout', 'Sanitary fitting or tap installation incomplete or requiring make-good; no active plumbing leak stated', true),
  ('cat_b_minor', 3, 66, 'contains_any', '["riser","catwalk"]'::jsonb, NULL, 'Minor – Riser / Catwalk Finish', 'Surface finish or cleaning in non-public riser or catwalk; no functional or statutory impact', true),
  ('cat_b_minor', 3, 67, 'contains_any', '["cladding"]'::jsonb, NULL, 'Minor – Cladding Finish', 'Cladding alignment or surface finish requiring adjustment; no structural or waterproofing failure stated', true),
  ('cat_b_minor', 3, 68, 'contains_any', '["missing tissue","tissue holder","urinal sensor"]'::jsonb, NULL, 'Minor – Incomplete Fitout', 'Non-safety-critical sanitary fitout item missing; no safety or statutory impact', true),
  ('cat_b_minor', 3, 69, 'contains_any', '["missing"]'::jsonb, '["fire","acoustic"]'::jsonb, 'Minor – Incomplete Fitout', 'Non-safety-critical item missing; no safety or statutory impact', true),
  ('cat_b_minor', 3, 70, 'contains_any', '["mimic panel","temporary map","guard tour"]'::jsonb, NULL, 'Minor – O&M Documentation', 'Temporary drawing or operational record requires update; no building defect or system failure', true),
  ('cat_b_minor', 3, 71, 'contains_any', '["rockwool","substrate"]'::jsonb, NULL, 'Minor – Exposed Material', 'Exposed insulation or substrate in public space; aesthetic item requiring cover-up', true),
  ('cat_b_minor', 3, 72, 'contains_any', '["poor installation"]'::jsonb, NULL, 'Minor – Workmanship', 'General poor installation quality requiring rectification; no safety, statutory, or functional system impact stated', true),
  ('cat_b_minor', 3, 73, 'contains_any', '["pipe sleeve","pipe penetration"]'::jsonb, '["fire"]'::jsonb, 'Minor – MEP Finishing', 'Pipe sleeve or penetration seal finish requiring make-good; no fire stopping impact stated', true),
  ('cat_b_minor', 3, 74, 'contains_any', '["chipped glass","glass edge"]'::jsonb, '["broken","bowing","crack"]'::jsonb, 'Minor – Glass / Glazing Finish', 'Glass edge or surrounding finish requiring rectification; no structural or safety failure', true),
  ('cat_b_minor', 3, 75, 'contains_any', '["wrong colour","wrong color","different color","air terminal black"]'::jsonb, NULL, 'Minor – Specification Compliance (Cosmetic)', 'Component colour does not match specification; cosmetic compliance item requiring replacement', true),
  ('cat_b_minor', 3, 76, 'contains_any', '["carpet"]'::jsonb, NULL, 'Minor – Floor Finish', 'Carpet termination or condition requiring attention; no structural or safety impact', true),
  ('cat_b_minor', 3, 77, 'contains_any', '["toilet bowl slanted"]'::jsonb, '["leak"]'::jsonb, 'Minor – Sanitary Fitout', 'Toilet bowl installation slanted; alignment rectification required; no active leakage', true),
  ('cat_b_minor', 3, 78, 'contains_any', '[]'::jsonb, NULL, 'Minor – General Workmanship', 'Surface or finishing deficiency requiring make-good; no structural, fire safety, statutory, or major functional impact demonstrated by description', true)
;

INSERT INTO public.defect_field_config (field_name, display_name, source_origin, is_enabled, is_required, sort_order)
VALUES
  ('hdec_verification', 'HDEC''s Verification', 'system', true, false, 220),
  ('hdec_reason', 'HDEC''s Reason', 'system', true, false, 221)
ON CONFLICT (field_name) DO NOTHING;

INSERT INTO public.import_header_mappings (module, header_alias, target_field, is_system, is_active)
SELECT v.module, v.header_alias, v.target_field, true, true
FROM (VALUES
  ('defect','hdec''s verification','hdec_verification'),
  ('defect','hdec verification','hdec_verification'),
  ('defect','verification','hdec_verification'),
  ('defect','hdec''s reason','hdec_reason'),
  ('defect','hdec reason','hdec_reason'),
  ('defect','reason of assessment','hdec_reason')
) AS v(module, header_alias, target_field)
WHERE NOT EXISTS (
  SELECT 1 FROM public.import_header_mappings m
  WHERE m.module = v.module AND m.header_alias = v.header_alias AND m.target_field = v.target_field
);