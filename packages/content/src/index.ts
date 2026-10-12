export type ProjectStatus = 'draft' | 'published';

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
  focus?: string;
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
  education?: Education[];
  experience?: Experience[];
  projects: Project[];
  honors?: Honor[];
  skills?: Skill[];
  schemaVersion?: number;
  settings?: SiteSettings;
  campus?: Campus[];
}

export function escapeHTML(value = ''): string {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export function safeURL(value = ''): string {
  const v = String(value).trim();
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return u.username || u.password ? '' : u.href;
    } catch {
      return '';
    }
  }
  return /^media\/[a-zA-Z0-9_./-]+$/.test(v) && !v.includes('..') ? v : '';
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
    for (const key of ['technologies', 'highlights', 'flow'] as const) {
      const v = p[key];
      if (v != null && (!Array.isArray(v) || !v.every((x) => typeof x === 'string'))) {
        throw new Error(`project ${key} must contain text items`);
      }
    }
    for (const key of ['summary', 'description', 'category', 'subtitle', 'cover', 'sourceUrl'] as const) {
      const v = p[key];
      if (v != null && typeof v !== 'string') throw new Error(`project ${key} must be text`);
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
  if (JSON.stringify(data).length > 1_500_000) throw new Error('content is too large');
  return data;
}

export function publicContent(data: SiteContent): SiteContent {
  validateContent(data);
  const copy = structuredClone(data);
  copy.projects = copy.projects
    .filter((p) => p.status === 'published')
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  return copy;
}
