import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <Construction className="h-12 w-12 mb-4" />
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-sm mt-1">This feature will be available in the next phase.</p>
    </div>
  );
}
