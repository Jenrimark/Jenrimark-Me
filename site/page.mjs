const navLinks=[...document.querySelectorAll('.site-header nav a')];
const sectionById=navLinks.map(link=>document.querySelector(link.getAttribute('href'))).filter(Boolean);
const navObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)navLinks.forEach(link=>link.classList.toggle('active',link.getAttribute('href')===`#${entry.target.id}`))}),{rootMargin:'-35% 0px -55% 0px',threshold:0});sectionById.forEach(section=>navObserver.observe(section));
document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',event=>{const target=document.querySelector(link.getAttribute('href'));if(!target)return;event.preventDefault();target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});history.replaceState(null,'',link.getAttribute('href'))}));

const sceneCopy=document.querySelector('#scene-copy');
const portalDock=document.querySelector('#portal-dock');
const siteFooter=document.querySelector('.site-footer');
const scenes=[
  {id:'about',start:0,end:10},
  {id:'experience',start:10,end:15},
  {id:'projects',start:15,end:22},
  {id:'work',start:22,end:28},
  {id:'contact',start:28,end:30.048},
];
let activeScene='';
function setSceneByTime(time){
  const next=scenes.find(item=>time>=item.start&&time<item.end)||scenes.at(-1);
  if(!next||next.id===activeScene)return;
  activeScene=next.id;
  portalDock?.classList.toggle('is-expanded', next.id==='about'||next.id==='contact');
  siteFooter?.classList.toggle('is-visible', next.id==='contact');
  document.querySelectorAll('.chapter').forEach(section=>{const active=section.id===next.id;section.classList.toggle('timeline-active',active);section.dataset.timelineState=active?'active':'idle';});
  renderSceneCopy(next);
}
function renderSceneCopy(scene){
  // Each scene owns its own panel. Identity lives only inside the about panel,
  // so later scenes never render that block at all.
  sceneCopy.querySelectorAll('.scene-panel').forEach(panel=>{
    panel.hidden=panel.dataset.scene!==scene.id;
  });
  sceneCopy.dataset.scene=scene.id;
}
document.addEventListener('v4sceneprogress',event=>setSceneByTime(event.detail.time));
setSceneByTime(0);
