'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type SiteContent = {
  profile: { name: string; email?: string; github?: string; intro?: string };
  education?: unknown[];
  experience?: unknown[];
  projects: Array<{
    id: string;
    slug: string;
    title: string;
    status: string;
    summary?: string;
    category?: string;
  }>;
  honors?: unknown[];
  skills?: unknown[];
  settings?: Record<string, string>;
  campus?: unknown[];
};

const api = {
  async login(password: string) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '登录失败');
    return res.json();
  },
  async logout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  },
  async getContent() {
    const res = await fetch('/api/content', { credentials: 'include' });
    if (!res.ok) throw new Error('请先登录');
    return res.json();
  },
  async saveContent(content: SiteContent) {
    const res = await fetch('/api/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content }),
    });
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
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ data }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '上传失败');
    return res.json();
  },
};

const TABS = [
  ['projects', '作品管理'],
  ['profile', '个人资料'],
  ['experience', '实习经历'],
  ['education', '教育经历'],
  ['campus', '校园经历'],
  ['honors', '荣誉奖项'],
  ['skills', '技能清单'],
  ['settings', '站点设置'],
] as const;

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [content, setContent] = useState<SiteContent | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('projects');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getContent();
      setContent(data.content ?? data);
      setAuthed(true);
    } catch {
      setAuthed(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.login(password);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    }
  };

  const onSave = async () => {
    if (!content) return;
    setBusy(true);
    setError('');
    try {
      await api.saveContent(content);
      setNotice('草稿已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.publish();
      setNotice(result.message || `已发布 ${result.projects ?? ''} 个项目`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败');
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await api.upload(file);
      setNotice(`已上传：${result.url}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setBusy(false);
    }
  };

  if (!authed) {
    return (
      <section className="login">
        <div className="login-card">
          <span className="brand">jenrimark / studio</span>
          <h1>让作品继续生长。</h1>
          <p>登录内容工作台，编辑作品、履历与站点信息。</p>
          <form onSubmit={onLogin}>
            <label>
              管理密码
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button type="submit">进入工作台 →</button>
          </form>
          <p id="login-error" role="alert">
            {error}
          </p>
          <a href="/">← 返回网站</a>
        </div>
      </section>
    );
  }

  return (
    <div id="studio">
      <aside>
        <a className="brand" href="/" target="_blank" rel="noreferrer">
          jenrimark<span>内容工作台</span>
        </a>
        <nav aria-label="内容分类">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'selected' : ''}
              onClick={() => setTab(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="aside-bottom">
          <a href="/" target="_blank" rel="noreferrer">
            查看网站 ↗
          </a>
          <button
            id="logout"
            type="button"
            onClick={async () => {
              await api.logout();
              setAuthed(false);
            }}
          >
            退出登录
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">YOUR WORK, YOUR WORDS.</span>
            <h1>{TABS.find(([k]) => k === tab)?.[1]}</h1>
          </div>
          <div className="actions">
            <button type="button" onClick={onSave} disabled={busy}>
              保存草稿
            </button>
            <button className="primary" type="button" onClick={onPublish} disabled={busy}>
              发布
            </button>
            <label className="upload-btn">
              上传封面
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => void onUpload(e.target.files?.[0])}
              />
            </label>
          </div>
        </header>
        <p id="notice" role="status">
          {notice || '修改后先保存草稿，满意后发布。草稿不会出现在正式网站。'}
          {error ? ` · ${error}` : ''}
        </p>
        <div id="editor">
          {!content ? (
            <p>加载中…</p>
          ) : (
            <textarea
              value={JSON.stringify(content[tab as keyof SiteContent] ?? content, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  setContent({ ...content, [tab]: parsed });
                  setError('');
                } catch {
                  setError('JSON 格式无效');
                }
              }}
              style={{ width: '100%', minHeight: '50vh', fontFamily: 'ui-monospace, monospace' }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
