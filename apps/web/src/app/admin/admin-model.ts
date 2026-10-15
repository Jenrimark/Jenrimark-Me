import type { SiteContent } from '@jenrimark/content';

export type AdminContent = SiteContent;

export type EditableArrayKey =
  | 'education'
  | 'experience'
  | 'projects'
  | 'honors'
  | 'skills'
  | 'campus';

export function cloneContent(content: AdminContent): AdminContent {
  return structuredClone(content);
}

export function updatePath<T extends object, K extends keyof T>(source: T, key: K, value: T[K]): T;
export function updatePath<T extends object, K extends keyof T, K2 extends keyof NonNullable<T[K]>>(
  source: T,
  key: K,
  child: K2,
  value: NonNullable<T[K]>[K2],
): T;
export function updatePath(
  source: Record<string, unknown>,
  key: string,
  childOrValue: string | unknown,
  maybeValue?: unknown,
): Record<string, unknown> {
  if (arguments.length >= 4) {
    const parent = source[key];
    return {
      ...source,
      [key]: {
        ...(parent && typeof parent === 'object' ? parent : {}),
        [childOrValue as string]: maybeValue,
      },
    };
  }
  return { ...source, [key]: childOrValue };
}

export function updateArrayItem<T>(items: readonly T[] | undefined, index: number, value: T): T[] {
  const next = [...(items || [])];
  if (index >= 0 && index < next.length) next[index] = value;
  return next;
}

export function emptyProject(): NonNullable<AdminContent['projects']>[number] {
  return {
    id: `project-${Date.now()}`,
    slug: `project-${Date.now()}`,
    title: '新项目',
    subtitle: '',
    category: 'AI 产品',
    art: 'agent',
    technologies: [],
    summary: '',
    description: '',
    highlights: [],
    flow: [],
    status: 'draft',
    featured: false,
    sortOrder: 0,
    year: '',
    cover: '',
    sourceUrl: '',
  };
}

export function emptyExperience(): NonNullable<AdminContent['experience']>[number] {
  return {
    company: '新经历',
    department: '',
    role: '',
    focus: '',
    period: '',
    product: '',
    description: '',
    highlights: [],
  };
}

