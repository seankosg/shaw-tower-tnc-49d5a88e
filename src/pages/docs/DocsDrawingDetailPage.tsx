import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function DocsDrawingDetailPage() {
  const { id } = useParams();
  const [drawing, setDrawing] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from('docs_drawings').select('*').eq('id', id).maybeSingle();
      setDrawing(data);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!drawing) return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;

  return (
    <div className="space-y-4 p-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/docs/raw-data"><ArrowLeft className="mr-1 h-4 w-4" />Back</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-base">{String(drawing.document_no)}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(drawing, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
