import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

/**
 * Shown instead of a study plan once the exam it was built for is over (the
 * plan is removed at that point). Offers the two ways forward.
 */
export function ExamOverNotice({
  studentId,
  examName,
  examDate,
}: {
  studentId: string;
  examName: string;
  examDate: string;
}) {
  return (
    <Card className="border-amber-300 bg-amber-50">
      <h2 className="text-lg font-semibold text-amber-900">
        This study plan is over
      </h2>
      <p className="mt-1 text-sm text-amber-800">
        <span className="font-medium">{examName}</span> was on{' '}
        {new Date(examDate).toLocaleDateString()}, so its plan has been cleared.
        Start the next exam cycle to get a new plan, or begin a new academic
        session if your child has moved on.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/students/${studentId}/new-exam`}>
          <Button>Start new exam cycle</Button>
        </Link>
        <Link href={`/students/${studentId}/new-session`}>
          <Button variant="secondary">
            Start a new academic session with no previous exams
          </Button>
        </Link>
      </div>
    </Card>
  );
}
