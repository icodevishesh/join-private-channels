import ProgressBar from '@/components/ui/ProgressBar';
import { LoadingBlock } from '@/components/ui/Spinner';

// Shown in the content area (the sidebar stays) while a page loads its data.
export default function PanelLoading() {
  return (
    <>
      <ProgressBar className="fixed top-0 right-0 left-0 z-50 h-1" />
      <LoadingBlock label="Loading…" className="py-24" />
    </>
  );
}
