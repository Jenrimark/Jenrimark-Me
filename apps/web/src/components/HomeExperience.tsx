'use client';

import { useEffect, useRef, useState } from 'react';
import type { HomeViewModel, Project } from '@jenrimark/content';
import ScenePlayer from './ScenePlayer';
import RichTextContent from './RichTextContent';

const SCENES = [
  { id: 'about', start: 0, end: 10 },
  { id: 'experience', start: 10, end: 15 },
  { id: 'projects', start: 15, end: 22 },
  { id: 'work', start: 22, end: 28 },
  { id: 'contact', start: 28, end: 30.048 },
];
const SCENE_PROGRESS = [0, 0.14, 0.2432, 0.5528, 0.8796, 1];
const SCENE_METER = [0, 14, 24, 55, 87, 100];
const RING_C = 2 * Math.PI * 15.5;
const FIXED_PROFILE_TAGS = ['AI Agent', 'RAG', '电商中台', '0→1 产品', 'Prompt 工程', '多模态交互', '全栈落地', '数据驱动'];

const CONTACT_CARDS: Record<string, { title: string; qr: string }> = {
  qq: { title: 'QQ', qr: '/media/qq-qr.png' },
  wechat: { title: '微信', qr: '/media/wechat-qr.png' },
  douyin: { title: '抖音', qr: '/media/douyin-qr.png' },
};

function ContactCardBox({ card }: { card: { title: string; qr: string } }) {
  return (
    <div className="social-card" role="tooltip">
      <p className="social-card-title">{card.title}</p>
      <img className="social-card-qr" src={card.qr} alt={`${card.title}二维码`} />
    </div>
  );
}


function SocialLinks({ github, className = 'scene-socials' }: { github: string; className?: string }) {
  return (
    <div className={className} aria-label="联系方式">
<div className="scene-social-wrap scene-social-wrap-github"><a className="scene-social scene-social-github" href={github || '#'} target="_blank" rel="noreferrer" title="GitHub" aria-label="GitHub"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12c0 5.303 3.438 9.8 8.205 11.385c.6.113.82-.258.82-.577c0-.285-.01-1.04-.015-2.04c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729c1.205.084 1.838 1.236 1.838 1.236c1.07 1.835 2.809 1.305 3.495.998c.108-.776.417-1.305.76-1.605c-2.665-.3-5.466-1.332-5.466-5.93c0-1.31.465-2.38 1.235-3.22c-.135-.303-.54-1.523.105-3.176c0 0 1.005-.322 3.3 1.23c.96-.267 1.98-.399 3-.405c1.02.006 2.04.138 3 .405c2.28-1.552 3.285-1.23 3.285-1.23c.645 1.653.24 2.873.12 3.176c.765.84 1.23 1.91 1.23 3.22c0 4.61-2.805 5.625-5.475 5.92c.42.36.81 1.096.81 2.22c0 1.606-.015 2.896-.015 3.286c0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg></a></div><div className="scene-social-wrap scene-social-wrap-email"><a className="scene-social scene-social-email" href="mailto:jenrimark@gmail.com,2303532728@qq.com" target="_blank" rel="noreferrer" title="邮箱" aria-label="邮箱"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg></a></div><div className="scene-social-wrap scene-social-wrap-qq"><button className="scene-social scene-social-qq" type="button" title="QQ" aria-label="QQ"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673c.54.065 2.103-2.472 2.103-2.472c0 1.469.756 3.387 2.394 4.771c-.612.188-1.363.479-1.845.835c-.434.32-.379.646-.301.778c.343.578 5.883.369 7.482.189c1.6.18 7.14.389 7.483-.189c.078-.132.132-.458-.301-.778c-.483-.356-1.233-.646-1.846-.836c1.637-1.384 2.393-3.302 2.393-4.771c0 0 1.563 2.537 2.103 2.472c.251-.03.581-1.39-.438-4.673"/></svg></button><ContactCardBox card={CONTACT_CARDS.qq} /></div><div className="scene-social-wrap scene-social-wrap-wechat"><button className="scene-social scene-social-wechat" type="button" title="微信" aria-label="微信"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213c0 .163.13.295.29.295a.33.33 0 0 0 .167-.054l1.903-1.114a.86.86 0 0 1 .717-.098a10.2 10.2 0 0 0 2.837.403c.276 0 .543-.027.811-.05c-.857-2.578.157-4.972 1.932-6.446c1.703-1.415 3.882-1.98 5.853-1.838c-.576-3.583-4.196-6.348-8.596-6.348M5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178a1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18m5.34 2.867c-1.797-.052-3.746.512-5.28 1.786c-1.72 1.428-2.687 3.72-1.78 6.22c.942 2.453 3.666 4.229 6.884 4.229c.826 0 1.622-.12 2.361-.336a.72.72 0 0 1 .598.082l1.584.926a.3.3 0 0 0 .14.047c.134 0 .24-.111.24-.247c0-.06-.023-.12-.038-.177l-.327-1.233a.6.6 0 0 1-.023-.156a.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983a.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983a.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982"/></svg></button><ContactCardBox card={CONTACT_CARDS.wechat} /></div><div className="scene-social-wrap scene-social-wrap-douyin"><button className="scene-social scene-social-douyin" type="button" title="抖音" aria-label="抖音"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02c.08 1.53.63 3.09 1.75 4.17c1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97c-.57-.26-1.1-.59-1.62-.93c-.01 2.92.01 5.84-.02 8.75c-.08 1.4-.54 2.79-1.35 3.94c-1.31 1.92-3.58 3.17-5.91 3.21c-1.43.08-2.86-.31-4.08-1.03c-2.02-1.19-3.44-3.37-3.65-5.71c-.02-.5-.03-1-.01-1.49c.18-1.9 1.12-3.72 2.58-4.96c1.66-1.44 3.98-2.13 6.15-1.72c.02 1.48-.04 2.96-.04 4.44c-.99-.32-2.15-.23-3.02.37c-.63.41-1.11 1.04-1.36 1.75c-.21.51-.15 1.07-.14 1.61c.24 1.64 1.82 3.02 3.5 2.87c1.12-.01 2.19-.66 2.77-1.61c.19-.33.4-.67.41-1.06c.1-1.79.06-3.57.07-5.36c.01-4.03-.01-8.05.02-12.07"/></svg></button><ContactCardBox card={CONTACT_CARDS.douyin} /></div><div className="scene-social-wrap scene-social-wrap-afdian"><a className="scene-social scene-social-afdian" href="https://ifdian.net/a/jenrimark" target="_blank" rel="noreferrer" title="爱发电" aria-label="爱发电"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.00 2.93C5.45 2.93 6.24 2.95 6.60 3.07C6.96 3.19 7.05 3.42 7.13 3.67C7.21 3.92 7.15 4.37 7.07 4.60C6.99 4.83 6.83 4.95 6.67 5.07C6.51 5.19 6.21 5.26 6.13 5.33C6.05 5.40 5.46 5.48 6.20 5.47C6.95 5.46 9.17 5.28 10.60 5.27C12.03 5.26 13.86 5.32 14.80 5.40C15.75 5.48 15.80 5.59 16.27 5.73C16.74 5.88 17.06 5.97 17.60 6.27C18.14 6.57 18.96 7.06 19.53 7.53C20.10 8.00 20.66 8.68 21.00 9.07C21.34 9.46 21.41 9.55 21.60 9.87C21.79 10.19 22.01 10.62 22.13 11.00C22.25 11.38 22.30 11.72 22.33 12.13C22.36 12.54 22.38 12.99 22.33 13.47C22.27 13.95 21.92 14.69 22.00 15.00C22.08 15.31 22.55 15.15 22.80 15.33C23.05 15.51 23.35 15.74 23.47 16.07C23.59 16.40 23.55 17.04 23.53 17.33C23.51 17.62 23.44 17.66 23.33 17.80C23.22 17.95 23.05 18.10 22.87 18.20C22.69 18.30 22.56 18.37 22.27 18.40C21.98 18.43 21.44 18.43 21.13 18.40C20.82 18.37 20.61 18.12 20.40 18.20C20.19 18.28 20.18 18.60 19.87 18.87C19.56 19.14 19.02 19.53 18.53 19.80C18.04 20.07 17.53 20.28 16.93 20.47C16.33 20.66 15.73 20.84 14.93 20.93C14.13 21.02 12.95 21.03 12.13 21.00C11.31 20.97 10.69 20.88 10.00 20.73C9.31 20.59 8.64 20.42 8.00 20.13C7.36 19.84 6.60 19.37 6.13 19.00C5.66 18.63 5.42 18.25 5.20 17.93C4.98 17.61 4.87 17.67 4.80 17.07C4.73 16.47 4.71 14.93 4.80 14.33C4.89 13.73 5.01 13.83 5.33 13.47C5.65 13.12 6.53 12.48 6.73 12.20C6.93 11.92 6.56 12.03 6.53 11.80C6.50 11.57 6.40 11.10 6.53 10.80C6.66 10.50 7.63 10.21 7.33 10.00C7.03 9.79 5.56 9.75 4.73 9.53C3.90 9.31 2.97 9.01 2.33 8.67C1.69 8.33 1.19 7.83 0.87 7.47C0.55 7.11 0.47 6.91 0.40 6.53C0.33 6.15 0.41 5.51 0.47 5.20C0.52 4.89 0.61 4.84 0.73 4.67C0.85 4.50 0.87 4.41 1.20 4.20C1.53 3.99 2.27 3.59 2.73 3.40C3.19 3.21 3.55 3.15 3.93 3.07C4.31 2.99 4.55 2.93 5.00 2.93ZM3.67 6.93C2.67 6.92 3.20 6.91 3.27 7.00C3.34 7.09 3.77 7.34 4.07 7.47C4.37 7.60 4.37 7.63 5.07 7.80C5.77 7.97 7.34 8.32 8.27 8.47C9.20 8.62 10.19 8.64 10.67 8.73C11.15 8.82 11.00 8.97 11.13 9.00C11.26 9.03 11.15 9.11 11.47 8.93C11.79 8.75 12.67 8.08 13.07 7.93C13.47 7.77 13.68 7.93 13.87 8.00C14.06 8.07 14.14 8.13 14.20 8.33C14.25 8.53 14.22 9.01 14.20 9.20C14.18 9.39 14.93 8.89 14.07 9.47C13.21 10.05 10.10 11.96 9.07 12.67C8.04 13.38 8.12 13.54 7.87 13.73C7.62 13.92 7.81 13.61 7.60 13.80C7.39 13.99 6.80 14.61 6.60 14.87C6.40 15.12 6.43 15.13 6.40 15.33C6.37 15.53 6.37 15.85 6.40 16.07C6.43 16.29 6.37 16.36 6.60 16.67C6.83 16.98 7.41 17.62 7.80 17.93C8.19 18.24 8.43 18.33 8.93 18.53C9.43 18.73 10.01 19.00 10.80 19.13C11.59 19.26 13.00 19.32 13.67 19.33C14.34 19.34 14.26 19.33 14.80 19.20C15.34 19.07 16.27 18.84 16.93 18.53C17.59 18.22 18.44 17.68 18.73 17.33C19.02 16.97 18.60 16.62 18.67 16.40C18.74 16.18 19.09 16.11 19.13 16.00C19.17 15.89 18.96 15.92 18.93 15.73C18.90 15.54 18.86 15.08 18.93 14.87C19.00 14.66 19.10 14.55 19.33 14.47C19.56 14.39 20.12 14.56 20.33 14.40C20.54 14.24 20.54 13.86 20.60 13.53C20.66 13.20 20.70 12.73 20.67 12.40C20.64 12.07 20.56 11.85 20.40 11.53C20.24 11.21 20.18 10.98 19.73 10.47C19.29 9.96 18.35 8.96 17.73 8.47C17.11 7.98 16.73 7.79 16.00 7.53C15.27 7.27 14.45 7.01 13.33 6.93C12.21 6.85 10.88 7.07 9.27 7.07C7.66 7.07 4.67 6.94 3.67 6.93ZM8.67 13.80C8.90 13.73 9.50 13.73 9.73 13.80C9.96 13.87 10.01 13.99 10.07 14.20C10.13 14.41 10.13 14.86 10.07 15.07C10.01 15.28 9.94 15.39 9.73 15.47C9.52 15.55 9.02 15.57 8.80 15.53C8.58 15.48 8.48 15.42 8.40 15.20C8.32 14.98 8.29 14.43 8.33 14.20C8.38 13.97 8.44 13.87 8.67 13.80ZM13.73 15.33C13.96 15.24 14.52 15.29 14.73 15.33C14.94 15.38 14.94 15.38 15.00 15.60C15.06 15.82 15.10 16.44 15.07 16.67C15.04 16.90 15.01 16.93 14.80 17.00C14.59 17.07 14.02 17.10 13.80 17.07C13.58 17.04 13.55 17.00 13.47 16.80C13.39 16.60 13.29 16.11 13.33 15.87C13.37 15.62 13.50 15.42 13.73 15.33Z" /></svg></a></div>
    </div>
  );
}

function mediaURL(value: string): string {
  if (/^(?:https?:)?\/\//i.test(value)) return value;
  if (value.startsWith('/media/')) return value;
  if (value.startsWith('media/')) return `/${value}`;
  return `/media/${value.replace(/^\//, '')}`;
}

function meterPercent(progress: number): number {
  const p = Math.max(0, Math.min(1, progress || 0));
  for (let index = 1; index < SCENE_PROGRESS.length; index += 1) {
    if (p <= SCENE_PROGRESS[index]) {
      const p0 = SCENE_PROGRESS[index - 1];
      const p1 = SCENE_PROGRESS[index];
      const t = p1 === p0 ? 1 : (p - p0) / (p1 - p0);
      return Math.max(0, Math.min(100, Math.floor(SCENE_METER[index - 1] + (SCENE_METER[index] - SCENE_METER[index - 1]) * t + 1e-9)));
    }
  }
  return 100;
}

export default function HomeExperience({ content, trackMetrics = true }: { content: HomeViewModel; trackMetrics?: boolean }) {
  const [activeScene, setActiveScene] = useState('about');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const friendsRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const meterValueRef = useRef<HTMLSpanElement>(null);
  const activeSceneRef = useRef('about');
  const copyFadeTimerRef = useRef(0);
  const featuredProjects = content.featuredProjects.length ? content.featuredProjects : content.projects.slice(0, 2);
  const miniProjects = content.miniProjects.length ? content.miniProjects : content.projects.slice(2, 6);
  const education = content.education[0];
  const friends = content.friends || [];
  const openProject = (project: Project) => {
    setSelectedProject(project);
    if (trackMetrics) void fetch('/api/public/metrics/project-open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id }) }).catch(() => undefined);
  };

  useEffect(() => {
    if (!friendsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (friendsRef.current && !friendsRef.current.contains(event.target as Node)) setFriendsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFriendsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [friendsOpen]);

  const modalOpen = Boolean(selectedProject || resumeOpen || friendsOpen);
  useEffect(() => {
    document.body.classList.toggle('modal-open', modalOpen);
    if (modalOpen) window.dispatchEvent(new Event('portfolio:modal-open'));
    else window.dispatchEvent(new Event('portfolio:modal-close'));
    return () => {
      document.body.classList.remove('modal-open');
      window.dispatchEvent(new Event('portfolio:modal-close'));
    };
  }, [modalOpen]);

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.site-header nav a'));
    const sections = navLinks.map((link) => document.querySelector(link.getAttribute('href') || '')).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
    }), { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
    sections.forEach((section) => observer.observe(section));
    const anchorHandler = (event: Event) => {
      const link = event.currentTarget as HTMLAnchorElement;
      const href = link.getAttribute('href');
      if (!href || href === '#' || !href.startsWith('#')) return;
      const target = document.getElementById(href.slice(1));
      if (!target) return;
      event.preventDefault();
      const storySpacers = Array.from(document.querySelectorAll<HTMLElement>('.scene-spacers .scene-spacer'));
      const storyPageIndex = storySpacers.indexOf(target);
      const videoMode = document.documentElement.classList.contains('story-video-mode');
      const snapMode = document.documentElement.classList.contains('scene-snap-enabled');
      if (storyPageIndex >= 0 && (snapMode || videoMode)) {
        window.dispatchEvent(new CustomEvent('story:navigate', { detail: { page: storyPageIndex } }));
        history.replaceState(null, '', href);
        return;
      }
      target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', href);
    };
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
    anchors.forEach((anchor) => anchor.addEventListener('click', anchorHandler));
    const applyScene = (id: string) => {
      if (activeSceneRef.current !== id) {
        const source = document.querySelector<HTMLElement>('#scene-copy');
        if (source && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const leaving = source.cloneNode(true) as HTMLElement;
          leaving.id = '';
          leaving.classList.add('scene-copy-clone');
          leaving.setAttribute('aria-hidden', 'true');
          source.parentElement?.appendChild(leaving);
          requestAnimationFrame(() => leaving.classList.add('is-fading'));
          window.clearTimeout(copyFadeTimerRef.current);
          copyFadeTimerRef.current = window.setTimeout(() => leaving.remove(), 220);
        }
        activeSceneRef.current = id;
        setActiveScene(id);
      }
      document.querySelector('#portal-dock')?.classList.toggle('is-expanded', id === 'about' || id === 'contact');
      document.querySelector('.site-footer')?.classList.toggle('is-visible', id === 'contact');
    };
    const update = (progress?: number) => {
      const root = (document.querySelector('#scene-scroll') || document.documentElement) as HTMLElement;
      const value = typeof progress === 'number' ? progress : Math.max(0, Math.min(1, scrollY / Math.max(1, root.offsetHeight - innerHeight)));
      const nextMeter = meterPercent(value);
      // A5: 逐帧进度直写 DOM，不进 state，避免每帧 reconcile 重渲染
      if (ringRef.current) ringRef.current.style.strokeDashoffset = `${RING_C * (1 - nextMeter / 100)}`;
      if (meterValueRef.current) {
        meterValueRef.current.textContent = String(nextMeter);
        meterValueRef.current.parentElement?.setAttribute('aria-label', `页面滚动进度 ${nextMeter}`);
      }
    };
    const progressHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ progress: number; time: number; page?: number; phase?: string }>).detail;
      const scene = typeof detail.page === 'number' ? SCENES[detail.page] : SCENES.find((item) => detail.time >= item.start && detail.time < item.end);
      applyScene(scene?.id || 'contact');
      update(detail.progress);
    };
    document.addEventListener('v4sceneprogress', progressHandler);
    if (trackMetrics) void fetch('/api/public/metrics/page-view', { method: 'POST' }).catch(() => undefined);
    if (ringRef.current) { ringRef.current.style.strokeDasharray = `${RING_C}`; ringRef.current.style.strokeDashoffset = `${RING_C}`; }
    update(0);
    return () => {
      observer.disconnect();
      anchors.forEach((anchor) => anchor.removeEventListener('click', anchorHandler));
      document.removeEventListener('v4sceneprogress', progressHandler);
      window.clearTimeout(copyFadeTimerRef.current);
    };
  }, [trackMetrics]);

  useEffect(() => {
    if (!selectedProject && !resumeOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelectedProject(null); setResumeOpen(false); } };
    addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; removeEventListener('keydown', closeOnEscape); };
  }, [selectedProject, resumeOpen]);

  const closeModal = () => { setSelectedProject(null); setResumeOpen(false); };

  return <main id="scene-scroll" className="site-shell">
    <ScenePlayer
      mode={content.scene?.mode ?? 'video'}
      framesConfig={content.scene?.mode === 'frames' ? { budgetUrl: content.scene.budgetUrl, framesDir: content.scene.framesDir } : undefined}
      specConfig={content.scene && content.scene.mode === 'spec' ? { budgetUrl: content.scene.budgetUrl, framesDir: content.scene.framesDir, specUrl: content.scene.specUrl } : undefined}
      storyConfig={content.scene && content.scene.mode === 'story' ? { framesDir: content.scene.framesDir, specUrl: content.scene.specUrl } : undefined}
    />
    <header className="site-header">
      <a className="brand" href="#about" aria-label="Jenrimark 尚礼"><img src="/icons/brand-signature.svg" alt="Jenrimark 尚礼" width="1690" height="415" /></a>
      <nav aria-label="页面导航"><a href="#about">01 <b>初次见面</b></a><a href="#experience">02 <b>学履</b></a><a href="#projects">03 <b>工作</b></a><a href="#work">04 <b>作品集</b></a><a href="#contact">05 <b>认识一下</b></a></nav>
      <div className="header-actions"><div className="header-scroll-meter" id="scroll-meter" role="img" aria-label="页面滚动进度"><svg className="header-scroll-ring" viewBox="0 0 36 36" aria-hidden="true"><circle className="header-scroll-ring-track" cx="18" cy="18" r="15.5" /><circle className="header-scroll-ring-fill" cx="18" cy="18" r="15.5" ref={ringRef} /></svg><span className="header-scroll-value" ref={meterValueRef}>0</span></div></div>
    </header>
    <nav id="portal-dock" className="portal-dock" aria-label="个人门户"><p className="portal-dock-title">MY LITTLE PORTALS <span>↘</span></p><a className="portal-link portal-link-search" href="https://view.jenrimark.cn" target="_blank" rel="noreferrer" aria-label="聚合引擎"><span className="portal-icon">⌕</span><span>聚合引擎</span><small>探索</small></a><a className="portal-link portal-link-work" href="#work" aria-label="作品集"><span className="portal-icon">✦</span><span>作品集</span><small>项目</small></a><a className="portal-link portal-link-contact" href="#" onClick={(event) => { event.preventDefault(); setFriendsOpen(true); }} aria-label="友链"><span className="portal-icon">☺</span><span>友链</span><small>好友</small></a><a className="portal-link portal-link-resume" href={content.profile.resumeUrl || '#contact'} target={content.profile.resumeUrl ? '_blank' : undefined} rel="noreferrer" aria-label="履历书"><span className="portal-icon">▤</span><span>履历书</span><small>经历</small></a><a className="portal-link portal-link-notes" href="https://fcn9od35aepq.feishu.cn/wiki/R1R3wPuzTioFtNkOnELcUJJLnBh?from=from_copylink" target="_blank" rel="noreferrer" aria-label="知识库"><span className="portal-icon">✎</span><span>知识库</span><small>笔记</small></a><a className="portal-link portal-link-github" href={content.profile.github || 'https://github.com/Jenrimark'} target="_blank" rel="noreferrer" aria-label="GitHub"><span className="portal-icon"><svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg></span><span>GitHub</span><small>代码</small></a></nav>
    <div className="home-socials" data-scene="about" hidden={activeScene !== 'about'} aria-label="首页联系方式"><SocialLinks github={content.profile.github || '#'} className="home-socials-row" /></div>
    <div id="scene-copy" className="scene-copy" data-scene={activeScene} aria-live="polite">
      <section className="scene-panel" data-scene="about" hidden={activeScene !== 'about'}><h1>Hello,I&apos;m</h1><div className="scene-identity"><p className="scene-identity-name">{content.profile.name}</p><p className="scene-identity-role">{content.profile.positioning || 'AI agent · 产品经理 · 全栈开发'}</p><ul className="scene-identity-tags" aria-label="个人标签">{FIXED_PROFILE_TAGS.map((tag) => <li key={tag}>{tag}</li>)}</ul></div></section>
      <section className="scene-panel" data-scene="experience" hidden={activeScene !== 'experience'}><h1>LEARN.</h1><p className="scene-copy-sub">教育经历&荣誉</p><div className="scene-record" aria-label="教育经历"><p className="scene-record-index">01</p><div className="scene-record-body"><p className="scene-record-period">{education?.period || '2023.09 — 2027.06'}</p><h2 className="scene-record-title">{education?.school || '中国地质大学（武汉）'}</h2><p className="scene-record-meta">{education?.major || '软件工程'} · {education?.degree || '本科'}</p><div className="scene-record-tags"><span>{education?.ranking || '专业前 10%'}</span><span>{education?.major || '软件工程'}</span><span>27 届</span></div><p className="scene-record-line">{content.profile.intro || '主修软件工程，把系统、算法与产品设计，连成同一条线。'}</p></div></div></section>
      <section className="scene-panel" data-scene="projects" hidden={activeScene !== 'projects'}><h1>PRACTICE.</h1><p className="scene-copy-sub">工作&实习经历</p><div className="scene-jobs" aria-label="工作经历">{content.experience.slice(0, 2).map((experience, index) => <article className="scene-job" key={`${experience.company}-${index}`}><p className="scene-job-index">{String(index + 1).padStart(2, '0')}</p><div className="scene-job-body"><p className="scene-job-period">{experience.period}</p><h2 className="scene-job-company">{experience.company}</h2><p className="scene-job-meta">{experience.department} · {experience.role}</p><p className="scene-job-product">{experience.product}</p><p className="scene-job-line">{experience.description}</p><p className="scene-job-points">{experience.highlights?.join(' · ')}</p></div></article>)}</div></section>
      <section className="scene-panel" data-scene="work" hidden={activeScene !== 'work'}><div className="work-board"><div className="work-board-main"><div className="work-board-head"><div className="work-board-title"><h1>THE WORK.</h1><p className="scene-copy-sub">我的项目&作品集</p></div><button className="work-more" type="button" onClick={() => content.projects[0] && openProject(content.projects[0])}>查看更多<span>›</span></button></div><div className="work-board-featured" aria-label="主推作品">{featuredProjects.map((project) => <button className="work-feature" type="button" key={project.id} onClick={() => openProject(project)}><p className="work-feature-tag">{project.category || 'PROJECT'} · {project.technologies?.[0] || 'AI'}</p><h2>{project.title}</h2><p className="work-feature-sub">{project.subtitle}</p><p className="work-feature-line">{project.summary}</p><p className="work-feature-path">{project.flow?.join(' → ')}</p><p className="work-feature-tech">{project.technologies?.join(' · ')}</p></button>)}</div></div><div className="work-board-minis" aria-label="其他作品">{miniProjects.map((project) => <button className="work-mini" type="button" key={project.id} onClick={() => openProject(project)}><p className="work-mini-tag">{project.category || 'PROJECT'}</p><h2>{project.title}</h2><p className="work-mini-sub">{project.subtitle}</p><p className="work-mini-line">{project.summary}</p></button>)}</div></div></section>
      <section className="scene-panel" data-scene="contact" hidden={activeScene !== 'contact'}><h1>LET&apos;S<br />TALK.</h1><p className="scene-copy-sub">下一个好想法，也许从<br />你好开始</p><SocialLinks github={content.profile.github || '#'} /></section>
    </div>
    <div className="page-content scene-spacers" aria-hidden="true"><div id="about" className="scene-spacer" /><div id="experience" className="scene-spacer" /><div id="projects" className="scene-spacer" /><div id="work" className="scene-spacer" /><div id="contact" className="scene-spacer" /></div>
    <footer className="site-footer"><div className="site-footer-row"><span className="site-footer-item">Design &amp; Build with ❤ by {content.profile.englishName || 'Jenrimark'}</span><span className="site-footer-sep">·</span><span className="site-footer-item">{content.settings?.copyright || 'Copyright © 2026 吴汉东'}</span><span className="site-footer-sep">·</span><span className="site-footer-item">CC BY-NC-SA 4.0</span><span className="site-footer-sep">·</span><span className="site-footer-item">蜀ICP备 2026055157 号</span><span className="site-footer-sep">·</span><span className="site-footer-item">鄂公网安备 42018502009413 号</span></div></footer>
    {friendsOpen && <div className="content-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setFriendsOpen(false); }}><section className="content-modal friends-modal" data-lenis-prevent ref={friendsRef} role="dialog" aria-modal="true" aria-label="友情链接"><button className="content-modal-close" type="button" onClick={() => setFriendsOpen(false)} aria-label="关闭友链">×</button><p className="content-modal-kicker">FRIENDS / 友链</p><h2>友情链接</h2><p className="content-modal-summary">这里放一些常去的站点，后续会接接口维护。</p><ul className="friends-modal-list">{friends.map((friend) => <li key={friend.url}><a href={friend.url} target="_blank" rel="noreferrer"><strong>{friend.name}</strong>{friend.description ? <small>{friend.description}</small> : null}<span>↗</span></a></li>)}</ul></section></div>}
    {(selectedProject || resumeOpen) && <div className="content-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeModal(); }}><section className="content-modal" data-lenis-prevent role="dialog" aria-modal="true" aria-label={selectedProject ? `${selectedProject.title} 作品详情` : '履历详情'}><button className="content-modal-close" type="button" onClick={closeModal} aria-label="关闭详情">×</button>{selectedProject ? <><p className="content-modal-kicker">{selectedProject.category || 'PROJECT'} · {selectedProject.year || 'CASE STUDY'}</p><h2>{selectedProject.title}</h2><p className="content-modal-subtitle">{selectedProject.subtitle}</p><p className="content-modal-summary">{selectedProject.description || selectedProject.summary}</p>{selectedProject.blocks?.map((block) => block.type === 'rich_text' ? <RichTextContent key={block.id} body={block.body} /> : block.type === 'image' ? <figure className="content-modal-media" key={block.id}><img src={mediaURL(block.mediaId)} alt={block.alt || ''} /><figcaption>{block.caption}</figcaption></figure> : block.type === 'gallery' ? <div className="content-modal-gallery" key={block.id}>{block.mediaIds.map((mediaId) => <img key={mediaId} src={mediaURL(mediaId)} alt="" />)}</div> : <figure className="content-modal-media" key={block.id}><video src={mediaURL(block.mediaId)} controls playsInline preload="metadata" /><figcaption>{block.caption}</figcaption></figure>)}{selectedProject.flow?.length ? <div className="content-modal-flow">{selectedProject.flow.map((step) => <span key={step}>{step}</span>)}</div> : null}{selectedProject.highlights?.length ? <ul>{selectedProject.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}{selectedProject.sourceUrl ? <a href={selectedProject.sourceUrl} target="_blank" rel="noreferrer">打开项目链接 ↗</a> : null}</> : <><p className="content-modal-kicker">RESUME / PROFILE</p><h2>{content.profile.name} · {content.profile.englishName}</h2><p className="content-modal-summary">{content.profile.intro}</p><div className="content-modal-resume-grid"><div><span>教育</span><strong>{education?.school}</strong><small>{education?.major} · {education?.period}</small></div><div><span>经历</span><strong>{content.experience.length} 段</strong><small>{content.experience.map((item) => item.company).join(' / ')}</small></div><div><span>技能</span><strong>{content.skills.reduce((sum, item) => sum + item.items.length, 0)} 项</strong><small>{content.skills.map((item) => item.category).join(' · ')}</small></div></div>{content.profile.resumeUrl ? <a href={content.profile.resumeUrl} target="_blank" rel="noreferrer">查看完整履历 ↗</a> : null}</>}</section></div>}
  </main>;
}
