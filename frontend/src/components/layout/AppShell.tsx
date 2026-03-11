import type { ReactNode } from "react";

interface AppShellProps {
  sidebar: ReactNode;
  main: ReactNode;
  artifact?: ReactNode;
}

export function AppShell({ sidebar, main, artifact }: AppShellProps) {
  return (
    <div className="h-screen flex bg-neutral-900 text-neutral-100 overflow-hidden">
      <aside className="w-[260px] flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col">
        {sidebar}
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        {main}
      </main>
      {artifact && (
        <aside className="w-[400px] flex-shrink-0 bg-neutral-950 border-l border-neutral-800 flex flex-col">
          {artifact}
        </aside>
      )}
    </div>
  );
}
