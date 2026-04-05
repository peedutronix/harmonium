import { ReactNode } from 'react';

// Immersive layout: no header/footer wrapper - pure full-screen harmonium
export default function LandingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
