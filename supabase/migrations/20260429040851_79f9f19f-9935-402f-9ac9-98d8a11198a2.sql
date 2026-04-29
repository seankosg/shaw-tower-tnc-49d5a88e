
-- Phase A: Defect classification v2 lookup tables

-- 1) Subcontractor workscope dictionary
CREATE TABLE public.defect_subcontractor_workscope (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL UNIQUE,
  full_name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  match_priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.defect_subcontractor_workscope ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read defect workscopes"
  ON public.defect_subcontractor_workscope FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage defect workscopes"
  ON public.defect_subcontractor_workscope FOR ALL TO authenticated
  USING (is_admin_or_superuser(auth.uid()))
  WITH CHECK (is_admin_or_superuser(auth.uid()));

CREATE TRIGGER update_defect_subcontractor_workscope_updated_at
  BEFORE UPDATE ON public.defect_subcontractor_workscope
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Work Type dictionary (36 items)
CREATE TABLE public.defect_work_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  trade text NOT NULL,
  sub_match text[] NOT NULL DEFAULT '{}',
  desc_keywords text[] NOT NULL DEFAULT '{}',
  default_main_trade text,
  default_sub_trade text,
  match_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.defect_work_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read defect work types"
  ON public.defect_work_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage defect work types"
  ON public.defect_work_types FOR ALL TO authenticated
  USING (is_admin_or_superuser(auth.uid()))
  WITH CHECK (is_admin_or_superuser(auth.uid()));

CREATE TRIGGER update_defect_work_types_updated_at
  BEFORE UPDATE ON public.defect_work_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_defect_work_types_match_order ON public.defect_work_types (match_order) WHERE is_active = true;

-- 3) Label alias dictionary
CREATE TABLE public.defect_classification_alias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_label text NOT NULL UNIQUE,
  canonical_label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.defect_classification_alias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read defect aliases"
  ON public.defect_classification_alias FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage defect aliases"
  ON public.defect_classification_alias FOR ALL TO authenticated
  USING (is_admin_or_superuser(auth.uid()))
  WITH CHECK (is_admin_or_superuser(auth.uid()));

CREATE TRIGGER update_defect_classification_alias_updated_at
  BEFORE UPDATE ON public.defect_classification_alias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SEED DATA
-- ============================================================

-- Subcontractor workscope (20 labels)
INSERT INTO public.defect_subcontractor_workscope (label, full_name, keywords, match_priority) VALUES
  ('Mero',      'Mero Asia Pacific',  ARRAY['facade','pelmet','mullion','mullian','transom','cladding','curtain wall','glazing','external panel','weep','spandrel'], 10),
  ('SYS',       'Siong Yu Seng',      ARRAY['tile','grout','pointing','stone','plaster','skim coat','screed','wet area'], 20),
  ('GRB',       'GRB',                ARRAY['paint','repaint','touch up','touch-up','paint stain','paint mark','make good and paint','make good of wall and paint','fully painted','messy paint','uneven paint','incomplete paint'], 20),
  ('Finebuild', 'Finebuild',          ARRAY['ceiling board','ceiling panel','drywall','plasterboard','dirty ceiling','damaged ceiling','ceiling stain','make good ceiling','uneven ceiling','ceiling align'], 20),
  ('KKC',       'Kurihara',           ARRAY['vav','pibcv','acb','diffuser','grille','grill','duct','damper','iaq sensor','chilled water','aircon','thermostat'], 20),
  ('Puretech',  'Puretech',           ARRAY['cable','cabling','wiring','trunking','conduit','tray','sld','switchboard','db ','distribution board','ko box','lighting','light strip','luminaire','speaker','fibre','fiber','em lock','card reader','card access','cctv','panic button','exit sign','emergency'], 30),
  ('ASK',       'ASK M&E',            ARRAY['bidet','wc','urinal','basin','tap','faucet','flushing','shower head','tissue holder','sanitary'], 20),
  ('Rico',      'Rico',               ARRAY['sprinkler','fire alarm','mimic panel','hose reel','hosereel','fire stop','firestop','fire door','fire shutter','fire fighter','fire curtain','fire extinguisher','fire rated'], 15),
  ('Schindler', 'Schindler',          ARRAY['lift call button','lift door','lift jamb','lift cabin','passenger lift','lift hardware'], 15),
  ('ACU',       'ACU',                ARRAY['bronze metal','mirror cabinet','lift lobby ceiling','wall stone in lobby','metal trim','entrance portal','vanity mirror','metal inlay','glass modesty'], 25),
  ('Microtac',  'Microtac Systems',   ARRAY['raised floor','floor panel','access floor'], 15),
  ('Suntech',   'Suntech',            ARRAY['metal door','door stopper','door not functioning','door closer','door hardware','ironmongery'], 25),
  ('Tat Seng',  'Tat Seng',           ARRAY['catwalk','railing','handrail','balustrade'], 30),
  ('Octopus',   'Octopus',            ARRAY['signage','sign '], 30),
  ('Geze',      'GEZE',               ARRAY['glass sliding door','automatic door','geze'], 15),
  ('Ecoplus',   'Ecoplus',            ARRAY['toilet cubicle','cubicle'], 30),
  ('Acemech',   'Acemech',            ARRAY['firestop sealing','penetration seal'], 35),
  ('Maxbond',   'Maxbond',            ARRAY['waterproofing','water proofing'], 25),
  ('Rigel',     'Rigel Tech',         ARRAY['sanitary ware supply'], 60),
  ('HDEC',      'Hyundai E&C',        ARRAY['clean','dust','tidy up','remove debris','protection sheet','rubbish'], 90);

-- Label aliases (typos, Highzone, slash variants)
INSERT INTO public.defect_classification_alias (raw_label, canonical_label) VALUES
  ('Puretch',         'Puretech'),
  ('Finbuild',        'Finebuild'),
  ('KURIHARA',        'KKC'),
  ('Kurihara',        'KKC'),
  ('Highzone Mero',   'Mero'),
  ('Highzone ACU',    'ACU'),
  ('RICO',            'Rico'),
  ('GEZE',            'Geze'),
  ('TAT SENG',        'Tat Seng'),
  ('Duplicate Defect','Duplicate'),
  ('Design',          ''),
  ('Design / Mero',   'Mero'),
  ('Perforated tray cover not required', ''),
  ('Installation as per design',         '');

-- Work Types (36 items, ordered by match_order = WT-01..WT-36)
INSERT INTO public.defect_work_types (name, trade, sub_match, desc_keywords, default_main_trade, default_sub_trade, match_order) VALUES
  -- Critical
  ('Fire Stopping/Sealing Installation', 'Fire Protection', ARRAY['Firestop'],                                  ARRAY['fire stop','firestop','fire rated'],                                                                                            'Fire Stopping','Installation', 1),
  ('Fire Equipment Install/Replace',     'Fire Protection', ARRAY['Sprinkler','Hose Reel','Fire Alarm'],         ARRAY['sprinkler','hose reel','hosereel','extinguisher','missing fe','fire alarm','mimic'],                                            'Fire Protection','Equipment Install', 2),
  ('Water Leak/Drainage Repair',         'Plumbing',        ARRAY[]::text[],                                     ARRAY['leak','water ingress','water leak','flood','tripping hazard'],                                                                  'Plumbing','Leak Repair', 3),
  ('Penetration/Opening Sealing',        'Architectural',   ARRAY[]::text[],                                     ARRAY['open penetration','opening soffit','opening wall','penetration open'],                                                          'Sealant/Joint','Penetration Sealing', 4),
  -- High
  ('Damaged Finish Replace (Tile/Board/Panel)', 'Architectural', ARRAY[]::text[],                                ARRAY['damaged replace','tile damage replace','broken stone','broken tile','cracked plaster','cracked tile','cracked board','tonality issue'], 'Wall Finish','Damage Replace', 5),
  ('Facade Material Replace (Glass/Panel)',     'Facade',        ARRAY['Glass/Window'],                          ARRAY['damaged facade glass','replace glass','replace panel','works rejected','not in accordance with shop drawing'],                  'Glass/Window','Material Replace', 6),
  ('Sanitary Ware Install (Bidet/Tap/Holder)',  'Plumbing',      ARRAY['Sanitaryware'],                          ARRAY['missing bidet','missing tap','missing tissue','missing shower'],                                                                'Sanitaryware','Install', 7),
  ('Electrical Accessory Install (Junction Box/Faceplate/Switch)', 'Electrical', ARRAY[]::text[],                ARRAY['junction box cover','missing junction','faceplate','missing motion sensor','switch cover'],                                    'Switch/Socket/Outlet','Install', 8),
  ('Finish Installation (Missing Ceiling Board/Panel)', 'Architectural', ARRAY[]::text[],                        ARRAY['missing ceiling','missing board','missing panel','missing capping','missing skirting'],                                         'Ceiling Finish','Missing Install', 9),
  ('Cable Tray Cover Installation',             'Electrical',    ARRAY['Cable Tray'],                            ARRAY['tray cover','cable tray cover'],                                                                                                'Cable/Trunking/Conduit','Tray Cover Install', 10),
  ('Door Hardware (Handle/Lock/Hinge/Closer)',  'Architectural', ARRAY[]::text[],                                ARRAY['door stopper','door not functioning','ironmongery','handle missing','door closer','fire label door'],                          'Door/Frame','Door Hardware', 11),
  ('Tile Re-grouting',                          'Wet Work',      ARRAY[]::text[],                                ARRAY['grouting uneven','grouting inconsistent','grouting redo','pointing uneven','pointing messy','pointing inconsistent'],          'Tile/Grout','Re-grouting', 12),
  -- Medium
  ('Paint Touch-up/Repaint',                    'Painting',      ARRAY['General Painting','Wall Finish'],        ARRAY['touch up','touch-up','repaint','make good paint','fully painted','messy paint','uneven paint','incomplete paint','make good of walls and repaint','make good of wall and repaint'], 'General Painting','Touch-up/Make Good', 13),
  ('Paint Stain Removal',                       'Painting',      ARRAY[]::text[],                                ARRAY['paint stain','paint mark','remove paint','remove putty','drip'],                                                                'General Painting','Paint Stain', 14),
  ('Shadow Gap Painting',                       'Painting',      ARRAY['Shadow Gap'],                            ARRAY['shadow gap paint','groove paint'],                                                                                              'Shadow Gap/Reveal','Paint', 15),
  ('Wall Make Good (Plastering/Skim)',          'Wet Work',      ARRAY['Wet Work','Wall Finish'],                ARRAY['make good wall','uneven wall','plaster','skim','wall surface make good'],                                                       'Wall Finish','Plaster/Skim Make Good', 16),
  ('Ceiling Make Good (Drywall)',               'Drywall',       ARRAY['Drywall/Ceiling','Ceiling Finish'],      ARRAY['make good ceiling','uneven ceiling','ceiling align','ceiling adjust'],                                                          'Ceiling Finish','Make Good', 17),
  ('Tile Edge/Termination Make Good',           'Wet Work',      ARRAY[]::text[],                                ARRAY['tile edge','tile edges','tile termination','around floor trap','around drain','skirting tile','chipped tile'],                  'Tile/Grout','Edge/Termination', 18),
  ('Sealant Apply/Re-do',                       'Sealant',       ARRAY[]::text[],                                ARRAY['sealant rectify','sealant redo','sealant apply','sealant missing','missing sealant','messy sealant','poor sealant','silicon provide','gap to seal'], 'Sealant/Joint','Apply/Re-do', 19),
  ('Facade Make Good (Pelmet/Mullion)',         'Facade',        ARRAY['Pelmet Box','Curtain Wall/Cladding/Pelmet'], ARRAY['pelmet rectify','mullion paint','mullion stain','facade make good','bottom capping aligned','cladding rectify'],            'Curtain Wall/Mullion','Make Good', 20),
  ('Facade Joint Work',                         'Facade',        ARRAY[]::text[],                                ARRAY['facade joint','cladding joint','between facade panels','spacer facade'],                                                        'Curtain Wall/Mullion','Joint Work', 21),
  ('Diffuser/Grille Adjustment',                'Mechanical',    ARRAY['Diffuser/Grille'],                       ARRAY['diffuser','grille','grill ','gap between grid','air diffuser','not seated properly at ceiling grid'],                          'Diffuser/Grille','Adjustment', 22),
  ('Electrical Services Alignment',             'Electrical',    ARRAY[]::text[],                                ARRAY['services not aligned','services not align','services not straight','alignment of services','speaker align','breakglass align','call button align','camera not align'], 'Cable/Trunking/Conduit','Alignment', 23),
  ('Lift Adjustment (Schindler)',               'Other',         ARRAY['Lift Work'],                             ARRAY['lift adjust','lift door','lift call button'],                                                                                   'Lift Work','Adjustment', 24),
  ('Minor Damage Touch-up',                     'Architectural', ARRAY[]::text[],                                ARRAY['scratch','dent','scuff','damaged make good','damaged touch up','chipped edge','peel off'],                                      'Wall Finish','Minor Damage', 25),
  ('Misc Metal Work (Catwalk/Railing)',         'Misc Metal',    ARRAY['Miscellaneous Metal'],                   ARRAY['catwalk','railing','handrail','balustrade'],                                                                                    'Miscellaneous Metal','Make Good', 26),
  -- Low
  ('General Cleaning',                          'General',       ARRAY['General Cleaning'],                      ARRAY['clean up','dust','dirty','remove dust','general cleaning','finger marks'],                                                      'General Cleaning','Cleaning', 27),
  ('Facade Stain Cleaning',                     'Facade',        ARRAY[]::text[],                                ARRAY['stain on facade','stain on pelmet','stain on mullion','stain on panel','cleaning facade','cleaning pelmet','final clean','rusty stain'], 'Curtain Wall/Mullion','Stain Cleaning', 28),
  ('Ceiling Stain/Cleaning',                    'Drywall',       ARRAY['Drywall/Ceiling'],                       ARRAY['stained ceiling','dirty ceiling','dusty ceiling','ceiling stain','ceiling dirty','ceiling dust','finger marks ceiling'],       'Ceiling Finish','Stain/Cleaning', 29),
  ('Construction Debris/Protection Removal',    'General',       ARRAY['Construction Debris/Tape'],              ARRAY['protection sheet remove','remove protection','masking tape','remove tape','remove sticker','remove debris','remove cardboard','remove construction material'], 'Construction Debris/Tape','Removal', 30),
  ('Labelling Work',                            'Electrical',    ARRAY[]::text[],                                ARRAY['labelling','labeling','circuit label','provide label','permanent signage','provide signage'],                                  'Services Surrounding','Labelling', 31),
  ('Capping/Cover Install (Small)',             'Architectural', ARRAY[]::text[],                                ARRAY['sprinkler cap','remove putty sprinkler','loose capping','cap install','cap provide'],                                           'Termination/Edge','Cap/Cover', 32),
  ('Design Verification / HDEC Confirmation',   'Other',         ARRAY[]::text[],                                ARRAY['hdec to confirm','hdec to check','hdec to verify','hdec to review','subject to building owner acceptance','justify if not accept'], 'Design Issue','HDEC Confirmation', 33),
  ('Duplicate Entry (For Reference)',           'Other',         ARRAY['Duplicate'],                             ARRAY['duplicate defect','duplicate entry'],                                                                                           'Duplicate','Reference', 34),
  ('Carpet/Floor Termination',                  'Architectural', ARRAY['Floor Finish'],                          ARRAY['carpet'],                                                                                                                       'Floor Finish','Carpet/Termination', 35),
  ('General Make Good (Other)',                 'Other',         ARRAY[]::text[],                                ARRAY['make good','rectify','tidy up','finish ','complete'],                                                                           'Uncategorized','General Make Good', 36);
