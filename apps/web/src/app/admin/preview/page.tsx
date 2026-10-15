import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { homeViewModel, type SiteContent } from '@jenrimark/content';
import HomeExperience from '@/components/HomeExperience';

export const dynamic = 'force-dynamic';

export default async function AdminPreviewPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('portfolio_token')?.value;
  if (!token) redirect('/admin');
  const origin = process.env.API_ORIGIN || 'http://127.0.0.1:8080';
  const response = await fetch(`${origin}/api/content`, { headers: { Cookie: `portfolio_token=${token}` }, cache: 'no-store' });
  if (!response.ok) redirect('/admin');
  const payload = (await response.json()) as { content?: SiteContent };
  return <div className="admin-preview-shell"><div className="admin-preview-banner"><span>草稿预览</span><a href="/admin">返回工作台 ↗</a></div><HomeExperience content={homeViewModel(payload.content || { profile: { name: '' }, projects: [] }, { includeDraft: true })} trackMetrics={false} /></div>;
}
