import { escapeHTML as e, safeURL, publicContent, validateContent } from './content-model.mjs';

const $ = selector => document.querySelector(selector);
let content, projects = [], currentIndex = 0, returnFocus = null;
const lines = values => (values || []).map(v => `<li>${e(v)}</li>`).join('');
const tags = values => (values || []).map(v => `<span>${e(v)}</span>`).join('');

function artwork(p, large = false) {
  const cover = safeURL(p.cover);
  if (cover) return `<div class="project-art uploaded"><img src="${e(cover)}" alt="${e(p.title)} 项目封面" loading="lazy"></div>`;
  return `<div class="project-art art-${e(p.art || 'agent')} ${large ? 'art-large' : ''}" aria-hidden="true"><span class="art-grid"></span><div class="art-object"><i></i><i></i><i></i><b>${({ agent:'↗',health:'✳',route:'⌁',vehicle:'◎',campus:'L',home:'⌂',chat:'···',bookmark:'⌑' })[p.art] || '↗'}</b></div><span class="art-caption">${e(p.subtitle || p.title)}</span><span class="art-index">${String(projects.indexOf(p) + 1).padStart(2, '0')} / JENRIMARK</span></div>`;
}

function renderTimeline() {
  const rows = [...(content.experience || []).map(x => ({ ...x, title:x.company, subtitle:x.role, detail:x.department })), ...(content.education || []).map(x => ({ ...x, title:x.school, subtitle:`${x.major} · ${x.degree}`, detail:`综合排名专业${x.ranking}`, description:'用软件工程建立底层能力，也在项目、竞赛与团队协作中不断拓宽边界。' }))];
  $('#timeline').innerHTML = rows.map((x,i) => `<article class="timeline-item"><span class="timeline-dot"></span><div class="timeline-period">${e(x.period)}</div><div class="timeline-company"><h3>${e(x.title)}</h3><span>0${i+1}</span></div><p class="timeline-role">${e(x.subtitle)}</p><p class="timeline-detail">${e(x.detail)}</p><p>${e(x.description)}</p>${x.highlights ? `<ul>${lines(x.highlights)}</ul>` : ''}</article>`).join('');
  $('#campus-list').innerHTML = (content.campus || []).map(x => `<article><span>${e(x.period)}</span><h3>${e(x.role)} <small>${e(x.organization)}</small></h3><p>${e(x.description)}</p></article>`).join('');
  $('#skill-list').innerHTML = (content.skills || []).map(x => `<div><h3>${e(x.category)}</h3><p>${tags(x.items)}</p></div>`).join('');
  $('#honor-list').innerHTML = (content.honors || []).map((x,i) => `<article><span>0${i+1}</span><div><h4>${e(x.name)}</h4><p>${e((x.awards || []).join(' · '))}${x.count ? ` × ${e(x.count)}` : ''}${x.role ? ` · ${e(x.role)}` : ''}</p></div><span aria-hidden="true">✳</span></article>`).join('');
}

function renderProjects(category = '全部') {
  const shown = projects.filter(p => category === '全部' || p.category === category);
  $('#project-grid').innerHTML = shown.map(p => `<button type="button" class="project-card" data-project="${e(p.slug)}" aria-label="查看 ${e(p.title)} 项目详情">${artwork(p)}<div class="project-meta"><span>${e(p.category)}</span><span>${e(p.year || 'PROJECT NOTES')} ↗</span></div><h3>${e(p.title)} <small>${e(p.subtitle)}</small></h3><p>${e(p.summary)}</p><div class="project-tech">${tags(p.technologies?.slice(0,3))}</div></button>`).join('');
  $('#project-result').textContent = `${category}：${shown.length} 个项目`;
  $('#project-filters').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.category === category)));
}

function openCase(slug) {
  const index = projects.findIndex(p => p.slug === slug); if (index < 0) return;
  currentIndex = index; const p = projects[index];
  if (!$('#case-dialog').open) returnFocus = $('#archive-dialog').open ? $('#folder-open') : document.activeElement;
  $('#archive-dialog').close();
  $('#case-label').textContent = `${String(index+1).padStart(2,'0')} / ${p.category}`;
  $('#case-body').innerHTML = `<div class="case-heading"><p>${e(p.subtitle)}</p><h2 id="case-title">${e(p.title)}</h2><p class="case-summary">${e(p.summary)}</p><div class="case-tags">${tags(p.technologies)}</div></div>${artwork(p,true)}<div class="case-notes"><h3>项目概览</h3><p>${e(p.description)}</p><h3>具体实践</h3><ul>${lines(p.highlights)}</ul>${p.flow?.length ? `<h3>从问题到交付</h3><div class="case-flow">${p.flow.map((v,i)=>`<span><small>0${i+1}</small>${e(v)}</span>`).join('<b aria-hidden="true">→</b>')}</div>` : ''}<p class="case-source">${p.cover ? '' : '封面为项目主题视觉。'}案例内容依据个人公开简历整理。${safeURL(p.sourceUrl) ? `<a href="${e(safeURL(p.sourceUrl))}" target="_blank" rel="noopener noreferrer">查看来源 ↗</a>` : ''}</p></div>`;
  if (!$('#case-dialog').open) $('#case-dialog').showModal();
  $('#case-dialog').scrollTop = 0;
  document.body.classList.add('dialog-open');
  history.replaceState(null, '', `#project/${encodeURIComponent(p.slug)}`);
}

function setupDialogs() {
  document.addEventListener('click', event => {
    const card = event.target.closest('[data-project]'); if (card) openCase(card.dataset.project);
    const close = event.target.closest('[data-close]'); if (close) document.getElementById(close.dataset.close).close();
  });
  $('#folder-open').addEventListener('click', () => { returnFocus = $('#folder-open'); $('#archive-dialog').showModal(); document.body.classList.add('dialog-open'); });
  const folderClose = document.getElementById('folder-close');
  const folderStage = document.getElementById('folder-stage');
  if (folderClose && folderStage) folderClose.addEventListener('click', () => {
    folderStage.classList.toggle('is-open');
    folderClose.textContent = folderStage.classList.contains('is-open') ? '展开文件夹 +' : '收起文件夹 ×';
  });
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
    dialog.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) { document.body.classList.remove('dialog-open'); if (location.hash.startsWith('#project/')) history.replaceState(null, '', '#work'); returnFocus?.focus({preventScroll:true}); }
    });
  }
  $('#case-prev').addEventListener('click', () => openCase(projects[(currentIndex - 1 + projects.length) % projects.length].slug));
  $('#case-next').addEventListener('click', () => openCase(projects[(currentIndex + 1) % projects.length].slug));
}

function setupStory() {
  const story = $('#story'), beats = [...document.querySelectorAll('.story-beat')], reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let scheduled = false;
  const update = () => {
    scheduled = false; const r = story.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - innerHeight)));
    const index = Math.min(2, Math.floor(progress * 3));
    story.style.setProperty('--story-progress', progress);
    beats.forEach((b,i) => { b.classList.toggle('is-active', i === index); b.inert = !reduced.matches && innerWidth > 760 && i !== index; });
    $('#story-counter').textContent = `0${index+1} — 03`;
  };
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } };
  addEventListener('scroll', schedule, {passive:true}); addEventListener('resize', schedule); reduced.addEventListener('change',schedule); update();
  document.addEventListener('click', event => {
    if (reduced.matches || event.target.closest('button,a,dialog')) return;
    const dot = document.createElement('span'); dot.className = 'click-ripple'; dot.style.left = `${event.clientX}px`; dot.style.top = `${event.clientY}px`; dot.setAttribute('aria-hidden','true'); document.body.append(dot); dot.addEventListener('animationend',()=>dot.remove());
  });
}

function setupScrollMotion() {
  const sections = [...document.querySelectorAll('.motion-section')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forceReveal = new URLSearchParams(location.search).has('reveal');
  sections.forEach(section => {
    [...section.querySelectorAll('.timeline-item,.project-card,.skill-list>div,.honors article')].forEach((node, index) => node.style.setProperty('--i', index));
  });
  const scrollToHash = () => {
    const goto = new URLSearchParams(location.search).get('goto');
    const hashId = goto || (location.hash && !location.hash.startsWith('#project/') ? location.hash.slice(1) : '');
    if (!hashId) return;
    const target = document.getElementById(hashId);
    if (!target) return;
    const jump = () => window.scrollTo(0, Math.max(0, target.getBoundingClientRect().top + window.scrollY - 24));
    requestAnimationFrame(() => requestAnimationFrame(jump));
    setTimeout(jump, 280);
  };
  if (forceReveal || reduced.matches || !('IntersectionObserver' in window)) {
    sections.forEach(section => section.classList.add('is-visible'));
    scrollToHash();
    return;
  }
  // Hide-for-reveal only once the observer can immediately show in-view sections.
  document.documentElement.classList.add('js');
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    entry.target.classList.toggle('is-visible', entry.isIntersecting);
  }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  sections.forEach(section => observer.observe(section));
  scrollToHash();
}

function setupIpScrollLayer() {
  const layer = $('#ip-scroll-layer');
  if (!layer) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => {
    const active = innerWidth > 760 && !reduced.matches && scrollY > innerHeight * .72;
    const progress = Math.max(0, Math.min(1, (scrollY - innerHeight * .72) / Math.max(1, innerHeight * 4.8)));
    layer.classList.toggle('is-active', active);
    layer.style.setProperty('--ip-progress', progress.toFixed(3));
    layer.style.setProperty('--ip-y', `${Math.round(progress * 34)}px`);
    layer.style.setProperty('--ip-rotate', `${(progress * 4 - 2).toFixed(2)}deg`);
  };
  let raf = 0;
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); }, { passive: true });
  addEventListener('resize', update); reduced.addEventListener('change', update); update();
}

function setupSceneRail() {
  const scenes = [...document.querySelectorAll('.scene-section')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!scenes.length) return;
  const update = () => {
    for (const scene of scenes) {
      const rect = scene.getBoundingClientRect();
      const range = Math.max(1, rect.height - innerHeight * .55);
      const progress = Math.max(0, Math.min(1, (innerHeight * .62 - rect.top) / range));
      const phase = progress < .18 ? 'intro' : progress > .82 ? 'outro' : 'main';
      scene.style.setProperty('--scene-progress', progress.toFixed(3));
      scene.dataset.scenePhase = phase;
      scene.classList.toggle('scene-active', progress > 0 && progress < 1);
    }
  };
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  reduced.addEventListener('change', schedule);
  update();
}

function applyProfile() {
  document.title = content.settings?.title || document.title;
  $('meta[name="description"]').content = content.settings?.description || content.profile.intro;
  $('#hero-title').innerHTML = `${e(content.settings?.heroHeading || 'Ideas.')}<br><em>${e(content.settings?.heroEmphasis || 'Made real.')}</em>`;
  $('.hero-tagline').textContent = content.settings?.heroTagline || '';
  $('.name').innerHTML = `${e(content.profile.name)}<span>${e(content.profile.englishName)}</span>`;
  $('.intro-eyebrow').innerHTML = `<span class="small-star" aria-hidden="true">✳</span> ${e(content.profile.positioning)}`;
  $('.location').textContent = `${content.profile.location || ''} / 2026`;
  const aboutParas = document.querySelectorAll('.about-text p');
  const intro = content.profile.intro || '';
  if (aboutParas[0]) aboutParas[0].textContent = intro;
  if (aboutParas[1]) aboutParas[1].textContent = '从小米的 B 端智能运营，到美和易思的多模态面试产品，把想法一步步做成真实体验。';
  for (const a of document.querySelectorAll('a[href^="mailto:"]')) { a.href = `mailto:${encodeURIComponent(content.profile.email)}`; if (!a.classList.contains('contact-link')) a.textContent = `${content.profile.email} ↗`; }
  const copyright = $('.footer>span:last-child'); copyright.textContent = content.settings?.copyright || '';
  $('.footer>span:first-child').textContent = content.profile.brand || 'JENRIMARK';
  $('.contact>.overline').textContent = content.settings?.footerLine || 'THE NEXT IDEA STARTS WITH A HELLO.';
  for(const a of document.querySelectorAll('a[href="https://github.com/Jenrimark"]'))a.href=safeURL(content.profile.github)||'https://github.com/Jenrimark';
  for(const a of document.querySelectorAll('a[href="https://jenrimark.github.io/acad-homepage/"]'))a.href=safeURL(content.profile.resumeUrl)||safeURL(content.source?.url)||'#about';
}

async function init() {
  try {
    const preview = new URLSearchParams(location.search).get('preview') === '1';
    const url = preview ? '/api/preview-content' : new URL('content.json', location.href);
    const response = await fetch(url,{cache:'no-cache'}); if (!response.ok) throw new Error('Content request failed');
    const raw = validateContent(await response.json());
    content = preview ? raw : publicContent(raw);
    projects = content.projects;
    if (preview) { const banner = document.createElement('div'); banner.className='preview-banner'; banner.textContent='草稿预览 · 尚未发布'; document.body.prepend(banner); }
    applyProfile(); renderTimeline();
    const countEl = $('#archive-count'); if (countEl) countEl.textContent = projects.length;
    $('#project-filters').innerHTML = ['全部',...new Set(projects.map(p=>p.category))].map(c=>`<button type="button" data-category="${e(c)}" aria-pressed="${c==='全部'}">${e(c)}</button>`).join('');
    $('#project-filters').addEventListener('click', event => { const b=event.target.closest('[data-category]'); if(b)renderProjects(b.dataset.category); });
    $('#archive-list').innerHTML = projects.map((p,i)=>`<button type="button" data-project="${e(p.slug)}"><span>${String(i+1).padStart(2,'0')}</span><strong>${e(p.title)}</strong><small>${e(p.category)}</small><b aria-hidden="true">↗</b></button>`).join('');
    renderProjects(); setupDialogs(); setupStory(); setupScrollMotion(); setupIpScrollLayer(); setupSceneRail();
    if(location.hash.startsWith('#project/'))openCase(decodeURIComponent(location.hash.slice(9)));
  } catch (error) { $('#load-error').hidden=false; console.error('Portfolio content:',error); }
}
init();
