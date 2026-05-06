-- Create warranty_comments table (mirrors omm_comments pattern)
CREATE TABLE public.warranty_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  warranty_item_id uuid NOT NULL REFERENCES public.warranty_items(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  parent_comment_id uuid REFERENCES public.warranty_comments(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'comment',
  message text NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}'::text[],
  edited boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT warranty_comments_type_check CHECK (type = ANY (ARRAY['comment'::text, 'instruction'::text, 'reply'::text]))
);

CREATE INDEX idx_warranty_comments_item ON public.warranty_comments(warranty_item_id);
CREATE INDEX idx_warranty_comments_parent ON public.warranty_comments(parent_comment_id);
CREATE INDEX idx_warranty_comments_created_at ON public.warranty_comments(created_at);
CREATE INDEX idx_warranty_comments_recipients ON public.warranty_comments USING GIN(recipients);

ALTER TABLE public.warranty_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read warranty comments"
  ON public.warranty_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert own warranty comments"
  ON public.warranty_comments FOR INSERT
  TO authenticated
  WITH CHECK (author_user_id = auth.uid());

CREATE POLICY "Authors or admins can update warranty comments"
  ON public.warranty_comments FOR UPDATE
  TO authenticated
  USING ((author_user_id = auth.uid()) OR is_admin_or_superuser(auth.uid()))
  WITH CHECK ((author_user_id = auth.uid()) OR is_admin_or_superuser(auth.uid()));

CREATE POLICY "Authors or admins can delete warranty comments"
  ON public.warranty_comments FOR DELETE
  TO authenticated
  USING ((author_user_id = auth.uid()) OR is_admin_or_superuser(auth.uid()));

CREATE TRIGGER trg_warranty_comments_touch
  BEFORE UPDATE ON public.warranty_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();