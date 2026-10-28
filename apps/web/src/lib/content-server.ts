import sample from '../../../../packages/content/src/content.sample.json';
import { homeViewModel, type HomeViewModel, type SiteContent } from '@jenrimark/content';

const API_ORIGIN = process.env.API_ORIGIN || 'http://127.0.0.1:8080';
/** 站点自身 origin（Next dev/prod），用于读 public/scenes/manifest.json 场景清单 */
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'http://127.0.0.1:3000';

export async function loadHomeViewModel(): Promise<HomeViewModel> {
  const base = (async () => {
    try {
      const response = await fetch(`${API_ORIGIN}/api/public/content`, {
        next: { revalidate: 60, tags: ['public-content'] },
      });
      if (response.ok) return homeViewModel((await response.json()) as SiteContent);
    } catch {
      // Local preview stays useful when the Go service is not running.
    }
    return homeViewModel(sample as SiteContent);
  })();

  const [vm, scene] = await Promise.all([base, loadScene()]);
  return scene ? { ...vm, scene } : vm;
}

/** M4：读站点场景清单 manifest.json，取首个可用场景。R5：优先 spec 场景（动效规格驱动），无 spec 则 frames，再 video 兜底。 */
async function loadScene(): Promise<HomeViewModel['scene'] | undefined> {
  try {
    const r = await fetch(`${SITE_ORIGIN}/scenes/manifest.json`, {
      next: { revalidate: 60, tags: ['scenes-manifest'] },
    });
    if (!r.ok) return undefined;
    const manifest = (await r.json()) as {
      scenes?: { id?: string; budgetUrl?: string; framesDir?: string; mode?: string; spec?: string }[];
    };
    const storyScene = manifest.scenes?.find((x) => x.id && x.framesDir && x.spec && x.mode === 'story');
    if (storyScene) {
      return {
        mode: 'story',
        framesDir: `/scenes/${storyScene.id}/${storyScene.framesDir}`,
        specUrl: `/scenes/${storyScene.id}/${storyScene.spec}`,
      };
    }
    const specScene = manifest.scenes?.find((x) => x.id && x.budgetUrl && x.framesDir && x.spec && x.mode === 'spec');
    if (specScene) {
      return {
        mode: 'spec',
        budgetUrl: `/scenes/${specScene.id}/${specScene.budgetUrl}`,
        framesDir: `/scenes/${specScene.id}/${specScene.framesDir}`,
        specUrl: `/scenes/${specScene.id}/${specScene.spec}`,
      };
    }
    const s = manifest.scenes?.find((x) => x.id && x.budgetUrl && x.framesDir);
    if (!s) return undefined;
    return {
      mode: 'frames',
      budgetUrl: `/scenes/${s.id}/${s.budgetUrl}`,
      framesDir: `/scenes/${s.id}/${s.framesDir}`,
    };
  } catch {
    return undefined;
  }
}
