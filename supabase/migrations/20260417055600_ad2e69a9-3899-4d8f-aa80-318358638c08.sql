-- 1. subcontractor_master: type + parent FK
ALTER TABLE public.subcontractor_master
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'sub',
  ADD COLUMN IF NOT EXISTS parent_subcontractor_id uuid REFERENCES public.subcontractor_master(id) ON DELETE SET NULL;

ALTER TABLE public.subcontractor_master
  DROP CONSTRAINT IF EXISTS subcontractor_master_type_check;
ALTER TABLE public.subcontractor_master
  ADD CONSTRAINT subcontractor_master_type_check CHECK (type IN ('sub','subsub'));

-- Validation trigger: subsub must have parent of type='sub'
CREATE OR REPLACE FUNCTION public.validate_subcontractor_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_type text;
BEGIN
  IF NEW.type = 'subsub' THEN
    IF NEW.parent_subcontractor_id IS NULL THEN
      RAISE EXCEPTION 'SubSub entries must have a parent_subcontractor_id';
    END IF;
    SELECT type INTO parent_type FROM public.subcontractor_master WHERE id = NEW.parent_subcontractor_id;
    IF parent_type IS NULL THEN
      RAISE EXCEPTION 'Parent subcontractor not found';
    END IF;
    IF parent_type <> 'sub' THEN
      RAISE EXCEPTION 'Parent subcontractor must be of type=sub';
    END IF;
  ELSIF NEW.type = 'sub' THEN
    -- sub cannot have a parent
    NEW.parent_subcontractor_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_subcontractor_parent ON public.subcontractor_master;
CREATE TRIGGER trg_validate_subcontractor_parent
BEFORE INSERT OR UPDATE ON public.subcontractor_master
FOR EACH ROW EXECUTE FUNCTION public.validate_subcontractor_parent();

-- 2. profiles: subsub_name
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subsub_name text;

-- 3. subtests: subsub_name
ALTER TABLE public.subtests
  ADD COLUMN IF NOT EXISTS subsub_name text;

-- 4. field_config: insert SubSub between Subcontractor and HDEC PIC
INSERT INTO public.field_config (field_name, display_name, sort_order, is_enabled, is_required, visible_to_roles, editable_to_roles)
SELECT 'subsub_name', 'SubSub', 52, true, false,
  ARRAY['guest','super_guest','user','senior_user','superuser','admin']::public.app_role[],
  ARRAY['user','senior_user','superuser','admin']::public.app_role[]
WHERE NOT EXISTS (SELECT 1 FROM public.field_config WHERE field_name = 'subsub_name');

-- 5. handle_new_user(): include subsub_name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_login_id text;
  v_user_type public.user_type;
  v_subcontractor_name text;
  v_subsub_name text;
  v_hdec_pic_name text;
  v_must_change boolean;
BEGIN
  v_login_id := COALESCE(
    NEW.raw_user_meta_data->>'login_id',
    split_part(NEW.email, '@', 1)
  );
  v_user_type := COALESCE(
    (NEW.raw_user_meta_data->>'user_type')::public.user_type,
    'hdec'::public.user_type
  );
  v_subcontractor_name := NEW.raw_user_meta_data->>'subcontractor_name';
  v_subsub_name := NEW.raw_user_meta_data->>'subsub_name';
  v_hdec_pic_name := NEW.raw_user_meta_data->>'hdec_pic_name';
  v_must_change := COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, true);

  INSERT INTO public.profiles (
    user_id, email, name, login_id, user_type,
    subcontractor_name, subsub_name, hdec_pic_name, must_change_password
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', v_login_id),
    v_login_id,
    v_user_type,
    v_subcontractor_name,
    v_subsub_name,
    v_hdec_pic_name,
    v_must_change
  );
  RETURN NEW;
END;
$function$;