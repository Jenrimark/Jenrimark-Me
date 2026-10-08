# 首屏检查记录

## 交付边界

完成首屏、人物鼠标追视、回正、暂停、触屏主动播放及首屏下方介绍衔接。完整履历、作品详情、主滚动叙事、CMS、公开部署仍排队。当前等待首屏用户验收。

内容依据为用户指定的最新简历；详细来源见 `content-source-2026-10-01.md`。

## 验证

- Node 内置测试：28 项通过。覆盖方向映射、中心死区、下右素材缺口、串行 seek、失败重试限制、超时静态回退、移动端播放、离开/滚动回正、减少动态效果、标签页切换、资源失败。
- 真实浏览器 1280×720：向右2秒、向上3.875秒、向左5.375秒、向下7秒均定位成功，最终没有待处理 seek，失败计数0。
- 中心回正：currentTime=0、strength=0、state=idle；向下滚动后暂停追视。
- 390×844 触屏模拟：默认静态；点击后 state=playing，视频实际时间前进；滚动后回到静态。
- 减少动态效果：state=paused、strength=0，不自动追视。测试结束已恢复浏览器原设置。
- 桌面与窄屏无横向溢出。最新预览无控制台 error/warn。
- 本地服务视频字节范围请求返回 HTTP 206；修复旧 Python http.server 首次缓冲时不支持 Range 导致的定位失败。
- 修复持续双重曝光：稳定追视使用一个完整视频姿态，正面图仅用于短暂过渡和故障回退。

## 已知限制

- 视频缺少下→右的完整转动路径，这个象限采用临近的真实姿态并短暂回正过渡。
- 转头不是实时三维模型，只有视频中已有姿态；不支持任意精确俯仰。
- 当前 H.264 全关键帧文件约21.3MB，为定位帧稳定性保留质量；公开部署前再做传输与移动网络性能优化。
- 移动端已做浏览器模拟检查，未声称完成所有真实设备兼容性验证。

## 本地启动

当前预览 http://127.0.0.1:8766/ 。服务使用本机已有 Vite，绑定本地回环地址，没有公开发布。

重启命令（在 PowerShell）：

```powershell
& 'C:\Users\Jenrimark\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\jenrimark.github.io\node_modules\vite\bin\vite.js' 'D:\DIY\site' --host 127.0.0.1 --port 8766 --strictPort
```

自动化测试：

```powershell
& 'C:\Users\Jenrimark\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test 'D:\DIY\site\tests\gaze-math.test.mjs'
```
