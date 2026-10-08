/* 首屏追视 + 三段帧序列滚动（零视频 seek，纯 canvas） */
(() => {
  const hero = document.getElementById("hero");
  const fx = document.getElementById("fx");
  const ctx = fx.getContext("2d", { alpha: false });
  const s04 = document.getElementById("s04");
  const track = document.getElementById("track");
  const copy = document.getElementById("copy");
  const tagEl = document.getElementById("tag");
  const titleEl = document.getElementById("title");
  const subEl = document.getElementById("sub");

  // T00 = 首页居中 → 第一张讲解图；T02 = 讲解→坐下；T03 = 坐下→坠落
  const clips = [
    {
      key: "T00", count: 91, imgs: [],
      tag: "02", title: "DESIGN.", sub: "从首页走进讲解",
    },
    {
      key: "T02", count: 151, imgs: [],
      tag: "03", title: "MAKE IT REAL.", sub: "坐下来把想法做完",
    },
    {
      key: "T03", count: 151, imgs: [],
      tag: "04", title: "KEEP FALLING.", sub: "摔下去也没关系",
    },
  ];

  // 加载帧
  function loadClip(clip) {
    let done = 0;
    for (let i = 1; i <= clip.count; i++) {
      const img = new Image();
      img.decoding = "async";
      img.onload = img.onerror = () => {
        done += 1;
        if (done === clip.count) clip.ready = true;
      };
      img.src = `media/seq/${clip.key}/f${String(i).padStart(3, "0")}.jpg`;
      clip.imgs.push(img);
    }
  }
  clips.forEach(loadClip);

  // 高度：首屏 100vh + 每段 120vh
  const HERO = 100;
  const SEG = 120;
  track.style.height = `${HERO + clips.length * SEG}vh`;

  // —— 追视 ——
  const DIR = [2, 3.875, 5.375, 7];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function gazeTime(x, y) {
    const w = innerWidth, h = innerHeight;
    const nx = (x - w * 0.5) / (w * 0.5);
    const ny = (y - h * 0.45) / (h * 0.5);
    if (Math.hypot(nx, ny) < 0.12) return 0;
    let a = Math.atan2(-ny, nx);
    if (a < 0) a += Math.PI * 2;
    const q = Math.PI / 2;
    if (a >= q * 3) return 7;
    const seg = Math.floor(a / q);
    const p = (a - seg * q) / q;
    return DIR[seg] + (DIR[seg + 1] - DIR[seg]) * p;
  }

  let gazeWant = 0;
  let gazeBusy = false;
  let inHero = true;

  function pumpGaze() {
    if (!inHero || gazeBusy || !hero.duration) return;
    const t = clamp(Math.round(gazeWant * 24), 0, Math.floor(hero.duration * 24) - 1) / 24;
    if (Math.abs(hero.currentTime - t) < 1 / 48) return;
    gazeBusy = true;
    const done = () => {
      gazeBusy = false;
      hero.removeEventListener("seeked", done);
    };
    hero.addEventListener("seeked", done);
    hero.currentTime = t;
    setTimeout(done, 300);
  }

  addEventListener("pointermove", (e) => {
    if (!inHero) return;
    gazeWant = gazeTime(e.clientX, e.clientY);
    pumpGaze();
  }, { passive: true });

  // —— 画一帧 ——
  let lastIdx = -1;
  let lastKey = "";

  function sizeCanvasToViewport() {
    // 缓冲区跟视口同比例，避免 16:9 帧被 CSS 拉成 16:10 等导致竖向压扁
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(window.innerWidth * dpr));
    const h = Math.max(2, Math.round(window.innerHeight * dpr));
    if (fx.width !== w || fx.height !== h) {
      fx.width = w;
      fx.height = h;
      lastKey = "";
    }
  }

  function drawCover(img, alpha) {
    if (!img || !img.naturalWidth) return;
    const cw = fx.width, ch = fx.height;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    ctx.globalAlpha = 1;
  }

  /**
   * 画当前帧；tail 0~1 时向 nextImg（下一段首帧）交叉溶解，
   * 相当于片尾约 1 秒「脸/姿态回正」以便和下一段适配。
   */
  function drawFrame(clip, idx, tail, nextImg) {
    const key = clip.key + ":" + idx + ":" + Math.round(tail * 20);
    if (key === lastKey) return;
    const img = clip.imgs[idx];
    if (!img || !img.naturalWidth) return;
    ctx.fillStyle = "#2c2522";
    ctx.fillRect(0, 0, fx.width, fx.height);
    drawCover(img, 1);
    if (tail > 0 && nextImg && nextImg.naturalWidth) {
      // smoothstep，越靠近切点越接近下一段首帧（回正）
      const e = tail * tail * (3 - 2 * tail);
      drawCover(nextImg, e);
    }
    lastKey = key;
    lastIdx = idx;
  }

  function showOnly(el) {
    hero.classList.toggle("on", el === hero);
    fx.classList.toggle("on", el === fx);
    s04.classList.toggle("on", el === s04);
  }

  function setCopy(tag, title, sub) {
    if (titleEl.textContent === title) return;
    copy.classList.add("dim");
    setTimeout(() => {
      tagEl.textContent = tag;
      titleEl.textContent = title;
      subEl.textContent = sub;
      copy.classList.remove("dim");
    }, 100);
  }

  // —— 滚动 ——
  let smooth = 0;

  function apply(p) {
    const heroShare = HERO / (HERO + clips.length * SEG);

    // 离开首屏前，视线先回正，避免和 T00 起点对不齐
    if (p < heroShare) {
      inHero = true;
      showOnly(hero);
      hero.play().then(() => hero.pause()).catch(() => {});
      // 快进入第一段时，把 gazeTarget 收回正面
      const leave = clamp((p - heroShare * 0.72) / (heroShare * 0.28), 0, 1);
      if (leave > 0) gazeWant = gazeWant * (1 - leave);
      pumpGaze();
      setCopy("01", "HELLO.", "移动鼠标，目光随你");
      return;
    }

    inHero = false;
    const rest = (p - heroShare) / (1 - heroShare);
    const idx = clamp(Math.floor(rest * clips.length), 0, clips.length - 1);
    const local = clamp(rest * clips.length - idx, 0, 1);

    const clip = clips[idx];
    const next = clips[idx + 1];
    const n = clip.imgs.length;
    const frame = clamp(Math.round(local * (n - 1)), 0, n - 1);

    // 片尾约 1 秒（10%）向「下一段首帧 / S04」回正溶解
    const TAIL = 0.1;
    const tail = clamp((local - (1 - TAIL)) / TAIL, 0, 1);

    if (idx === clips.length - 1 && local > 0.92) {
      // 最后一段：混到 S04 结尾定格
      showOnly(local > 0.97 ? s04 : fx);
      if (local <= 0.97) {
        drawFrame(clip, frame, tail, s04);
      }
      setCopy("05", "THE END.", "作品还在");
      return;
    }

    showOnly(fx);
    const nextImg = next ? next.imgs[0] : s04;
    drawFrame(clip, frame, tail, nextImg);
    setCopy(clip.tag, clip.title, clip.sub);
  }

  function frame() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const target = clamp(scrollY / max, 0, 1);
    smooth += (target - smooth) * 0.22;
    if (Math.abs(target - smooth) < 0.0003) smooth = target;
    apply(smooth);
    requestAnimationFrame(frame);
  }

  hero.preload = "auto";
  hero.load();
  sizeCanvasToViewport();
  addEventListener("resize", sizeCanvasToViewport);
  apply(0);
  requestAnimationFrame(frame);
})();
