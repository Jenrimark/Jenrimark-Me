'use client';

import { useEffect, useRef, useState } from 'react';
import ScenePlayer from './ScenePlayer';

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

function meterPercent(progress: number): number {
  const p = Math.max(0, Math.min(1, progress || 0));
  for (let i = 1; i < SCENE_PROGRESS.length; i += 1) {
    if (p <= SCENE_PROGRESS[i]) {
      const p0 = SCENE_PROGRESS[i - 1];
      const p1 = SCENE_PROGRESS[i];
      const m0 = SCENE_METER[i - 1];
      const m1 = SCENE_METER[i];
      const t = p1 === p0 ? 1 : (p - p0) / (p1 - p0);
      return Math.max(0, Math.min(100, Math.floor(m0 + (m1 - m0) * t + 1e-9)));
    }
  }
  return 100;
}

export default function HomeExperience() {
  const [activeScene, setActiveScene] = useState('about');
  const [meter, setMeter] = useState(0);
  const ringRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.site-header nav a'));
    const sectionById = navLinks
      .map((link) => document.querySelector(link.getAttribute('href') || ''))
      .filter(Boolean) as HTMLElement[];
    const navObserver = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            navLinks.forEach((link) =>
              link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`),
            );
          }
        }),
      { rootMargin: '-35% 0px -55% 0px', threshold: 0 },
    );
    sectionById.forEach((section) => navObserver.observe(section));

    const onAnchorClick = (event: Event) => {
      const link = event.currentTarget as HTMLAnchorElement;
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      const target = document.querySelector(href);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      history.replaceState(null, '', href);
    };
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
    anchors.forEach((a) => a.addEventListener('click', onAnchorClick));

    const portalDock = document.querySelector('#portal-dock');
    const siteFooter = document.querySelector('.site-footer');

    const applyScene = (id: string) => {
      setActiveScene(id);
      portalDock?.classList.toggle('is-expanded', id === 'about' || id === 'contact');
      siteFooter?.classList.toggle('is-visible', id === 'contact');
      document.querySelectorAll('.chapter').forEach((section) => {
        const active = (section as HTMLElement).id === id;
        section.classList.toggle('timeline-active', active);
        (section as HTMLElement).dataset.timelineState = active ? 'active' : 'idle';
      });
    };

    const setSceneByTime = (time: number) => {
      const next = SCENES.find((item) => time >= item.start && time < item.end) || SCENES[SCENES.length - 1];
      if (next) applyScene(next.id);
    };

    const updateMeter = (progress?: number) => {
      const root = (document.querySelector('#scene-scroll') || document.documentElement) as HTMLElement;
      const p =
        typeof progress === 'number'
          ? progress
          : Math.max(0, Math.min(1, (scrollY || 0) / Math.max(1, root.offsetHeight - innerHeight)));
      const pct = meterPercent(p);
      setMeter(pct);
      if (ringRef.current) ringRef.current.style.strokeDashoffset = `${RING_C * (1 - pct / 100)}`;
      const meterEl = document.querySelector('#scroll-meter');
      meterEl?.setAttribute('aria-label', `页面滚动进度 ${pct}`);
    };

    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ progress: number; time: number }>).detail;
      setSceneByTime(detail.time);
      updateMeter(detail.progress);
    };

    document.addEventListener('v4sceneprogress', onProgress);
    setSceneByTime(0);

    const resetScrollOnFreshLoad = () => {
      if (location.hash) return;
      const html = document.documentElement;
      const prev = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
      html.style.scrollBehavior = prev;
    };
    resetScrollOnFreshLoad();

    let meterRaf = 0;
    const onScroll = () => {
      if (!meterRaf) {
        meterRaf = requestAnimationFrame(() => {
          meterRaf = 0;
          updateMeter();
        });
      }
    };
    const onResize = () => updateMeter();
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) resetScrollOnFreshLoad();
      updateMeter();
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onResize, { passive: true });
    addEventListener('pageshow', onPageShow);
    if (ringRef.current) {
      ringRef.current.style.strokeDasharray = `${RING_C}`;
      ringRef.current.style.strokeDashoffset = `${RING_C}`;
    }
    updateMeter();

    return () => {
      navObserver.disconnect();
      anchors.forEach((a) => a.removeEventListener('click', onAnchorClick));
      document.removeEventListener('v4sceneprogress', onProgress);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onResize);
      removeEventListener('pageshow', onPageShow);
      if (meterRaf) cancelAnimationFrame(meterRaf);
    };
  }, []);

  return (
    <main id="scene-scroll" className="site-shell">
      <ScenePlayer />

      <header className="site-header">
        <a className="brand" href="#about">
          Jenrimark<span>殇璃</span>
        </a>
        <nav aria-label="页面导航">
          <a href="#about">
            01 <b>主页</b>
          </a>
          <a href="#experience">
            02 <b>学履</b>
          </a>
          <a href="#projects">
            03 <b>工作</b>
          </a>
          <a href="#work">
            04 <b>作品</b>
          </a>
          <a href="#contact">
            05 <b>尾声</b>
          </a>
        </nav>
        <div className="header-actions">
          <a
            className="header-mail"
            href="mailto:2303532728@qq.com"
            title="发送邮件"
            aria-label="发送邮件给 2303532728@qq.com"
          >
            <svg className="header-mail-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5L4 8V6l8 5 8-5v2z"
              />
            </svg>
          </a>
          <a
            className="header-github"
            href="https://github.com/Jenrimark"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub"
            aria-label="GitHub 主页"
          >
            <svg className="header-github-icon" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
          </a>
          <div className="header-scroll-meter" id="scroll-meter" role="img" aria-label={`页面滚动进度 ${meter}`}>
            <svg className="header-scroll-ring" viewBox="0 0 36 36" aria-hidden="true">
              <circle className="header-scroll-ring-track" cx="18" cy="18" r="15.5" />
              <circle className="header-scroll-ring-fill" id="scroll-ring" cx="18" cy="18" r="15.5" ref={ringRef} />
            </svg>
            <span className="header-scroll-value" id="scroll-progress-value">
              {meter}
            </span>
          </div>
        </div>
      </header>

      <nav id="portal-dock" className="portal-dock" aria-label="个人门户">
        <p className="portal-dock-title">
          MY LITTLE PORTALS <span>↘</span>
        </p>
        <a
          className="portal-link portal-link-search"
          href="https://Jenrimark.github.io/view/"
          target="_blank"
          rel="noopener noreferrer"
          title="快捷搜索"
        >
          <span className="portal-icon" aria-hidden="true">
            ⌕
          </span>
          <span>聚合引擎</span>
          <small>探索</small>
        </a>
        <a className="portal-link portal-link-work" href="#work" title="作品集">
          <span className="portal-icon" aria-hidden="true">
            ✦
          </span>
          <span>作品集</span>
          <small>项目</small>
        </a>
        <a className="portal-link portal-link-contact" href="#contact" title="联系我">
          <span className="portal-icon" aria-hidden="true">
            ☏
          </span>
          <span>联系我</span>
          <small>聊天</small>
        </a>
        <a
          className="portal-link portal-link-resume"
          href="https://Jenrimark.github.io/acad-homepage/"
          target="_blank"
          rel="noopener noreferrer"
          title="履历书"
        >
          <span className="portal-icon" aria-hidden="true">
            ▤
          </span>
          <span>履历书</span>
          <small>经历</small>
        </a>
        <a
          className="portal-link portal-link-notes"
          href="https://fcn9od35aepq.feishu.cn/wiki/R1R3wPuzTioFtNkOnELcUJJLnBh?from=from_copylink"
          target="_blank"
          rel="noopener noreferrer"
          title="知识库"
        >
          <span className="portal-icon" aria-hidden="true">
            ✎
          </span>
          <span>知识库</span>
          <small>笔记</small>
        </a>
        <a
          className="portal-link portal-link-github"
          href="https://github.com/Jenrimark"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub"
        >
          <span className="portal-icon" aria-hidden="true">
            ⌘
          </span>
          <span>GitHub</span>
          <small>代码</small>
        </a>
      </nav>

      <div id="scene-copy" className="scene-copy" data-scene={activeScene} aria-live="polite">
        <section className="scene-panel" data-scene="about" hidden={activeScene !== 'about'}>
          <p className="scene-copy-tag">01</p>
          <h1>Hello,I&apos;m</h1>
          <div className="scene-identity">
            <p className="scene-identity-name">吴汉东</p>
            <p className="scene-identity-role">AI产品经理 · AI全栈应用开发 · 27届本科</p>
            <ul className="scene-identity-tags" aria-label="个人标签">
              <li>AI Agent</li>
              <li>RAG</li>
              <li>电商中台</li>
              <li>0→1 产品</li>
              <li>Prompt 工程</li>
              <li>多模态交互</li>
              <li>全栈落地</li>
              <li>数据驱动</li>
            </ul>
          </div>
        </section>

        <section className="scene-panel" data-scene="experience" hidden={activeScene !== 'experience'}>
          <p className="scene-copy-tag">02</p>
          <h1>LEARN.</h1>
          <p className="scene-copy-sub">从课本出发，把知识练成方法</p>
          <div className="scene-record" aria-label="教育经历">
            <p className="scene-record-index">01</p>
            <div className="scene-record-body">
              <p className="scene-record-period">2023.09 — 2027.06</p>
              <h2 className="scene-record-title">中国地质大学（武汉）</h2>
              <p className="scene-record-meta">软件工程 · 本科</p>
              <div className="scene-record-tags" aria-label="学业要点">
                <span>专业前 10%</span>
                <span>软件工程</span>
                <span>27 届</span>
              </div>
              <p className="scene-record-line">主修软件工程，把系统、算法与产品设计，连成同一条线。</p>
            </div>
          </div>
        </section>

        <section className="scene-panel" data-scene="projects" hidden={activeScene !== 'projects'}>
          <p className="scene-copy-tag">03</p>
          <h1>PRACTICE.</h1>
          <p className="scene-copy-sub">在真实岗位，把方案做成结果</p>
          <div className="scene-jobs" aria-label="工作经历">
            <article className="scene-job">
              <p className="scene-job-index">01</p>
              <div className="scene-job-body">
                <p className="scene-job-period">2026.06 — 2026.09*</p>
                <h2 className="scene-job-company">小米（武汉）</h2>
                <p className="scene-job-meta">国际业务部 · 系统开发组 · AI 产品实习生</p>
                <p className="scene-job-product">跨境电商海外运营智能运营助手 MVP</p>
                <p className="scene-job-line">梳理巡检、监控与舆情复盘中的低效场景，完成助手从 0 到 1 落地。</p>
                <p className="scene-job-points">统一风控与采集标准 · 搭建飞书数据中枢 · 试点验证 AI 价值</p>
              </div>
            </article>
            <article className="scene-job">
              <p className="scene-job-index">02</p>
              <div className="scene-job-body">
                <p className="scene-job-period">2025.11 — 2026.04*</p>
                <h2 className="scene-job-company">美和易思（武汉）</h2>
                <p className="scene-job-meta">智慧就业 PDT · AI 产品实习生</p>
                <p className="scene-job-product">多模态 AI 数字人面试产品</p>
                <p className="scene-job-line">连接用户需求、题库组织与交互体验，持续迭代面试 MVP。</p>
                <p className="scene-job-points">校招题库结构化 · 出题体验优化 · 响应速度与留存迭代</p>
              </div>
            </article>
          </div>
        </section>

        <section className="scene-panel" data-scene="work" hidden={activeScene !== 'work'}>
          <div className="work-board">
            <div className="work-board-main">
              <div className="work-board-head">
                <div className="work-board-title">
                  <p className="scene-copy-tag">04</p>
                  <h1>THE WORK.</h1>
                  <p className="scene-copy-sub">每一个项目，都是一次具体的尝试。</p>
                </div>
                <p className="work-more">
                  查看更多<span aria-hidden="true">›</span>
                </p>
              </div>
              <div className="work-board-featured" aria-label="主推作品">
                <article className="work-feature">
                  <p className="work-feature-tag">AI 产品 · AGENT</p>
                  <h2>GREENHOUSE·AI</h2>
                  <p className="work-feature-sub">求职作战系统</p>
                  <p className="work-feature-line">把分散的求职准备，组织成一套可以持续推进的行动。</p>
                  <p className="work-feature-path">岗位搜索 → 简历生成 → 面试评分</p>
                  <p className="work-feature-tech">TypeScript · Agent · Function Calling</p>
                </article>
                <article className="work-feature">
                  <p className="work-feature-tag">AI 产品 · RAG</p>
                  <h2>SUGARGUARD</h2>
                  <p className="work-feature-sub">糖知 · AI 智能控糖</p>
                  <p className="work-feature-line">从识别一杯饮品开始，让健康信息更容易理解。</p>
                  <p className="work-feature-path">图像识别 → 知识检索 → 清晰解释</p>
                  <p className="work-feature-tech">Kotlin · SpringBoot · RAG</p>
                </article>
              </div>
            </div>
            <div className="work-board-minis" aria-label="其他作品">
              <article className="work-mini">
                <p className="work-mini-tag">研究实践</p>
                <h2>星轨</h2>
                <p className="work-mini-sub">端到端自动驾驶</p>
                <p className="work-mini-line">把运动的连续性，带进模型的信息路由。</p>
              </article>
              <article className="work-mini">
                <p className="work-mini-tag">全栈应用</p>
                <h2>智鉴车件</h2>
                <p className="work-mini-sub">车辆故障检测</p>
                <p className="work-mini-line">把实时车况，整理成可读的检测报告。</p>
              </article>
              <article className="work-mini">
                <p className="work-mini-tag">全栈应用</p>
                <h2>灵犀</h2>
                <p className="work-mini-sub">校园生活服务</p>
                <p className="work-mini-line">把分散的校园信息，连接成日常服务。</p>
              </article>
              <article className="work-mini">
                <p className="work-mini-tag">全栈应用</p>
                <h2>合租管家</h2>
                <p className="work-mini-sub">室友协作工具</p>
                <p className="work-mini-line">让一起生活的琐事，有一份共同的安排。</p>
              </article>
            </div>
          </div>
        </section>

        <section className="scene-panel" data-scene="contact" hidden={activeScene !== 'contact'}>
          <p className="scene-copy-tag">05</p>
          <h1>LET&apos;S TALK.</h1>
          <p className="scene-copy-sub">下一个好想法，也许从你好开始</p>
          <div className="scene-socials" aria-label="联系方式">
            <span className="scene-social scene-social-qq" title="QQ" aria-label="QQ">
              Q
            </span>
            <span className="scene-social scene-social-wechat" title="微信" aria-label="微信">
              微
            </span>
            <span className="scene-social scene-social-douyin" title="抖音" aria-label="抖音">
              抖
            </span>
          </div>
        </section>
      </div>

      <div className="page-content scene-spacers" aria-hidden="true">
        <div id="about" className="scene-spacer" />
        <div id="experience" className="scene-spacer" />
        <div id="projects" className="scene-spacer" />
        <div id="work" className="scene-spacer" />
        <div id="contact" className="scene-spacer" />
      </div>

      <footer className="site-footer">
        <div className="site-footer-row">
          <span className="site-footer-item">Design &amp; Build with ❤ by Jenrimark</span>
          <span className="site-footer-sep" aria-hidden="true">
            ·
          </span>
          <span className="site-footer-item">Copyright © 2026 吴汉东</span>
          <span className="site-footer-sep" aria-hidden="true">
            ·
          </span>
          <span className="site-footer-item">CC BY-NC-SA 4.0</span>
          <span className="site-footer-sep" aria-hidden="true">
            ·
          </span>
          <span className="site-footer-item">蜀ICP备 2026055157 号</span>
          <span className="site-footer-sep" aria-hidden="true">
            ·
          </span>
          <span className="site-footer-item">鄂公网安备 42018502009413 号</span>
        </div>
      </footer>
    </main>
  );
}
