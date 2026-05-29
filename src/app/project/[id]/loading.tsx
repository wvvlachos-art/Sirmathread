// Shown during navigation into a project page — keeps the kraft background so
// there's no white flash between Layer 1 and Layer 2.
export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">
      Loading project…
    </main>
  );
}
