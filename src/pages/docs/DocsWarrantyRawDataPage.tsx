import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck } from 'lucide-react';

export default function DocsWarrantyRawDataPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Warranty Deeds — Raw Data</h1>
        <Badge variant="outline" className="text-xs">Phase 3</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Warranty module — coming soon
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Warranty deed management (~139 items, 9-stage workflow, ACRA validation, Witness gap tracking)
            will be activated in Phase 3.
          </p>
          <p>
            This module will include: discussion timeline, validation checklist, batch package export,
            hardcopy manifest, and risk dashboard.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
