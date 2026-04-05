import { setRequestLocale } from 'next-intl/server';

import { ImmersiveHarmonium } from '@/shared/blocks/harmonium/immersive-keyboard';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ImmersiveHarmonium />;
}