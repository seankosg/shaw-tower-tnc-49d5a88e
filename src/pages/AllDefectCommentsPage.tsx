import { AllCommentsView } from '@/components/comments/AllCommentsView';

export default function AllDefectCommentsPage() {
  return (
    <div className="container mx-auto p-4 md:p-6">
      <AllCommentsView title="All Defect Comments" kind="defect" />
    </div>
  );
}
