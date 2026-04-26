import { AllCommentsView } from '@/components/comments/AllCommentsView';

export default function AllSubtestCommentsPage() {
  return (
    <div className="container mx-auto p-4 md:p-6">
      <AllCommentsView title="All Subtest Comments" kind="subtest" />
    </div>
  );
}
