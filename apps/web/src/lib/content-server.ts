import sample from '../../../../packages/content/src/content.sample.json';
import { homeViewModel, type HomeViewModel, type SiteContent } from '@jenrimark/content';

const API_ORIGIN = process.env.API_ORIGIN || 'http://127.0.0.1:8080';

export async function loadHomeViewModel(): Promise<HomeViewModel> {
  try {
    const response = await fetch(`${API_ORIGIN}/api/public/content`, {
      next: { revalidate: 60, tags: ['public-content'] },
    });
    if (response.ok) return homeViewModel((await response.json()) as SiteContent);
  } catch {
    // Local preview stays useful when the Go service is not running.
  }
  return homeViewModel(sample as SiteContent);
}
