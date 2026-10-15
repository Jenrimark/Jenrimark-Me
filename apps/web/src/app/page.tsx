import HomeExperience from '@/components/HomeExperience';
import { loadHomeViewModel } from '@/lib/content-server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const content = await loadHomeViewModel();
  return <HomeExperience content={content} />;
}
