export type ProjectStatus = 'draft' | 'published';

export type ProjectBlock =
  | { id: string; type: 'rich_text'; sortOrder: number; body: Record<string, unknown> }
  | { id: string; type: 'image'; sortOrder: number; mediaId: string; alt?: string; caption?: string }
  | { id: string; type: 'gallery'; sortOrder: number; mediaIds: string[]; caption?: string }
  | { id: string; type: 'video'; sortOrder: number; mediaId: string; posterMediaId?: string; caption?: string };

export type HomeSlotKey = 'featured_1' | 'featured_2' | 'mini_1' | 'mini_2' | 'mini_3' | 'mini_4';

export type HomeSlots = Partial<Record<HomeSlotKey, string | null>>;

export interface Project {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  category?: string;
  art?: string;
  technologies?: string[];
  summary?: string;
  description?: string;
  highlights?: string[];
  flow?: string[];
  status: ProjectStatus;
  featured?: boolean;
  sortOrder?: number;
  year?: string;
  cover?: string;
  sourceUrl?: string;
  tags?: string[];
  blocks?: ProjectBlock[];
}

export interface Education {
  school: string;
  major: string;
  degree: string;
  period: string;
  ranking?: string;
}

export interface Experience {
  company: string;
  department?: string;
  role: string;
  focus?: string | string[];
  period: string;
  product?: string;
  description?: string;
  highlights?: string[];
}

export interface Campus {
  period: string;
  role: string;
  organization: string;
  description?: string;
}

export interface Honor {
  name: string;
  awards?: string[];
  role?: string;
}

export interface Skill {
  category: string;
  items: string[];
}

export interface Profile {
  name: string;
  englishName?: string;
  brand?: string;
  positioning?: string;
  location?: string;
  email?: string;
  github?: string;
  intro?: string;
  resumeUrl?: string;
}

export interface FriendLink {
  name: string;
  url: string;
  description?: string;
}

export interface SiteSettings {
  title?: string;
  description?: string;
  heroHeading?: string;
  heroEmphasis?: string;
  heroTagline?: string;
  footerLine?: string;
  copyright?: string;
}

export interface SiteContent {
  source?: { url?: string; accessedOn?: string; dateMarkerNote?: string };
  profile: Profile;
  friends?: FriendLink[];
  education?: Education[];
  experience?: Experience[];
  projects: Project[];
  honors?: Honor[];
  skills?: Skill[];
  schemaVersion?: number;
  settings?: SiteSettings;
  campus?: Campus[];
  homeSlots?: HomeSlots;
}

export interface HomeViewModel {
  profile: Profile;
  friends: FriendLink[];
  education: Education[];
  experience: Experience[];
  campus: Campus[];
  honors: Honor[];
  skills: Skill[];
  featuredProjects: Project[];
  miniProjects: Project[];
  projects: Project[];
  homeSlots: HomeSlots;
  settings?: SiteSettings;
  /** 首页场景模式：story 为五页动作叙事，frames/spec 保留旧场景兼容，缺省走 video。 */
  scene?:
    | { mode: 'story'; framesDir: string; specUrl: string }
    | { mode: 'frames'; budgetUrl: string; framesDir: string }
    | { mode: 'spec'; budgetUrl: string; framesDir: string; specUrl: string };
}

export interface HomeViewOptions {
  includeDraft?: boolean;
}

export function escapeHTML(value = ''): string {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export function safeURL(value = ''): string {
  const v = String(value).trim();
  if (/^mailto:/i.test(v)) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.slice(7)) ? v : '';
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return u.username || u.password ? '' : u.href;
    } catch {
      return '';
    }
  }
  return /^\/?media\/[a-zA-Z0-9_./-]+$/.test(v) && !v.includes('..') ? v : '';
}

export function validateContent(data: SiteContent): SiteContent {
  if (!data || typeof data !== 'object' || !data.profile || typeof data.profile.name !== 'string' || !data.profile.name.trim()) {
    throw new Error('profile.name is required');
  }
  if (!Array.isArray(data.projects) || data.projects.length > 100) {
    throw new Error('projects must be an array (max 100)');
  }
  const slugs = new Set<string>();
  for (const p of data.projects) {
    if (!p || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug || '') || slugs.has(p.slug)) {
      throw new Error('project slug must be unique and use lowercase letters/numbers');
    }
    slugs.add(p.slug);
    if (!p.title || typeof p.title !== 'string' || p.title.length > 150) {
      throw new Error('project title is required (max 150)');
    }
    if (!['draft', 'published'].includes(p.status)) {
      throw new Error('project status must be draft or published');
    }
    if (p.cover && !safeURL(p.cover)) throw new Error('invalid project cover URL');
    for (const key of ['technologies', 'highlights', 'flow', 'tags'] as const) {
      const v = p[key];
      if (v != null && (!Array.isArray(v) || !v.every((x) => typeof x === 'string'))) {
        throw new Error(`project ${key} must contain text items`);
      }
    }
    for (const key of ['summary', 'description', 'category', 'subtitle', 'cover', 'sourceUrl'] as const) {
      const v = p[key];
      if (v != null && typeof v !== 'string') throw new Error(`project ${key} must be text`);
    }
    if (p.sourceUrl && !safeURL(p.sourceUrl)) throw new Error('invalid project source URL');
    if (p.blocks != null) {
      if (!Array.isArray(p.blocks) || p.blocks.length > 100) throw new Error('project blocks must be an array (max 100)');
      for (const block of p.blocks) {
        if (!block || typeof block !== 'object' || !['rich_text', 'image', 'gallery', 'video'].includes(block.type)) {
          throw new Error('project block type is invalid');
        }
        if (!Number.isFinite(Number(block.sortOrder))) throw new Error('project block sortOrder must be a number');
        if (block.type === 'gallery' && (!Array.isArray(block.mediaIds) || !block.mediaIds.every((id) => typeof id === 'string'))) {
          throw new Error('gallery mediaIds must contain text');
        }
        if (block.type === 'rich_text') validateRichText(block.body);
      }
    }
  }
  for (const k of ['education', 'experience', 'campus', 'honors', 'skills'] as const) {
    if (data[k] != null && !Array.isArray(data[k])) throw new Error(`${k} must be an array`);
  }
  for (const skill of data.skills || []) {
    if (!Array.isArray(skill.items) || !skill.items.every((x) => typeof x === 'string')) {
      throw new Error('skill items must contain text');
    }
  }
  for (const honor of data.honors || []) {
    if (honor.awards != null && (!Array.isArray(honor.awards) || !honor.awards.every((x) => typeof x === 'string'))) {
      throw new Error('awards must contain text');
    }
  }
  if (data.homeSlots != null) {
    if (typeof data.homeSlots !== 'object' || Array.isArray(data.homeSlots)) throw new Error('homeSlots must be an object');
    const projectIds = new Set(data.projects.map((project) => project.id));
    const used = new Set<string>();
    for (const key of ['featured_1', 'featured_2', 'mini_1', 'mini_2', 'mini_3', 'mini_4'] as HomeSlotKey[]) {
      const id = data.homeSlots[key];
      if (id == null) continue;
      if (!projectIds.has(id)) throw new Error(`home slot ${key} references an unknown project`);
      if (used.has(id)) throw new Error(`project ${id} is assigned to multiple home slots`);
      used.add(id);
    }
  }
  if (JSON.stringify(data).length > 1_500_000) throw new Error('content is too large');
  return data;
}

function validateRichText(body: Record<string, unknown>): void {
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('rich text node must be an object');
    const node = value as { type?: unknown; text?: unknown; content?: unknown; marks?: unknown };
    if (node.type && !['doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'text'].includes(String(node.type))) {
      throw new Error('rich text node type is not allowed');
    }
    if (node.text != null && typeof node.text !== 'string') throw new Error('rich text text must be a string');
    if (node.content != null) {
      if (!Array.isArray(node.content) || node.content.length > 200) throw new Error('rich text content is invalid');
      node.content.forEach(walk);
    }
    if (node.marks != null) {
      if (!Array.isArray(node.marks) || node.marks.length > 5) throw new Error('rich text marks are invalid');
      for (const mark of node.marks as Array<{ type?: unknown; attrs?: { href?: unknown } }>) {
        if (!['bold', 'italic', 'link'].includes(String(mark.type))) throw new Error('rich text mark is not allowed');
        if (mark.type === 'link' && !safeURL(String(mark.attrs?.href || ''))) throw new Error('invalid rich text link');
      }
    }
  };
  walk(body);
}

export function publicContent(data: SiteContent): SiteContent {
  validateContent(data);
  const copy = structuredClone(data);
  copy.projects = copy.projects
    .filter((p) => p.status === 'published')
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  if (copy.homeSlots) {
    const publishedIds = new Set(copy.projects.map((project) => project.id));
    copy.homeSlots = Object.fromEntries(
      Object.entries(copy.homeSlots).filter(([, projectId]) => projectId && publishedIds.has(projectId)),
    ) as HomeSlots;
  }
  return copy;
}

export function homeViewModel(data: SiteContent, options: HomeViewOptions = {}): HomeViewModel {
  const content = options.includeDraft ? structuredClone(validateContent(data)) : publicContent(data);
  const projects = [...content.projects].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  const byId = new Map(projects.map((project) => [project.id, project]));
  const slots = content.homeSlots || {};
  const pick = (key: HomeSlotKey, fallbackIndex: number) => {
    const selected = slots[key] ? byId.get(slots[key] as string) : undefined;
    return selected || projects[fallbackIndex];
  };
  const featured = [pick('featured_1', 0), pick('featured_2', 1)].filter(Boolean) as Project[];
  const featuredIds = new Set(featured.map((project) => project.id));
  const mini = [pick('mini_1', 2), pick('mini_2', 3), pick('mini_3', 4), pick('mini_4', 5)]
    .filter((project): project is Project => Boolean(project) && !featuredIds.has(project.id));
  return {
    profile: content.profile,
    education: content.education || [],
    experience: content.experience || [],
    campus: content.campus || [],
    honors: content.honors || [],
    skills: content.skills || [],
    featuredProjects: featured,
    miniProjects: mini,
    projects,
    homeSlots: slots,
    settings: content.settings,
    friends: content.friends || [],
  };
}
