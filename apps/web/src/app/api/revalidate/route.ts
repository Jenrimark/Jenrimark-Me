import { revalidatePath, revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const token = (await cookies()).get('portfolio_token')?.value;
  if (!token) return Response.json({ error: '请先登录' }, { status: 401 });
  const origin = process.env.API_ORIGIN || 'http://127.0.0.1:8080';
  const auth = await fetch(`${origin}/api/content`, { headers: { Cookie: `portfolio_token=${token}` }, cache: 'no-store' });
  if (!auth.ok) return Response.json({ error: '登录已过期' }, { status: 401 });
  revalidateTag('public-content');
  revalidatePath('/');
  return Response.json({ ok: true });
}
