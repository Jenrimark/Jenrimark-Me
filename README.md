# Jenrimark · 吴汉东

以本人已确认的黏土人物为核心的个人作品集。原生 HTML/CSS/JavaScript，零运行时第三方依赖；本地内容管理使用 Node 内置服务。

## 网站

- 公开网址：https://jenrimark.github.io/jenrimark-portfolio/
- 本地网站：http://127.0.0.1:8766/
- 本地内容后台：http://127.0.0.1:8766/admin/

首屏鼠标追视、履历时间线、滚动叙事、作品夹、八个案例、分类筛选、案例切换、技能荣誉与联系入口均可使用。手机与减少动态效果模式采用适合阅读的静态布局，并允许用户主动播放人物动画。

## 启动

需要 Node.js 22 或以上，无须 npm install。

```sh
npm start
```

后台首次生成密码，保存在 `.local/admin-access.txt`，仅供本机查看。服务只监听 127.0.0.1。当前电脑可运行 `start-portfolio.ps1` 自动寻找已安装 Node 并打开后台。

## 更新内容

1. 登录后台，选择作品、履历或站点设置。
2. 编辑后点击“保存草稿”，再点击“预览”。
3. 作品状态为“发布”的条目才会进入正式站；设为“草稿”可下线。
4. 点击“发布到本地”，先检查本地正式网站。
5. 点击“同步公开站点”，推送发布内容并触发 GitHub Pages 构建。需要本机已登录 GitHub 且具有仓库写权限。

封面支持 5MB 以内 PNG、JPG、WebP。未上传时使用原生主题视觉。当前项目主题图不是产品截图。未经确认的日期、数据与经历不自动补齐。

管理后台为本地应用；GitHub Pages 仅托管公开静态网站。草稿、登录凭据、备份均在 `.local/`，不会进入部署产物。发布构建只收录公开作品引用的上传图片。

## 检查与构建

```sh
npm test
npm run build
```

产物在 `dist/`，可部署到任意静态托管平台。默认 GitHub Actions 对 main 分支执行测试、构建和 Pages 发布。

## 目录

约定：**代码与正式资料用英文路径，过程与草稿用中文路径**。

```
D:/DIY/
│
├─ README.md                 项目说明：网址、启动方式、更新流程、目录约定
├─ package.json              npm 入口：start / build / test / deploy 四个脚本
├─ start-portfolio.ps1       Windows 一键启动：找 Node → 起本地服务 → 打开后台
├─ .gitignore                忽略规则：.local、dist、过程资料、图片/视频大文件等
│
│  ─────────────── 一、正式网站代码 ───────────────
│
├─ site/                     公开网站源码（原生 HTML/CSS/JS，零第三方运行时）
│  ├─ index.html             页面骨架，挂载 v3 场景播放器
│  ├─ portfolio.css          作品集主样式（时间线、作品夹、案例、筛选）
│  ├─ portfolio.mjs          作品集主逻辑（路由、筛选、案例切换、滚动叙事）
│  ├─ styles.css             全局基础样式（字体、色板、布局、响应式）
│  ├─ content.json           站点内容数据（作品、履历、技能荣誉、联系方式）
│  ├─ content-model.mjs      内容模型：校验/清洗/导出公开字段
│  ├─ gaze.mjs               首屏鼠标追视控制器（指针→姿态、串行 seek、失败回退）
│  ├─ gaze-math.mjs          追视数学：角度、阻尼、屏幕分区映射
│  ├─ v3-scene.mjs           V3 场景播放器：鼠标模式 + 滚动模式切换
│  ├─ v3-scene.css           V3 场景播放器样式
│  ├─ media/                 正式网页素材（构建时原样拷贝）
│  │  ├─ formal-v4.mp4           首屏追视与全流程滚动叙事共用视频
│  │  ├─ hero-poster.png         视频未加载时的静态封面
│  │  └─ uploads/                后台上传的封面图（.gitkeep 占位）
│  └─ tests/                 站点单元测试
│     ├─ content.test.mjs        内容模型：草稿隔离、字段校验、转义
│     ├─ gaze-math.test.mjs      追视数学：角度、死区、平滑、边界
│     └─ v4-scene.test.mjs       场景播放器：鼠标/滚动切换、seek 合并
│
├─ admin/                    本地中文内容管理后台（只监听 127.0.0.1）
│  ├─ index.html             后台页面骨架（作品/履历/站点设置三个面板）
│  ├─ admin.mjs              后台逻辑：登录、草稿编辑、预览、发布、同步
│  └─ admin.css              后台样式
│
├─ scripts/                  工程脚本（Node）
│  ├─ server.mjs             本地服务：静态托管 + 后台 API + Range 视频流
│  ├─ build.mjs              静态构建：从 site/ 生成可部署的 dist/
│  └─ deploy.mjs             同步公开站点：推送发布内容并触发 Pages 构建
│
├─ tests/                    服务端测试
│  └─ server.test.mjs            HTTP：鉴权、草稿隔离、媒体 Range、上传
│
├─ dist/                     构建产物（npm run build 生成，可直接部署）
│  ├─ .nojekyll              关闭 GitHub Pages 的 Jekyll 处理
│  ├─ robots.txt             搜索引擎抓取规则
│  ├─ index.html / *.css / *.mjs / content.json   与 site/ 对应的发布副本
│  └─ media/                 仅打包公开作品引用到的素材
│
├─ docs/                     正式文档
│  └─ design/                设计、计划与验收记录（按日期命名）
│     ├─ project-brief.md        项目总说明：人物生成全过程（v1–v7）、方向图、动效
│     ├─ content-source-2026-10-01.md   内容来源说明（以最新简历为依据）
│     ├─ WORK-STATUS.md          工作状态快照
│     ├─ FINAL-QA.md             最终验收清单
│     ├─ 2026-10-01-hero-plan.md            首屏追视方案
│     ├─ 2026-10-02-hero-checks.md          首屏检查项
│     ├─ 2026-10-02-completion-plan.md      收尾计划
│     ├─ 2026-10-02-sticky-ip-scenes.md     粘性人物场景方案
│     ├─ 2026-10-02-visual-recovery-plan.md 视觉恢复计划（对照教程成品图）
│     ├─ 2026-10-04-pdf-gap-plan.md         教程成品差距分析
│     ├─ 2026-10-05-scene-transition-prompts.md  场景转场生成提示词全集
│     ├─ 2026-10-05-scrollytelling-stage.md      滚动叙事阶段方案
│     ├─ 2026-10-05-single-page-scroll-plan.md   单页滚动方案
│     ├─ 2026-10-05-transition-videos-T01-T03.md 转场视频 T01–T03 制作记录
│     ├─ 2026-10-05-website-build-prompts.md     网站搭建提示词
│     ├─ 2026-10-06-v2-video-generation-best-practices.md  视频生成最佳实践
│     └─ 2026-10-07-v3-scene-player-plan.md      V3 场景播放器方案
│
├─ assets/                   正式素材（已冻结、网站依赖的）
│  ├─ photos/                本人原始照片（人物生成的身份参考源）
│  │  ├─ 20260627_223214492.jpg
│  │  ├─ IMG_20250608_112327.jpg
│  │  ├─ IMG_20260625_092805_edit_674778568396392.png
│  │  └─ MEITU_20250724_145742817.jpg
│  ├─ avatar/                人物资产
│  │  ├─ approved/               已冻结基准
│  │  │  ├─ p01-avatar.png           唯一身份锁图（第七版获批）
│  │  │  └─ approval.md              获批记录
│  │  ├─ directions/              四方向图（追视用）
│  │  │  ├─ p02-right.png            向右看
│  │  │  ├─ p02-up.png               向上看
│  │  │  ├─ p02-left.png             向左看
│  │  │  ├─ p02-down.png             向下看
│  │  │  └─ p02-manifest.json        方向图清单
│  │  └─ motion/                  首屏动效
│  │     ├─ p06-approved.mp4        获批追视闭环视频
│  │     └─ references/             动效参考帧（01-front … 06-front-return）
│  ├─ scene/                 场景与转场成片
│  │  ├─ S02-sofa.png             沙发工作场景图
│  │  ├─ S03-folder.png           文件夹场景图
│  │  ├─ S04-fall.png             坠落结尾场景图
│  │  ├─ T00-hero-to-s01.mp4      转场：首屏 → S01
│  │  ├─ T00b-center-to-s01.mp4   转场：居中 → S01（备选）
│  │  ├─ T01-hero-to-journey.mp4  转场：首屏 → 履历
│  │  ├─ T02-journey-to-sofa.mp4  转场：履历 → 沙发
│  │  ├─ T03-sofa-to-fall.mp4     转场：沙发 → 坠落
│  │  └─ formal/                正式版归档
│  │     ├─ V1/ … V4/              四轮场景图迭代
│  │     ├─ V3/videos-v4/          V3 阶段转场视频
│  │     ├─ V4/全流程完整版.mp4     最终全流程视频
│  │     ├─ README.md              版本说明
│  │     └─ 归档.zip               历史版本打包
│  └─ reference/             教程参考资料
│     ├─ 表哥懂设计_网站制作完整流程与提示词.pdf     教程原版 PDF
│     ├─ 表哥懂设计_网站制作完整流程与提示词.md      教程 Markdown 解析版
│     └─ 表哥懂设计_网站制作完整流程与提示词-images/ 教程插图 12 张
│
│  ─────────────── 二、过程与草稿（中文目录） ───────────────
│
├─ 原型草稿/                 早期滚动叙事原型（已被 site/ 取代，保留可运行）
│  ├─ index.html             原型页面骨架
│  ├─ scrollytelling.css     滚动叙事样式
│  ├─ scrollytelling.js      滚动 + 首屏追视逻辑（引用 media/ 相对路径）
│  ├─ scene-transition.css   场景转场样式
│  ├─ scene-transition.js    场景转场逻辑
│  └─ media/                 原型素材
│     ├─ hero.mp4                首屏视频
│     ├─ S01.png … S04.png       四张场景图
│     ├─ T00.mp4 … T03.mp4       四段转场视频
│     └─ seq/                    视频抽帧序列（供滚动定位帧用）
│        ├─ T00/  f001.jpg … f091.jpg
│        ├─ T01/  f001.jpg … f100.jpg
│        ├─ T02/  f001.jpg … f151.jpg
│        └─ T03/  f001.jpg … f151.jpg
│
├─ 参考资料/                 教程随手查阅副本（解析版在 assets/reference/）
│  ├─ 表哥懂设计_网站制作完整流程与提示词.docx
│  └─ 表哥懂设计_网站制作完整流程与提示词.pdf
│
└─ 过程资料/                 制作过程全记录（不入 Git）
   │
   ├─ 人物设计/              黏土人物从 v1 到 v7 的生成过程
   │  ├─ 提示词/                 各版生成提示词
   │  │  └─ p01-prompt-v1.txt … p01-prompt-v7.txt
   │  ├─ 评审记录/               各版评审结论 + 像素级保真核对
   │  │  ├─ p01-review-v1.md … p01-review-v7.md
   │  │  └─ p01-v3/v4/v7-preservation-check.json
   │  ├─ 候选图/                 各版候选输出
   │  │  ├─ p01-avatar-v1.png
   │  │  ├─ p01-avatar-v5.png
   │  │  ├─ p01-avatar-v7.png         最终候选（复制为 assets 冻结版）
   │  │  └─ p01-avatar-v7-generated.png  原始生成图
   │  ├─ 方向图/                  上下左右方向图制作
   │  │  ├─ 提示词/  p02-down/left/right/up-v1.txt
   │  │  ├─ 原始图/  p02-down/left/right/up-v1.png
   │  │  ├─ 评审图/  头部/脖子对比图、review 报告
   │  │  └─ 脚本/    prepare-directions.py
   │  ├─ 动效视频/                首屏追视视频制作
   │  │  ├─ 提示词/  p06-prompt-v1.txt
   │  │  ├─ 成片/    p06-generated-v1.mp4、p06-silent-v1.mp4、提交包 zip
   │  │  ├─ 任务记录/ MCP 任务状态与上传/恢复记录（JSON）
   │  │  ├─ 评审图/  p06-review-v1.md、review.html
   │  │  ├─ 质检/    逐帧抽检（generated-v1/、independent-review/）
   │  │  ├─ 脚本/    mify-video-client.py、upload-references.py、inspect-video.py
   │  │  └─ README.md
   │  └─ 源图与脚本/             身份参考拼板与保头/换装脚本
   │     ├─ identity-reference-board-v1.jpg  A/B/C/D 四张照片拼板
   │     ├─ v5-identity-and-pdf-style.jpg    身份 + 教程风格拼板
   │     ├─ v6-calm-identity-reference.jpg   自然表情参考
   │     ├─ preserve-v2-head.py 等 3 个保头脚本
   │     ├─ build-reference-board.py 等 3 个拼板脚本
   │     └─ v2-v3-neck-check.png 等 7 张局部核对图
   │
   ├─ 场景生成/              场景图与转场视频的生成过程
   │  ├─ 提示词/                 场景/转场提示词与图片清单
   │  │  └─ S00-eye.txt、T00.txt、T01-v3.txt、T04-v4.txt 等
   │  ├─ 候选图/                 场景候选图（raw / bak / v2–v4）
   │  │  └─ S01-journey-raw.png … S04-fall-v4.png
   │  ├─ 背景参考板/             每个场景的背景参考拼板
   │  │  └─ S00-board.jpg … S04-board.jpg
   │  ├─ 参考图/                 hero-frame0.png、s00-s04-reference-board.jpg
   │  ├─ 任务记录/               MCP 任务 create/poll/state JSON
   │  │  └─ 命名：{片段}-{版本}-mcp-{create|poll}-{时间戳}.json
   │  └─ 脚本/                   t-video-client.py  视频任务客户端
   │
   ├─ 网页验收/              网页可视化验收
   │  ├─ 截图/                   各阶段页面截图
   │  │  └─ stage-hero/journey/about/contact…、final-home、public-mobile
   │  └─ 转场抽帧/               转场视频抽检帧
   │     └─ T01-01.png … T04-03.png
   │
   ├─ 教程解析/              教程 PDF 的结构化解析
   │  ├─ 页面文本/               逐页文本抽取
   │  │  ├─ page10.txt … page26.txt
   │  │  ├─ pdf_extract.txt         全文抽取
   │  │  └─ pdf_pages.txt           按页切分全文
   │  └─ 页面截图/               逐页渲染图
   │     ├─ ref-p01.png … ref-p34.png
   │     └─ 人物参考/  page-03/04/05/17.png   人物风格参考页
   │
   ├─ 外部调研/              外部资料抓取
   │  ├─ bili_BV1ere36CEbh.json   B 站视频元数据
   │  ├─ bili_comments.json       评论
   │  └─ bili_player.json         播放器信息
   │
   ├─ 设计草稿/              视觉探索草稿
   │  └─ visual-recovery.html     视觉恢复对照草稿页
   │
   └─ 临时脚本/              一次性工具与运行日志
      ├─ 脚本/                   一次性工具
      │  ├─ _reorg.py、_reorg_zh.py、_rewrite_paths_zh.py  目录整理脚本
      │  ├─ cdp-*.mjs             Chrome DevTools 截图/探测
      │  ├─ probe-*.mjs           页面元素/图层/比例探测
      │  ├─ fix-*.py、remap-*.py  批量修样式/脚本
      │  ├─ bili_*.py             B 站抓取
      │  ├─ docx-to-md.py         Word 转 Markdown
      │  └─ crop-shots.py、inspect-shots*.py  截图裁切与检查
      └─ 日志/                   本地服务运行日志与 pid
```

**隐藏目录**

| 目录 | 作用 |
| --- | --- |
| `.github/workflows/` | `pages.yml`：push 到 main 时自动测试 → 构建 → 发布 GitHub Pages |
| `.local/` | 不入 Git 的本机状态：`admin-access.txt` 后台密码、`draft.json` 内容草稿、`backups/` 内容备份、`qa-brow/` 浏览器验收裁切图 |
| `.mimocode/` | 本项目安装的技能包 |
| `.git/` | 版本库 |

**分工一句话**：`site/` + `admin/` + `scripts/` + `tests/` 是可运行的产品；`dist/` 是它的发布产物；`docs/` + `assets/` 是正式文档与冻结素材；三个中文目录归档完整制作过程——`原型草稿/` 留早期可跑的实验页，`参考资料/` 放教程原件，`过程资料/` 按人物、场景、验收、解析、调研、草稿、工具七个阶段保存全部中间产物。

## 实现边界

首屏使用已获批人物视频。后续长视频与蓝幕素材没有生成，滚动场景和作品文件夹采用网页原生图形实现，并支持反向滚动和静态回退。内容以作者指定的 [最新简历](https://jenrimark.github.io/acad-homepage/) 为依据。
