# 交接：收藏跳转高亮的对齐修复（2026-11-26）

> 这份文档是为了**把一次放错会话的讨论落回本工作区**。
> 讨论本来发生在一个 gaokao 题库会话里（误开），改动却做在本插件仓库里 ——
> 代码已经落地在磁盘上，只需要在这里留一份可查的记录。

## 症状（用户实测截图）

点收藏跳转过去后，摘录上的琥珀色高亮出现两种偏差：

1. **没对齐**：色块与文字基线/行高对不上；
2. **不均匀色块**：主要出现在**带英文/行内 code 的片段**上，那里会多出一条位置与高度都不同的带子。

## 根因

`client.js::paintRangeRects()` 把 `Range.getClientRects()` 的碎片**按量化后的 `top` 分行**：

```js
const key = String(Math.round(rect.top / 2) * 2)   // 旧规则
```

行内 `code` 渲染出的盒子**更矮、顶边比正文高 1–2px**，所以它的 `top` 落进另一个桶 ⇒
每个英文片段被当成"单独一行"，于是多画一条 top/height 都不同的色块。

## 改动（本仓库内）

`client.js::paintRangeRects()`：分行判据从"量化 top"改为**垂直重叠**，并让每条带取
该行所有片段的 `min(top) → max(bottom)`：

```js
const overlap = Math.min(candidate.bottom, bottom) - Math.max(candidate.top, top)
const smaller = Math.min(candidate.bottom - candidate.top, bottom - top)
if (smaller > 0 && overlap >= smaller * 0.5) { line = candidate; break }
```

- 每条视觉行**只出一条**色块（不再叠出第二条）；
- 行内 code 并回所属行，带子覆盖该行 ascent→descent ⇒ **相邻行高度一致**；
- 横向仍取整行 `min(left) → max(right)`，中英混排不再有断续小方块。

同时：`CHANGELOG.md` 增加 `[1.0.16] - 2026-11-26` 的 Fixed 条目；
`package.json` 版本 `1.0.15 → 1.0.16`。`node --check client.js` 通过。

## 怎么验证

1. **硬刷新**页面（`Ctrl+R`，必要时 `Ctrl+Shift+R`）—— 客户端插件的 `client.js` 是本目录直接加载的；
2. 点一条**摘录类**收藏跳到目标位置；
3. 期望：每行一条色块、边界贴合文字、中英混排不再溢出。

### 若仍有偏差

在浏览器控制台里找 `paint` 开头的那行诊断（来自 `paintRangeRects` 末尾的 `diag()`）：

```
paint firstRectTop=… count=… overlayTop=… firstRectLeft=… overlayLeft=…
```

- `firstRectTop` ≈ `overlayTop` ⇒ 几何已对，问题在别处（视觉/主题）；
- 两者差很多 ⇒ **overlay 坐标系**偏了（例如祖先有 transform），那是另一种成因，
  改法不在分行逻辑里，而在 `.dshfav-hl` 的定位容器上。

## 完整 diff

文件：`client.js`，函数 `paintRangeRects()` 里「按行合并」那一段
（改前在 1254–1276 行附近；改后的位置见下方行号）。

```diff
@@ client.js::paintRangeRects() @@
-      /* One rect per visual line: the inline fragments of a line would otherwise
-         stack their opacity and show steps. */
-      const byLine = {};
-      const visible = [];
-      for (let i = 0; i < rects.length; i += 1) {
-        const rect = rects[i];
-        if (!(rect.width > 0 && rect.height > 0)) continue;
-        if (rect.width > 1200) continue;
-        const key = String(Math.round(rect.top / 2) * 2);
-        const line = byLine[key];
-        if (!line) {
-          byLine[key] = { left: rect.left, top: rect.top, right: rect.left + rect.width, height: rect.height };
-        } else {
-          if (rect.left < line.left) line.left = rect.left;
-          const right = rect.left + rect.width;
-          if (right > line.right) line.right = right;
-          if (rect.height > line.height) line.height = rect.height;
-        }
-      }
-      Object.keys(byLine).forEach(function (key) {
-        const line = byLine[key];
-        visible.push({ left: line.left, top: line.top, width: Math.max(1, line.right - line.left), height: line.height });
-      });
+      /* One rect per visual line: the inline fragments of a line would otherwise
+         stack their opacity and show steps.
+         Line membership is decided by VERTICAL OVERLAP, not by a quantized top.
+         An inline code span renders a shorter box whose top sits a pixel or two
+         above the surrounding prose; bucketing by `Math.round(top / 2) * 2` (the
+         previous rule) dropped it into its own bucket, so every English/code
+         fragment got a second band with a different top and height — the amber
+         overlay looked uneven and stepped on exactly those tokens. Overlap
+         clustering keeps such a fragment on the line it belongs to, and the band
+         then spans that line's full ascent→descent, so consecutive lines match. */
+      const lines = [];
+      for (let i = 0; i < rects.length; i += 1) {
+        const rect = rects[i];
+        if (!(rect.width > 0 && rect.height > 0)) continue;
+        if (rect.width > 1200) continue;
+        const top = rect.top;
+        const bottom = rect.top + rect.height;
+        let line = null;
+        for (let j = 0; j < lines.length; j += 1) {
+          const candidate = lines[j];
+          const overlap = Math.min(candidate.bottom, bottom) - Math.max(candidate.top, top);
+          const smaller = Math.min(candidate.bottom - candidate.top, bottom - top);
+          /* Half the smaller box is enough: a prose box and a code box on one
+             line overlap by most of the shorter one, while neighbouring lines
+             only touch at their edges. */
+          if (smaller > 0 && overlap >= smaller * 0.5) {
+            line = candidate;
+            break;
+          }
+        }
+        if (!line) {
+          lines.push({ left: rect.left, right: rect.left + rect.width, top: top, bottom: bottom });
+          continue;
+        }
+        if (rect.left < line.left) line.left = rect.left;
+        if (rect.left + rect.width > line.right) line.right = rect.left + rect.width;
+        if (top < line.top) line.top = top;
+        if (bottom > line.bottom) line.bottom = bottom;
+      }
+      const visible = [];
+      for (let i = 0; i < lines.length; i += 1) {
+        const line = lines[i];
+        visible.push({
+          left: line.left,
+          top: line.top,
+          width: Math.max(1, line.right - line.left),
+          height: Math.max(1, line.bottom - line.top),
+        });
+      }
       store.setHighlightRects(visible);
```

等价替换规则（便于 review）：

| 维度 | 改前 | 改后 |
|---|---|---|
| 分行判据 | `Math.round(top / 2) * 2` 相同的进同一桶 | 与已有行**垂直重叠 ≥ 较矮者 50%** 进同一行 |
| 行高 | 取该桶内**最大** `height`（top 取首条） | 取该行 `min(top) → max(bottom)`，即全 ascent→descent |
| 横向 | 桶内 `min(left)/max(right)` | 相同 |
| 结构 | `byLine` 对象 + `Object.keys` 二次遍历 | `lines` 数组，一趟聚类 |
| 输出 | `{left, top, width, height}`（height 可能不齐） | 同上，但每行一条且高度一致 |

## 备注

- 本插件目录**不是 git 仓库**（无版本控制），改动只存在于工作目录中；
- 相关代码位置：`client.js` 的 `paintRangeRects()`（改后约 1208–1303 行），
  渲染在 `className: 'dshfav-hl'`（约 2880 行），样式 `.dshfav-hl{position:fixed;…}`（约 1043 行）；
