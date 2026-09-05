import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { FileQuestion, TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <span className="text-destructive" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-2xl italic">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-muted-foreground">
        {error.message || "An unexpected error occurred. Try reloading the page."}
      </p>
    </main>
  );
}

export function AppNotFoundComponent() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <span className="text-muted-foreground" aria-hidden="true">
        <FileQuestion className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-2xl italic">Not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">That page is not in Prompt Engineerer.</p>
      <Link to="/" className="mt-1 text-sm text-foreground underline-offset-4 hover:underline">
        Back to the studio
      </Link>
    </main>
  );
}
