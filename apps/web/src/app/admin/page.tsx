'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  validateContent,
  type Campus,
  type Education,
  type Honor,
  type Project,
  type HomeSlotKey,
  type ProjectBlock,
  type SiteContent,
  type SiteSettings,
  type Skill,
} from '@jenrimark/content';
import { emptyExperience, emptyProject, type AdminContent } from './admin-model';
import { RichTextBlockEditor } from '@/components/admin/RichTextBlockEditor';
type MetricsSnapshot = { days: Array<{ date: string; pageViews: number; projectOpenCount: number }>; projectRanking: Array<{ projectId: string; openCount: number }> };

type TabKey = 'dashboard' | 'projects' | 'profile' | 'experience' | 'education' | 'campus' | 'honors' | 'skills' | 'settings' | 'media' | 'preview' | 'json';
type ApiContent = Pick<SiteContent, 'profile' | 'projects'> & Partial<Omit<SiteContent, 'profile' | 'projects'>>;

const TABS: Array<[TabKey, string, string]> = [
  ['dashboard', '工作台', 'DASHBOARD'], ['projects', '作品管理', 'PROJECTS'], ['profile', '个人资料', 'PROFILE'], ['experience', '实习经历', 'EXPERIENCE'],
  ['education', '教育经历', 'EDUCATION'], ['campus', '校园经历', 'CAMPUS'], ['honors', '荣誉奖项', 'HONORS'],
  ['skills', '技能清单', 'SKILLS'], ['settings', '站点设置', 'SITE SETTINGS'], ['media', '媒体库', 'MEDIA'], ['preview', '草稿预览', 'PREVIEW'], ['json', '高级 JSON', 'ADVANCED'],
];

const api = {
  async login(password: string) {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ password }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '登录失败');
    return res.json();
  },
  async logout() { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); },
  async getContent() {
    const res = await fetch('/api/content', { credentials: 'include' });
    if (!res.ok) throw new Error('请先登录');
    return res.json() as Promise<{ content?: ApiContent }>;
  },
  async saveContent(content: AdminContent) {
    const res = await fetch('/api/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ content }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '保存失败');
    return res.json();
  },
  async publish() {
    const res = await fetch('/api/publish', { method: 'POST', credentials: 'include' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '发布失败');
    return res.json();
  },
  async upload(file: File) {
    const buf = await file.arrayBuffer();
    const data = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const res = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ data }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '上传失败');
    return res.json() as Promise<{ url: string }>;
  },
  async revalidate() {
    await fetch('/api/revalidate', { method: 'POST', credentials: 'include' }).catch(() => undefined);
  },
  async metrics() {
    const res = await fetch('/api/metrics', { credentials: 'include' });
    if (!res.ok) throw new Error('统计暂不可用');
    return res.json() as Promise<MetricsSnapshot>;
  },
  async listMedia() {
    const res = await fetch('/api/media', { credentials: 'include' });
    if (!res.ok) throw new Error('媒体暂不可用');
    return res.json() as Promise<{ assets: Array<{ storageKey: string; mime: string; bytes: number; createdAt: string }> }>;
  },
  async deleteMedia(storageKey: string) {
    const res = await fetch(`/api/media/${storageKey.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '删除媒体失败');
  },
};

function asContent(value: ApiContent): AdminContent {
  return { ...value, profile: value.profile, projects: value.projects || [] } as AdminContent;
}

function valueOf(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }

function Field({ label, value, onChange, placeholder, multiline = false, hint, type = 'text' }: { label: string; value: unknown; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; hint?: string; type?: string }) {
  return <label className={`admin-field${multiline ? ' admin-field-wide' : ''}`}><span>{label}</span>{multiline ? <textarea value={valueOf(value)} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} /> : <input type={type} value={valueOf(value)} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}{hint ? <small>{hint}</small> : null}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="admin-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="admin-toggle-track" aria-hidden="true"><span /></span><span>{label}</span></label>;
}

function ArrayEditor({ items, onChange, placeholder, addLabel = '添加一项' }: { items: string[] | undefined; onChange: (items: string[]) => void; placeholder: string; addLabel?: string }) {
  const values = items || [];
  return <div className="admin-array-editor">{values.map((item, index) => <div className="admin-array-row" key={`${index}-${item}`}><span className="admin-array-index">{String(index + 1).padStart(2, '0')}</span><input value={item} placeholder={placeholder} onChange={(event) => onChange(values.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} /><button className="admin-icon-button" type="button" aria-label={`删除第 ${index + 1} 项`} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}<button className="admin-add-link" type="button" onClick={() => onChange([...values, ''])}><span>＋</span> {addLabel}</button></div>;
}

function EditorCard({ eyebrow, title, description, children, actions, tone = 'default' }: { eyebrow?: string; title: string; description?: string; children: ReactNode; actions?: ReactNode; tone?: 'default' | 'accent' | 'muted' }) {
  return <section className={`admin-card admin-card-${tone}`}><div className="admin-card-heading"><div>{eyebrow ? <p className="admin-card-eyebrow">{eyebrow}</p> : null}<h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{actions ? <div className="admin-card-actions">{actions}</div> : null}</div><div className="admin-card-body">{children}</div></section>;
}

function PageIntro({ title, eyebrow, description }: { title: string; eyebrow: string; description: string }) {
  return <div className="admin-page-intro"><p className="admin-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>;
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [content, setContent] = useState<AdminContent | null>(null);
  const [tab, setTab] = useState<TabKey>('projects');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState('');
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [metrics, setMetrics] = useState<MetricsSnapshot>({ days: [], projectRanking: [] });
  const [mediaAssets, setMediaAssets] = useState<Array<{ storageKey: string; mime: string; bytes: number; createdAt: string }>>([]);
  const [projectQuery, setProjectQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [projectCategory, setProjectCategory] = useState('all');
  const saveQueue = useRef(Promise.resolve());
  const contentRef = useRef<AdminContent | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getContent();
      const next = asContent(data.content || (data as unknown as ApiContent));
      contentRef.current = next;
      setContent(next); setAuthed(true); setDirty(false); setJsonDraft(JSON.stringify(next, null, 2));
      setMetrics(await api.metrics().catch(() => ({ days: [], projectRanking: [] })));
      setMediaAssets((await api.listMedia().catch(() => ({ assets: [] }))).assets);
    } catch { setAuthed(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const onLogin = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    try { await api.login(password); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : '登录失败'); }
  };

  const updateContent = useCallback((updater: (current: AdminContent) => AdminContent) => {
    setContent((current) => {
      if (!current) return current;
      const next = updater(current);
      contentRef.current = next;
      return next;
    }); setDirty(true); setNotice('有未保存修改'); setError('');
  }, []);
  const updateProfile = (key: keyof AdminContent['profile'], value: string) => updateContent((current) => ({ ...current, profile: { ...current.profile, [key]: value } }));

  useEffect(() => {
    if (!content || !dirty || tab === 'json') return;
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        const snapshot = contentRef.current || content;
        try {
          await api.saveContent(snapshot);
          if (contentRef.current === snapshot) setDirty(false);
          setLastSaved(new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
          setNotice('已自动保存草稿');
          if (contentRef.current === snapshot) setJsonDraft(JSON.stringify(snapshot, null, 2));
        } catch (err) {
          setError(err instanceof Error ? err.message : '自动保存失败');
        }
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [content, dirty, tab]);

  const selectTab = (next: TabKey) => {
    if (next === tab) return;
    if (dirty && !window.confirm('当前有未保存修改，仍要切换栏目吗？')) return;
    setTab(next);
    if (next === 'json' && content) { setJsonDraft(JSON.stringify(content, null, 2)); setJsonError(''); }
  };

  const onSave = async () => {
    if (!content) return;
    if (tab === 'json' && jsonDraft !== JSON.stringify(content, null, 2)) { setError('请先点击“应用 JSON”，再保存草稿'); return; }
    if (tab === 'json' && jsonError) { setError('请先修正 JSON 格式错误'); return; }
    setBusy(true); setError('');
    try { await api.saveContent(content); setDirty(false); setLastSaved(new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())); setNotice('草稿已保存'); setJsonDraft(JSON.stringify(content, null, 2)); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败'); }
    finally { setBusy(false); }
  };

  const onPublish = async () => {
    if (!content) return;
    if (tab === 'json' && jsonDraft !== JSON.stringify(content, null, 2)) { setError('请先点击“应用 JSON”，再发布'); return; }
    setBusy(true); setError('');
    try { if (dirty) await api.saveContent(content); const result = await api.publish(); await api.revalidate(); setDirty(false); setLastSaved(new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())); setNotice(result.message || `已发布 ${result.projects ?? ''} 个项目`); }
    catch (err) { setError(err instanceof Error ? err.message : '发布失败'); }
    finally { setBusy(false); }
  };

  const onUpload = async (file: File | undefined, projectIndex: number) => {
    if (!file || !content) return;
    setBusy(true); setError('');
    try { const result = await api.upload(file); updateContent((current) => ({ ...current, projects: current.projects.map((project, index) => index === projectIndex ? { ...project, cover: result.url } : project) })); setNotice(`封面已上传：${result.url}`); }
    catch (err) { setError(err instanceof Error ? err.message : '上传失败'); }
    finally { setBusy(false); }
  };

  const applyJson = () => {
    try { const parsed = JSON.parse(jsonDraft) as AdminContent; validateContent(parsed); contentRef.current = parsed; setContent(parsed); setJsonDraft(JSON.stringify(parsed, null, 2)); setDirty(true); setJsonError(''); setNotice('JSON 已应用到草稿，记得保存'); setError(''); }
    catch (err) { setJsonError(err instanceof Error ? err.message : 'JSON 格式无效'); setError('JSON 未应用'); }
  };

  const activeTab = TABS.find(([key]) => key === tab) || TABS[0];
  const stats = useMemo(() => content ? { published: content.projects.filter((project) => project.status === 'published').length, projects: content.projects.length, draft: content.projects.filter((project) => project.status === 'draft').length, experiences: content.experience?.length || 0, skills: content.skills?.reduce((sum, skill) => sum + skill.items.length, 0) || 0, media: content.projects.filter((project) => project.cover).length } : { published: 0, projects: 0, draft: 0, experiences: 0, skills: 0, media: 0 }, [content]);
  const categories = useMemo(() => [...new Set((content?.projects || []).map((project) => project.category).filter(Boolean) as string[])].sort(), [content]);
  const visibleProjects = useMemo(() => (content?.projects || []).filter((project) => {
    const query = projectQuery.trim().toLowerCase();
    return (!query || [project.title, project.subtitle, project.slug, project.summary, ...(project.tags || [])].some((value) => value?.toLowerCase().includes(query)))
      && (projectFilter === 'all' || project.status === projectFilter)
      && (projectCategory === 'all' || project.category === projectCategory);
  }), [content, projectCategory, projectFilter, projectQuery]);

  if (!authed) return <LoginPage password={password} setPassword={setPassword} error={error} onLogin={onLogin} />;
  if (!content) return <div className="admin-loading">正在打开内容工作台…</div>;

  return <div id="studio" className="admin-shell">
    <Sidebar tab={tab} dirty={dirty} onSelect={selectTab} onLogout={async () => { await api.logout(); setAuthed(false); }} />
    <main className="admin-main">
      <header className="admin-topbar"><div className="admin-topbar-title"><p className="admin-eyebrow">{activeTab[2]}</p><h1>{activeTab[1]}</h1><p>{tab === 'json' ? '直接检查和调整整站内容结构。' : '把内容整理好，再让它出现在前台。'}</p></div><div className="admin-topbar-actions"><div className={`admin-save-status${dirty ? ' is-dirty' : ''}`} role="status"><span className="admin-status-dot" /><span>{dirty ? '有未保存修改' : lastSaved ? `已保存 ${lastSaved}` : '草稿已同步'}</span></div><button className="admin-secondary-button" type="button" onClick={() => void onSave()} disabled={busy || !dirty}>保存草稿</button><button className="admin-primary-button" type="button" onClick={() => void onPublish()} disabled={busy}>发布 <span>↗</span></button></div></header>
      <div className="admin-notice" role="status"><span>{notice || '修改后先保存草稿，确认无误后再发布。'}</span>{error ? <strong>{error}</strong> : null}</div>
      <div className="admin-workspace"><div className="admin-editor-column">{tab === 'projects' ? <><ProjectToolbar query={projectQuery} setQuery={setProjectQuery} filter={projectFilter} setFilter={setProjectFilter} category={projectCategory} setCategory={setProjectCategory} categories={categories} count={visibleProjects.length} /><ProjectEditorList projects={visibleProjects} content={content} updateContent={updateContent} onUpload={onUpload} /></> : tab === 'dashboard' ? <Dashboard metrics={metrics} stats={stats} /> : tab === 'media' ? <MediaLibrary assets={mediaAssets} onDelete={async (storageKey) => { try { await api.deleteMedia(storageKey); setMediaAssets((current) => current.filter((asset) => asset.storageKey !== storageKey)); setNotice('媒体已删除'); } catch (err) { setError(err instanceof Error ? err.message : '删除媒体失败'); } }} /> : renderEditor(tab, content, updateContent, updateProfile, onUpload, jsonDraft, setJsonDraft, jsonError, setJsonError, setDirty, setNotice, applyJson)}</div><Inspector stats={stats} /></div>
    </main>
  </div>;
}

function LoginPage({ password, setPassword, error, onLogin }: { password: string; setPassword: (value: string) => void; error: string; onLogin: (event: FormEvent) => void }) {
  return <section className="admin-login"><div className="admin-login-noise" aria-hidden="true" /><div className="admin-login-grid" aria-hidden="true" /><div className="admin-login-layout"><div className="admin-login-copy"><p className="admin-eyebrow">JENRIMARK / CONTENT STUDIO</p><h1>让作品<br /><em>继续生长。</em></h1><p>一处地方，编辑你在前台展示的作品、经历与想法。</p><div className="admin-login-facts"><span>编辑</span><span>发布</span><span>归档</span></div></div><div className="admin-login-card"><div className="admin-login-card-top"><span className="admin-brand">jenrimark<span>内容工作台</span></span><span className="admin-live-dot">LIVE</span></div><div className="admin-login-card-body"><p className="admin-card-eyebrow">PRIVATE ACCESS / 01</p><h2>进入工作台</h2><p>登录后可以管理前台公开内容。草稿只会保存在后台，发布后才会出现在网站。</p><form onSubmit={onLogin} className="admin-login-form"><Field label="管理密码" value={password} onChange={setPassword} type="password" /><button className="admin-primary-button admin-login-submit" type="submit">进入工作台 <span>↗</span></button></form><p className="admin-form-error" role="alert">{error}</p></div><a className="admin-login-back" href="/">← 返回网站</a></div></div></section>;
}

function Sidebar({ tab, dirty, onSelect, onLogout }: { tab: TabKey; dirty: boolean; onSelect: (tab: TabKey) => void; onLogout: () => Promise<void> }) {
  const groups: Array<[string, TabKey[]]> = [['概览', ['dashboard']], ['内容', ['projects', 'profile', 'experience', 'education', 'campus', 'honors', 'skills']], ['素材与系统', ['media', 'preview', 'settings', 'json']]];
  return <aside className="admin-sidebar"><div className="admin-sidebar-top"><a className="admin-brand" href="/" target="_blank" rel="noreferrer">jenrimark<span>内容工作台</span></a><div className="admin-site-status"><span className="admin-status-dot" />网站在线<small>{dirty ? 'DRAFT' : 'V2.0'}</small></div></div><nav className="admin-nav" aria-label="内容分类">{groups.map(([group, keys]) => <div key={group} className="admin-nav-group"><p className="admin-nav-label">{group}</p>{keys.map((key) => { const item = TABS.find(([itemKey]) => itemKey === key); return item ? <button key={key} className={tab === key ? 'is-selected' : ''} onClick={() => onSelect(key)} type="button"><span className="admin-nav-number">{key === 'json' ? '↯' : String(TABS.indexOf(item) + 1).padStart(2, '0')}</span><span>{item[1]}</span><small>{item[2]}</small></button> : null; })}</div>)}</nav><div className="admin-sidebar-bottom"><a href="/" target="_blank" rel="noreferrer">查看网站 <span>↗</span></a><button type="button" onClick={() => void onLogout()}>退出登录</button></div></aside>;
}

function Inspector({ stats }: { stats: { published: number; projects: number; draft: number; experiences: number; skills: number; media: number } }) {
  return <aside className="admin-inspector" aria-label="工作台概览"><div className="admin-inspector-sticky"><div className="admin-inspector-card admin-inspector-overview"><p className="admin-card-eyebrow">AT A GLANCE</p><h2>站点概览</h2><p>前台展示的是已经发布的内容，草稿修改不会立即影响访客。</p><div className="admin-stat-grid"><div><strong>{stats.published}</strong><span>已发布作品</span></div><div><strong>{stats.draft}</strong><span>当前草稿</span></div><div><strong>{stats.projects}</strong><span>全部作品</span></div><div><strong>{stats.media}</strong><span>媒体引用</span></div></div></div><div className="admin-inspector-card admin-inspector-tip"><span className="admin-tip-mark">✦</span><p className="admin-card-eyebrow">EDITOR NOTE</p><p>作品摘要尽量说清楚“解决了什么问题”，亮点里放可验证的交付和结果。</p></div></div></aside>;
}

function Dashboard({ metrics, stats }: { metrics: MetricsSnapshot; stats: { published: number; projects: number; draft: number; experiences: number; skills: number; media: number } }) {
  const maxViews = Math.max(1, ...metrics.days.map((day) => day.pageViews));
  return <><PageIntro eyebrow="00 / DASHBOARD" title="今天，从这里开始。" description="看一眼内容状态、访问趋势和作品打开排行，再决定要继续编辑、预览，还是发布整站。" /><div className="admin-dashboard-stat-grid"><div><span>作品总数</span><strong>{stats.projects}</strong></div><div><span>已发布</span><strong>{stats.published}</strong></div><div><span>当前草稿</span><strong>{stats.draft}</strong></div><div><span>媒体引用</span><strong>{stats.media}</strong></div></div><EditorCard eyebrow="METRICS / 30 DAYS" title="访问趋势" description="只记录首页访问和作品详情打开，不采集地区、设备或来源。"><div className="admin-metrics-chart" aria-label="最近 30 天页面访问量">{metrics.days.length ? metrics.days.slice().reverse().map((day) => <div className="admin-metric-bar" key={day.date} title={`${day.date}：${day.pageViews} 次访问`}><span style={{ height: `${Math.max(6, (day.pageViews / maxViews) * 100)}%` }} /><small>{day.date.slice(5)}</small></div>) : <div className="admin-empty-state"><span>✦</span><strong>还没有访问数据</strong><small>公开首页被访问后，这里会显示趋势。</small></div>}</div></EditorCard><EditorCard eyebrow="PROJECT / OPENS" title="热门作品" description="按最近 30 天作品详情打开次数排序。"><div className="admin-ranking-list">{metrics.projectRanking.length ? metrics.projectRanking.map((item, index) => <div key={item.projectId}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.projectId}</strong><small>{item.openCount} 次打开</small></div>) : <div className="admin-empty-state"><span>✦</span><strong>还没有作品打开数据</strong><small>访客打开作品详情后会出现在这里。</small></div>}</div></EditorCard></>;
}

function MediaLibrary({ assets, onDelete }: { assets: Array<{ storageKey: string; mime: string; bytes: number; createdAt: string }>; onDelete: (storageKey: string) => Promise<void> }) {
  const mediaURL = (key: string) => key.startsWith('/') ? key : `/media/${key.replace(/^media\//, '')}`;
  return <><PageIntro eyebrow="10 / MEDIA" title="素材，放在合适的位置。" description="按类型查看已上传素材；仍被草稿或公开内容引用的文件会被服务端保护。" /><EditorCard eyebrow="MEDIA / LIBRARY" title={`${assets.length} 个素材`}><div className="admin-media-grid">{assets.length ? assets.map((asset) => <div className="admin-media-item" key={asset.storageKey}>{asset.mime.startsWith('image/') ? <img src={mediaURL(asset.storageKey)} alt="" /> : <div className="admin-media-placeholder">{asset.mime.split('/')[0].toUpperCase()}</div>}<div><strong>{asset.storageKey}</strong><small>{asset.mime} · {Math.round(asset.bytes / 1024)} KB</small><button className="admin-text-button danger" type="button" onClick={() => void onDelete(asset.storageKey)}>删除（检查引用）</button></div></div>) : <div className="admin-empty-state"><span>✦</span><strong>还没有媒体</strong><small>在作品编辑里上传封面或在详情块里引用媒体。</small></div>}</div></EditorCard></>;
}

function ProjectToolbar({ query, setQuery, filter, setFilter, category, setCategory, categories, count }: { query: string; setQuery: (value: string) => void; filter: 'all' | 'published' | 'draft'; setFilter: (value: 'all' | 'published' | 'draft') => void; category: string; setCategory: (value: string) => void; categories: string[]; count: number }) {
  return <><PageIntro eyebrow="01 / PROJECTS" title="让作品自己说明问题。" description="搜索、筛选和编辑公开作品；精选项目会进入前台作品区的主视觉。" /><div className="admin-project-toolbar"><label className="admin-search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、摘要或 slug" /></label><select value={filter} onChange={(event) => setFilter(event.target.value as 'all' | 'published' | 'draft')}><option value="all">全部状态</option><option value="published">已发布</option><option value="draft">草稿</option></select><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">全部分类</option>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select><span>{count} 个结果</span></div></>;
}

function ProjectEditorList({ projects, content, updateContent, onUpload }: { projects: Project[]; content: AdminContent; updateContent: (updater: (current: AdminContent) => AdminContent) => void; onUpload: (file: File | undefined, projectIndex: number) => Promise<void> }) {
  return <><HomeSlotEditor content={content} updateContent={updateContent} /><div className="admin-section-toolbar"><span>{content.projects.length} 个项目 · {content.projects.filter((project) => project.status === 'published').length} 个已发布</span><button className="admin-secondary-button" type="button" onClick={() => updateContent((current) => ({ ...current, projects: [...current.projects, emptyProject()] }))}>＋ 新增项目</button></div><div className="admin-project-list">{projects.map((project) => { const index = content.projects.findIndex((item) => item.id === project.id); return <ProjectEditor key={project.id || index} project={project} index={index} onChange={(next) => updateContent((current) => ({ ...current, projects: current.projects.map((item) => item.id === project.id ? next : item) }))} onDelete={() => updateContent((current) => ({ ...current, projects: current.projects.filter((item) => item.id !== project.id) }))} onUpload={onUpload} />; })}</div></>;
}

function HomeSlotEditor({ content, updateContent }: { content: AdminContent; updateContent: (updater: (current: AdminContent) => AdminContent) => void }) {
  const slots: Array<[HomeSlotKey, string]> = [['featured_1', '主推卡 01'], ['featured_2', '主推卡 02'], ['mini_1', '小卡 01'], ['mini_2', '小卡 02'], ['mini_3', '小卡 03'], ['mini_4', '小卡 04']];
  const published = content.projects.filter((project) => project.status === 'published');
  const assigned = Object.values(content.homeSlots || {}).filter(Boolean);
  return <EditorCard eyebrow="HOME / SIX SLOTS" title="手动安排首页作品" description="主推卡和四张小卡由你明确指定；发布前六个位置都会经过服务端校验。"><div className="admin-slot-grid">{slots.map(([key, label]) => <label className="admin-slot-field" key={key}><span>{label}</span><select value={content.homeSlots?.[key] || ''} onChange={(event) => updateContent((current) => ({ ...current, homeSlots: { featured_1: null, featured_2: null, mini_1: null, mini_2: null, mini_3: null, mini_4: null, ...(current.homeSlots || {}), [key]: event.target.value || null } }))}><option value="">未指定（发布前需补齐）</option>{published.map((project) => <option key={project.id} value={project.id} disabled={assigned.includes(project.id) && content.homeSlots?.[key] !== project.id}>{project.title}</option>)}</select></label>)}</div></EditorCard>;
}

function renderEditor(
  tab: TabKey,
  content: AdminContent,
  updateContent: (updater: (current: AdminContent) => AdminContent) => void,
  updateProfile: (key: keyof AdminContent['profile'], value: string) => void,
  onUpload: (file: File | undefined, projectIndex: number) => Promise<void>,
  jsonDraft: string,
  setJsonDraft: (value: string) => void,
  jsonError: string,
  setJsonError: (value: string) => void,
  setDirty: (value: boolean) => void,
  setNotice: (value: string) => void,
  applyJson: () => void,
) {
  if (tab === 'dashboard') {
    return <><PageIntro eyebrow="00 / DASHBOARD" title="今天，从这里开始。" description="看一眼内容状态，再决定要继续编辑、预览，还是把整站发布出去。" /><EditorCard eyebrow="PUBLISHING / NOW" title="内容发布状态" description="公开页面只读取已发布内容；保存草稿不会打扰访客。"><div className="admin-dashboard-grid"><div><span>当前工作区</span><strong>草稿编辑</strong><small>修改会在停止输入后自动保存。</small></div><div><span>预览入口</span><strong><a href="/admin/preview" target="_blank" rel="noreferrer">打开草稿预览 ↗</a></strong><small>用真实首页场景检查弹层和文本。</small></div><div><span>视觉基线</span><strong>深棕 · 酸橙 · 金色</strong><small>保持现有视频场景和贴纸玻璃卡片。</small></div></div></EditorCard><EditorCard eyebrow="NEXT / ACTION" title="推荐下一步"><div className="admin-dashboard-actions"><button className="admin-secondary-button" type="button" onClick={() => setNotice('请从左侧选择作品管理')}>整理作品</button><button className="admin-secondary-button" type="button" onClick={() => setNotice('请从左侧选择草稿预览')}>检查预览</button><button className="admin-primary-button" type="button" onClick={() => setNotice('确认内容后点击顶部发布')}>准备发布</button></div></EditorCard></>;
  }
  if (tab === 'media') {
    const media = content.projects.filter((project) => project.cover);
    return <><PageIntro eyebrow="10 / MEDIA" title="素材，放在合适的位置。" description="首期媒体库先聚焦作品封面和本地上传；文件路径由服务端 hash 化，不使用原始文件名。" /><EditorCard eyebrow="MEDIA / REFERENCES" title="已引用素材"><div className="admin-media-grid">{media.length ? media.map((project) => <div className="admin-media-item" key={project.id}><img src={project.cover?.startsWith('/') ? project.cover : `/${project.cover}`} alt="" /><div><strong>{project.title}</strong><small>{project.cover}</small></div></div>) : <div className="admin-empty-state"><span>✦</span><strong>还没有引用媒体</strong><small>在作品编辑里上传封面，素材会出现在这里。</small></div>}</div></EditorCard></>;
  }
  if (tab === 'preview') {
    return <><PageIntro eyebrow="11 / PREVIEW" title="先看草稿，再决定发布。" description="预览使用当前草稿数据，并复用前台五段场景和详情弹层。它不会进入公开缓存。" /><EditorCard eyebrow="DRAFT / PREVIEW" title="打开受保护预览"><div className="admin-preview-card"><p>当前草稿：{content.projects.filter((project) => project.status === 'draft').length} 个项目处于草稿状态。</p><a className="admin-primary-button" href="/admin/preview" target="_blank" rel="noreferrer">在新标签页预览 ↗</a></div></EditorCard></>;
  }
  if (tab === 'profile') {
    return <><PageIntro eyebrow="02 / PROFILE" title="你的介绍，从这里开始。" description="前台首屏和联系区域会读取这些信息。保持定位清楚，让访客知道你在解决什么问题。" /><EditorCard eyebrow="PROFILE / IDENTITY" title="个人资料" description="这些字段会出现在前台首页、联系方式和履历入口。"><div className="admin-form-grid"><Field label="姓名" value={content.profile.name} onChange={(value) => updateProfile('name', value)} /><Field label="英文名" value={content.profile.englishName} onChange={(value) => updateProfile('englishName', value)} /><Field label="定位" value={content.profile.positioning} onChange={(value) => updateProfile('positioning', value)} placeholder="AI agent · 产品经理 · 全栈开发" /><Field label="所在地" value={content.profile.location} onChange={(value) => updateProfile('location', value)} placeholder="武汉" /><Field label="邮箱" value={content.profile.email} onChange={(value) => updateProfile('email', value)} type="email" /><Field label="GitHub" value={content.profile.github} onChange={(value) => updateProfile('github', value)} placeholder="https://github.com/..." /><Field label="履历链接" value={content.profile.resumeUrl} onChange={(value) => updateProfile('resumeUrl', value)} placeholder="https://..." /><Field label="品牌名" value={content.profile.brand} onChange={(value) => updateProfile('brand', value)} /><Field label="个人简介" value={content.profile.intro} onChange={(value) => updateProfile('intro', value)} multiline hint="建议用 1—2 句话说明你的方向和做事方式。" /></div></EditorCard></>;
  }

  if (tab === 'settings') {
    const settings = content.settings || {};
    const update = (key: keyof SiteSettings, value: string) => updateContent((current) => ({ ...current, settings: { ...(current.settings || {}), [key]: value } }));
    return <><PageIntro eyebrow="08 / SITE SETTINGS" title="调整网站的语气。" description="控制浏览器标题、首屏文案和页脚信息。这里的文字会决定整个网站的第一印象。" /><EditorCard eyebrow="SITE / VOICE" title="站点文案" description="短句更容易在动态视频上保持清楚的阅读节奏。"><div className="admin-form-grid"><Field label="页面标题" value={settings.title} onChange={(value) => update('title', value)} /><Field label="页面描述" value={settings.description} onChange={(value) => update('description', value)} /><Field label="首屏标题" value={settings.heroHeading} onChange={(value) => update('heroHeading', value)} /><Field label="首屏强调" value={settings.heroEmphasis} onChange={(value) => update('heroEmphasis', value)} /><Field label="首屏副标题" value={settings.heroTagline} onChange={(value) => update('heroTagline', value)} multiline /><Field label="页脚文案" value={settings.footerLine} onChange={(value) => update('footerLine', value)} multiline /><Field label="版权信息" value={settings.copyright} onChange={(value) => update('copyright', value)} /></div></EditorCard></>;
  }

  if (tab === 'projects') return null;

  if (tab === 'experience') {
    return <><PageIntro eyebrow="03 / EXPERIENCE" title="把经历写成可以复盘的路径。" description="时间、角色、产品和交付要一眼可见。每段经历都可以单独更新，不会影响其他栏目。" /><div className="admin-section-toolbar"><span>{content.experience?.length || 0} 段经历</span><button className="admin-secondary-button" type="button" onClick={() => updateContent((current) => ({ ...current, experience: [...(current.experience || []), emptyExperience()] }))}>＋ 新增经历</button></div><div className="admin-stack-list">{(content.experience || []).map((experience, index) => <EditorCard key={`${experience.company}-${index}`} eyebrow={`EXPERIENCE / ${String(index + 1).padStart(2, '0')}`} title={experience.company || '未命名经历'} actions={<button className="admin-text-button danger" type="button" onClick={() => updateContent((current) => ({ ...current, experience: (current.experience || []).filter((_, itemIndex) => itemIndex !== index) }))}>删除</button>}><div className="admin-form-grid"><Field label="公司 / 组织" value={experience.company} onChange={(value) => updateContent((current) => ({ ...current, experience: current.experience?.map((item, itemIndex) => itemIndex === index ? { ...item, company: value } : item) }))} /><Field label="时间" value={experience.period} onChange={(value) => updateContent((current) => ({ ...current, experience: current.experience?.map((item, itemIndex) => itemIndex === index ? { ...item, period: value } : item) }))} placeholder="2025.11 — 2026.04" /><Field label="部门" value={experience.department} onChange={(value) => updateContent((current) => ({ ...current, experience: current.experience?.map((item, itemIndex) => itemIndex === index ? { ...item, department: value } : item) }))} /><Field label="职位" value={experience.role} onChange={(value) => updateContent((current) => ({ ...current, experience: current.experience?.map((item, itemIndex) => itemIndex === index ? { ...item, role: value } : item) }))} /><Field label="产品 / 项目" value={experience.product} onChange={(value) => updateContent((current) => ({ ...current, experience: current.experience?.map((item, itemIndex) => itemIndex === index ? { ...item, product: value } : item) }))} />{Array.isArray(experience.focus) ? <div className="admin-field admin-field-wide"><span>方向标签</span><ArrayEditor items={experience.focus} onChange={(focus) => updateContent((current) => ({ ...current, experience: current.experience?.map((item, itemIndex) => itemIndex === index ? { ...item, focus } : item) }))} placeholder="B 端、中台、多模态" addLabel="添加方向标签" /></div> : <Field label="方向标签" value={experience.focus} onChange={(value) => updateContent((current) => ({ ...current, experience: current.experience?.map((item, itemIndex) => itemIndex === index ? { ...item, focus: value } : item) }))} placeholder="B 端 · 中台" />}<Field label="经历描述" value={experience.description} onChange={(value) => updateContent((current) => ({ ...current, experience: current.experience?.map((item, itemIndex) => itemIndex === index ? { ...item, description: value } : item) }))} multiline /><div className="admin-field admin-field-wide"><span>关键交付 / 结果</span><ArrayEditor items={experience.highlights} onChange={(highlights) => updateContent((current) => ({ ...current, experience: current.experience?.map((item, itemIndex) => itemIndex === index ? { ...item, highlights } : item) }))} placeholder="写一条具体交付、指标或结果" /></div></div></EditorCard>)}</div></>;
  }

  if (tab === 'education') return <CollectionEditor<Education> title="教育经历" eyebrow="04 / EDUCATION" description="学校、专业和时间会出现在前台履历场景。" items={content.education || []} addLabel="新增教育经历" emptyItem={{ school: '中国地质大学（武汉）', major: '', degree: '本科', period: '', ranking: '' }} onChange={(education) => updateContent((current) => ({ ...current, education }))} renderItem={(item, _, onItemChange) => <div className="admin-form-grid"><Field label="学校" value={item.school} onChange={(value) => onItemChange({ ...item, school: value })} /><Field label="时间" value={item.period} onChange={(value) => onItemChange({ ...item, period: value })} /><Field label="专业" value={item.major} onChange={(value) => onItemChange({ ...item, major: value })} /><Field label="学位" value={item.degree} onChange={(value) => onItemChange({ ...item, degree: value })} /><Field label="排名 / 证明" value={item.ranking} onChange={(value) => onItemChange({ ...item, ranking: value })} placeholder="专业前 10%" /></div>} />;
  if (tab === 'campus') return <CollectionEditor<Campus> title="校园经历" eyebrow="05 / CAMPUS" description="补充组织、职责和持续时间，让履历不只停留在岗位名称。" items={content.campus || []} addLabel="新增校园经历" emptyItem={{ period: '', role: '', organization: '', description: '' }} onChange={(campus) => updateContent((current) => ({ ...current, campus }))} renderItem={(item, _, onItemChange) => <div className="admin-form-grid"><Field label="时间" value={item.period} onChange={(value) => onItemChange({ ...item, period: value })} /><Field label="角色" value={item.role} onChange={(value) => onItemChange({ ...item, role: value })} /><Field label="组织" value={item.organization} onChange={(value) => onItemChange({ ...item, organization: value })} /><Field label="经历描述" value={item.description} onChange={(value) => onItemChange({ ...item, description: value })} multiline /></div>} />;
  if (tab === 'honors') return <CollectionEditor<Honor> title="荣誉奖项" eyebrow="06 / HONORS" description="把竞赛、奖项和承担的角色整理成可扫描的列表。" items={content.honors || []} addLabel="新增荣誉" emptyItem={{ name: '', awards: [], role: '' }} onChange={(honors) => updateContent((current) => ({ ...current, honors }))} renderItem={(item, _, onItemChange) => <div className="admin-form-grid"><Field label="赛事 / 荣誉" value={item.name} onChange={(value) => onItemChange({ ...item, name: value })} /><Field label="角色" value={item.role} onChange={(value) => onItemChange({ ...item, role: value })} placeholder="队长" /><div className="admin-field admin-field-wide"><span>奖项</span><ArrayEditor items={item.awards} onChange={(awards) => onItemChange({ ...item, awards })} placeholder="国家一等奖" addLabel="添加奖项" /></div></div>} />;
  if (tab === 'skills') return <CollectionEditor<Skill> title="技能清单" eyebrow="07 / SKILLS" description="按能力领域分组，前台会把它们呈现为工具箱。" items={content.skills || []} addLabel="新增技能组" emptyItem={{ category: '新方向', items: [] }} onChange={(skills) => updateContent((current) => ({ ...current, skills }))} renderItem={(item, _, onItemChange) => <div className="admin-form-grid"><Field label="技能组名称" value={item.category} onChange={(value) => onItemChange({ ...item, category: value })} /><div className="admin-field admin-field-wide"><span>技能条目</span><ArrayEditor items={item.items} onChange={(items) => onItemChange({ ...item, items })} placeholder="例如：Prompt、RAG、Agent" addLabel="添加技能" /></div></div>} />;

  return <><PageIntro eyebrow="09 / ADVANCED JSON" title="直接查看整站数据。" description="这里适合批量修改或处理表单暂未覆盖的字段。应用前会先做结构校验。" /><EditorCard eyebrow="RAW CONTENT" title="JSON 高级编辑" description="编辑完成后点击“应用 JSON”，再保存草稿。"><div className="admin-json-toolbar"><span>{jsonError ? '当前内容有格式问题' : '结构校验已开启'}</span><div><button className="admin-text-button" type="button" onClick={() => { setJsonDraft(JSON.stringify(content, null, 2)); setJsonError(''); setNotice('JSON 已重置'); }}>重置</button><button className="admin-secondary-button" type="button" onClick={applyJson}>应用 JSON</button></div></div><textarea className={`admin-json-editor${jsonError ? ' has-error' : ''}`} value={jsonDraft} onChange={(event) => { setJsonDraft(event.target.value); setJsonError(''); setDirty(true); setNotice('JSON 有未应用修改'); }} spellCheck={false} aria-label="JSON 高级编辑器" />{jsonError ? <p className="admin-json-error" role="alert">{jsonError}</p> : <p className="admin-json-help">提示：应用 JSON 不会自动发布，仍需点击右上角的保存草稿。</p>}</EditorCard></>;
}

function ProjectEditor({ project, index, onChange, onDelete, onUpload }: { project: Project; index: number; onChange: (project: Project) => void; onDelete: () => void; onUpload: (file: File | undefined, projectIndex: number) => Promise<void> }) {
  const set = <K extends keyof Project>(key: K, value: Project[K]) => onChange({ ...project, [key]: value });
  const coverSrc = project.cover && !/^(?:https?:)?\//i.test(project.cover) ? `/${project.cover}` : project.cover;
  const blocks = project.blocks || [];
  const addRichText = () => set('blocks', [...blocks, { id: `text-${Date.now()}`, type: 'rich_text', sortOrder: blocks.length, body: { type: 'doc', content: [{ type: 'paragraph' }] } } as ProjectBlock]);
  const updateBlock = (block: ProjectBlock) => set('blocks', blocks.map((item) => item.id === block.id ? block : item));
  const addMedia = (type: 'image' | 'gallery' | 'video') => set('blocks', [...blocks, type === 'gallery' ? { id: `${type}-${Date.now()}`, type, sortOrder: blocks.length, mediaIds: [] } : { id: `${type}-${Date.now()}`, type, sortOrder: blocks.length, mediaId: '' } as ProjectBlock]);
  const blockEditor = (block: ProjectBlock, blockIndex: number) => <div className="admin-content-block" key={block.id}><div className="admin-content-block-head"><span>{block.type.toUpperCase()} / {String(blockIndex + 1).padStart(2, '0')}</span><button className="admin-text-button danger" type="button" onClick={() => set('blocks', blocks.filter((item) => item.id !== block.id))}>删除</button></div>{block.type === 'rich_text' ? <RichTextBlockEditor block={block} onChange={updateBlock} /> : block.type === 'gallery' ? <Field label="媒体 ID（逗号分隔）" value={block.mediaIds.join(', ')} onChange={(value) => updateBlock({ ...block, mediaIds: value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="uploads/a.png, uploads/b.png" /> : <Field label={block.type === 'video' ? '视频媒体 ID' : '图片媒体 ID'} value={block.mediaId} onChange={(value) => updateBlock({ ...block, mediaId: value })} placeholder="uploads/hashed-file.mp4" />}</div>;
  return <EditorCard eyebrow={`PROJECT / ${String(index + 1).padStart(2, '0')}`} title={project.title || '未命名项目'} tone={project.featured ? 'accent' : 'default'} actions={<div className="admin-card-actions-inline"><Toggle label="精选" checked={Boolean(project.featured)} onChange={(value) => set('featured', value)} /><button className="admin-text-button danger" type="button" onClick={onDelete}>删除</button></div>}><div className="admin-project-meta-row"><span className={`admin-publish-pill ${project.status === 'published' ? 'is-published' : ''}`}>{project.status === 'published' ? '已发布' : '草稿'}</span><span className="admin-project-id">{project.slug || '未设置 slug'}</span><label className="admin-status-select">状态<select aria-label={`${project.title || '项目'} 发布状态`} value={project.status} onChange={(event) => set('status', event.target.value as Project['status'])}><option value="draft">草稿</option><option value="published">发布</option></select></label></div><div className="admin-project-layout"><div className="admin-project-cover">{coverSrc ? <img src={coverSrc} alt="" /> : <div className="admin-project-cover-empty"><span>✦</span><small>NO COVER</small></div>}<label className="admin-cover-button">{project.cover ? '更换封面' : '上传封面'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void onUpload(event.target.files?.[0], index)} /></label></div><div className="admin-form-grid admin-project-fields"><Field label="项目名称" value={project.title} onChange={(value) => set('title', value)} /><Field label="副标题" value={project.subtitle} onChange={(value) => set('subtitle', value)} /><Field label="分类" value={project.category} onChange={(value) => set('category', value)} /><Field label="年份" value={project.year} onChange={(value) => set('year', value)} placeholder="2026" /><Field label="Slug" value={project.slug} onChange={(value) => set('slug', value)} hint="只使用小写字母、数字和短横线。" /><Field label="排序" value={project.sortOrder} onChange={(value) => set('sortOrder', Number(value) || 0)} /><Field label="项目摘要" value={project.summary} onChange={(value) => set('summary', value)} multiline /><Field label="项目描述" value={project.description} onChange={(value) => set('description', value)} multiline /><div className="admin-field admin-field-wide"><span>技术栈</span><ArrayEditor items={project.technologies} onChange={(items) => set('technologies', items)} placeholder="TypeScript、Agent、RAG" addLabel="添加技术" /></div><div className="admin-field admin-field-wide"><span>标签</span><ArrayEditor items={project.tags} onChange={(items) => set("tags", items)} placeholder="AI、RAG、全栈" addLabel="添加标签" /></div><div className="admin-field admin-field-wide"><span>项目流程</span><ArrayEditor items={project.flow} onChange={(items) => set('flow', items)} placeholder="岗位搜索 → 简历准备" addLabel="添加流程节点" /></div><div className="admin-field admin-field-wide"><span>关键亮点 / 指标</span><ArrayEditor items={project.highlights} onChange={(items) => set('highlights', items)} placeholder="写一条具体交付、指标或结果" addLabel="添加亮点" /></div><Field label="源码 / 案例链接" value={project.sourceUrl} onChange={(value) => set('sourceUrl', value)} placeholder="https://..." /><div className="admin-field admin-field-wide"><div className="admin-block-toolbar"><span>详情内容块</span><div className="admin-block-actions"><button className="admin-add-link" type="button" onClick={addRichText}>＋ 文字</button><button className="admin-add-link" type="button" onClick={() => addMedia('image')}>＋ 单图</button><button className="admin-add-link" type="button" onClick={() => addMedia('gallery')}>＋ 图集</button><button className="admin-add-link" type="button" onClick={() => addMedia('video')}>＋ 视频</button></div></div>{blocks.length ? blocks.map(blockEditor) : <small>将文字、单图、图集和视频按顺序组织成作品详情。</small>}</div></div></div></EditorCard>;
}

function CollectionEditor<T>({ title, eyebrow, description, items, emptyItem, addLabel, onChange, renderItem }: { title: string; eyebrow: string; description: string; items: T[]; emptyItem: T; addLabel: string; onChange: (items: T[]) => void; renderItem: (item: T, index: number, onItemChange: (value: T) => void) => ReactNode }) {
  return <><PageIntro eyebrow={eyebrow} title={`${title}，保持清楚。`} description={description} /><div className="admin-section-toolbar"><span>{items.length} 条记录</span><button className="admin-secondary-button" type="button" onClick={() => onChange([...items, structuredClone(emptyItem)])}>＋ {addLabel}</button></div><div className="admin-stack-list">{items.map((item, index) => <EditorCard key={index} eyebrow={`${eyebrow} / ${String(index + 1).padStart(2, '0')}`} title={`${title} ${String(index + 1).padStart(2, '0')}`} actions={<button className="admin-text-button danger" type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>删除</button>}>{renderItem(item, index, (value) => onChange(items.map((current, itemIndex) => itemIndex === index ? value : current)))}</EditorCard>)}</div></>;
}
