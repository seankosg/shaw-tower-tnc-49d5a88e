import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DocsExportPage() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Docs Export</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Export 기능은 다음 단계에서 구현됩니다.
        </CardContent>
      </Card>
    </div>
  );
}
