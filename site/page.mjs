const navLinks=[...document.querySelectorAll('.site-header nav a')];
const sectionById=navLinks.map(link=>document.querySelector(link.getAttribute('href'))).filter(Boolean);
const navObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)navLinks.forEach(link=>link.classList.toggle('active',link.getAttribute('href')===`#${entry.target.id}`))}),{rootMargin:'-35% 0px -55% 0px',threshold:0});sectionById.forEach(section=>navObserver.observe(section));
document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',event=>{const target=document.querySelector(link.getAttribute('href'));if(!target)return;event.preventDefault();target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});history.replaceState(null,'',link.getAttribute('href'))}));

const sceneCopy=document.querySelector('#scene-copy');
const scenes=[
  {id:'about',start:0,end:10,tag:'01',title:'HELLO.',sub:'移动鼠标，目光随你'},
  {id:'experience',start:10,end:15,tag:'02',title:'DESIGN.',sub:'把低效的动作，拆成可落地的流程'},
  {id:'projects',start:15,end:22,tag:'03',title:'MAKE IT REAL.',sub:'从问题出发，把方案做成产品'},
  {id:'work',start:22,end:28,tag:'04',title:'THE WORK.',sub:'每一个项目，都是一次具体的尝试'},
  {id:'contact',start:28,end:30.048,tag:'05',title:'LET’S TALK.',sub:'下一个好想法，也许从你好开始'},
];
let activeScene='';
function setSceneByTime(time){
  const next=scenes.find(item=>time>=item.start&&time<item.end)||scenes.at(-1);
  if(!next||next.id===activeScene)return;
  activeScene=next.id;
  document.querySelectorAll('.chapter').forEach(section=>{const active=section.id===next.id;section.classList.toggle('timeline-active',active);section.dataset.timelineState=active?'active':'idle';});
  renderSceneCopy(next);
}
function renderSceneCopy(scene){
  sceneCopy.querySelector('.scene-copy-tag').textContent=scene.tag;
  sceneCopy.querySelector('h1').textContent=scene.title;
  sceneCopy.querySelector('p:last-child').textContent=scene.sub;
  sceneCopy.dataset.scene=scene.id;
}
document.addEventListener('v4sceneprogress',event=>setSceneByTime(event.detail.time));
setSceneByTime(0);
