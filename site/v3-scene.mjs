import { pointerToPose, frameTime } from './gaze-math.mjs';

export const EYE_END_PROGRESS = 0.14;
export const EYE_DURATION = 10;
export const INTERACTION_FPS = 60;
export const SCROLL_SEEK_EPSILON = 0.012;
export const SCROLL_TIMELINE = Object.freeze([
  [0, 10],
  [0.08, 14],
  [0.12, 15],
  [0.2, 16],
  [0.34, 19],
  [0.48, 22],
  [0.55, 23],
  [0.64, 24],
  [0.76, 26],
  [0.86, 28],
  [0.93, 29],
  [1, 30.048],
]);

export function mapScrollTime(progress, duration = 30.048) {
  const p = Math.max(0, Math.min(1, progress));
  const scale = Math.max(0, duration - EYE_DURATION) / (30.048 - EYE_DURATION);
  for (let index = 1; index < SCROLL_TIMELINE.length; index += 1) {
    const [endProgress, endTime] = SCROLL_TIMELINE[index];
    if (p <= endProgress) {
      const [startProgress, startTime] = SCROLL_TIMELINE[index - 1];
      const local = (p - startProgress) / (endProgress - startProgress);
      return EYE_DURATION + ((startTime + (endTime - startTime) * local) - EYE_DURATION) * scale;
    }
  }
  return duration;
}

export function needsScrollSeek({ currentTime, targetTime, seeking }) {
  return !seeking && Math.abs(currentTime - targetTime) > SCROLL_SEEK_EPSILON;
}

export function mapPointerTime(clientX, clientY, rect) {
  const pose = pointerToPose(clientX, clientY, rect);
  return Math.max(0, Math.min(EYE_DURATION, pose.time));
}

export function mapSceneTime({ progress, pointerTime, duration }) {
  if (progress < EYE_END_PROGRESS) return Math.max(0, Math.min(EYE_DURATION, pointerTime));
  const scrollProgress = (progress - EYE_END_PROGRESS) / (1 - EYE_END_PROGRESS);
  return mapScrollTime(scrollProgress, duration);
}

const boot = () => {
  const root = document.querySelector('#v3-scene');
  const scrollRoot = document.querySelector('#scene-scroll');
  const video = document.querySelector('#v3-scene-video');
  if (!root || !scrollRoot || !video || !window.gsap || !window.Lenis) return;

  const state = { progress:0, pointerTime:0, duration:0, scrollTarget:0 };
  const gsap = window.gsap;
  const lenis = new Lenis({ lerp:.14, smoothWheel:true, syncTouch:true, autoRaf:false });
  const seekEye=(time)=>{if(video.readyState<1 || !state.duration)return;const target=frameTime(Math.max(0,Math.min(state.duration-.05,time)),state.duration,INTERACTION_FPS);if(!video.seeking&&Math.abs(video.currentTime-target)>1/(INTERACTION_FPS*2))video.currentTime=target;};
  const seekScroll=(time)=>{
    if(video.readyState<1 || !state.duration)return;
    const target=Math.max(EYE_DURATION,Math.min(state.duration-.02,time));
    state.scrollTarget=target;
    if(needsScrollSeek({currentTime:video.currentTime,targetTime:target,seeking:video.seeking}))video.currentTime=target;
  };
  const seek=(time)=>state.progress<EYE_END_PROGRESS?seekEye(time):seekScroll(time);
  const render=()=>{const p=Math.min(1,Math.max(0,lenis.scroll/Math.max(1,scrollRoot.offsetHeight-innerHeight)));state.progress=p;seek(mapSceneTime(state));root.dataset.state=p<EYE_END_PROGRESS?'eye':'scroll';};
  video.addEventListener('loadedmetadata',()=>{state.duration=video.duration||0;seek(mapSceneTime(state))},{once:true});
  const resumeLatestScrollTarget=()=>{
    if(state.progress<EYE_END_PROGRESS || !state.duration || video.seeking)return;
    if(needsScrollSeek({currentTime:video.currentTime,targetTime:state.scrollTarget,seeking:false}))video.currentTime=state.scrollTarget;
  };
  if('requestVideoFrameCallback' in video){
    const onFrame=()=>{resumeLatestScrollTarget();video.requestVideoFrameCallback(onFrame)};
    video.requestVideoFrameCallback(onFrame);
  }
  video.addEventListener('seeked',resumeLatestScrollTarget);
  addEventListener('pointermove',(e)=>{if(state.progress>=EYE_END_PROGRESS || !state.duration)return;const time=mapPointerTime(e.clientX,e.clientY,video.getBoundingClientRect());gsap.to(state,{pointerTime:time,duration:.16,overwrite:true,onUpdate:()=>{if(state.progress<EYE_END_PROGRESS)seek(mapSceneTime(state))}})},{passive:true});
  const tick=(t)=>{lenis.raf(t*1000);render();requestAnimationFrame(tick)};gsap.set(root,{autoAlpha:1});root.classList.add('is-active');video.load();requestAnimationFrame(tick);
};
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();}
