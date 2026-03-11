import type { ReactNode } from 'react';

type MainLayoutProps = {
  children: ReactNode;
};

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <main className="shell shell-main">
      <section className="panel panel-main">{children}</section>
    </main>
  );
}
