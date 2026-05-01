import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export default function DocsImportPage() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Construction className="h-5 w-5 text-amber-600" />
            Docs Import — Coming in next iteration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>As-Built 등록부 엑셀 업로드 기능은 다음 단계에서 구현됩니다.</p>
          <p>현재는 데이터베이스 테이블과 인프라(권한, RLS, 라우팅)만 준비되어 있습니다.</p>
          <p>임시로 데이터를 입력하려면 관리자에게 문의하세요.</p>
        </CardContent>
      </Card>
    </div>
  );
}
