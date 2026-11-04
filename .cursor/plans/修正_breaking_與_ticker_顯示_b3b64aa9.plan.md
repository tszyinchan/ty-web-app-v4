---
name: 修正 Breaking 與 Ticker 顯示
overview: Breaking 完全沒字是因為容器寬度被算成 0;Ticker 在 OBS 無法調整文字樣式是因為 OBS 對 cqh 字級失效,而 overlay 沒有像 Clock/Weather 那樣補 vh 覆寫。兩者都用既有的 Weather 修法處理。
todos:
  - id: fix-breaking-width
    content: "Breaking: make .brk-window grid with both stacks in grid-area 1/1 so width:max-content works"
    status: completed
  - id: fix-ticker-font
    content: "Ticker: split positioned .ticker-item from inner .ticker-text that owns font-size and gap padding"
    status: completed
  - id: overlay-vh
    content: "cg-overlay.scss: add html.cg-overlay-on overrides using vh for .ticker-text and .brk-text"
    status: completed
  - id: docs-regression
    content: Update cg.mdc and cg.regression.md for the overlay vh rule and new checks
    status: completed
  - id: tsc-lint-bump
    content: Run tsc and npm run lint; propose 4.113.1 and wait for confirmation before commit
    status: completed
isProject: false
---

# 修正 Breaking 無字與 Ticker 在 OBS 樣式失效

## 原因說明

### 1. Breaking 完全沒有文字(Panel、瀏覽器、OBS 都一樣)
- `breakingWindowCss()` 在 [`cg.util.ts`](src/app/core/domains/cg/cg.util.ts) 為 `.brk-window` 設了 `width: max-content` 和 `overflow: hidden`。
- 但 [`cg-breaking.scss`](src/app/core/domains/cg/cg-breaking.scss) 裡唯一的子元素 `.brk-stack` 是 `position:absolute; inset:0`,不佔空間。
- 結果 `max-content` 寬度 = 0,`overflow:hidden` 把文字全部裁掉。截圖裡 Breaking 只剩背景圖就是這個原因。
- 這是我實作時的 bug,與 OBS 無關。

### 2. Ticker 在 OBS 無法調整文字樣式,且與 Panel/瀏覽器不同
- Panel 與瀏覽器 `/o/` 的 Size 調整是有效的。OBS 的文字大小固定不動,而且比其他兩者小約一半。
- OBS 的字級大約等於 1080p 畫面的預設 16px,代表 `font-size: calc(var(--cg-sub-font) * 1cqh)` 在 OBS CEF 沒有生效,回退成繼承字級。因此 Size 無論怎麼調,OBS 都不會變。
- 先前 Weather 與 Clock 也遇過同樣問題。當時的解法是:
  - 字級放在內層元素,不放在定位的 box 上。
  - 在 [`cg-overlay.scss`](src/app/apps/cg/cg-overlay.scss) 加 `html.cg-overlay-on .sub-text` 和 `.wx-cluster`,只在 overlay 強制使用 `vh`。
- 我新增的 `.ticker-item` 和 `.brk-text` 都沒有這個 overlay 覆寫,所以 OBS 繼承了錯誤字級。
- `gap` 以 `em` 計算,會跟著字級一起縮小,這是 OBS 裡 Ticker 間距看起來不對的原因。

## 修正內容

1. **Breaking 寬度**(`cg-breaking.scss`、`cg-breaking.html`)
   - 讓 `.brk-window` 變成 `display:grid`,`outgoing` 與 `incoming` 兩個 `.brk-stack` 都放在 `grid-area: 1 / 1`,改為 in-flow。
   - 這樣 `width:max-content` 才會依實際字寬撐開。交叉淡入淡出時兩層仍重疊。
   - 檢查 `overflow:hidden` 會不會裁到描邊,必要時加極小 padding。

2. **Ticker 字級放內層**(`cg-ticker.scss`、`cg-ticker.html`)
   - 把 `.ticker-item` 拆成:外層負責定位與 `transform`,內層 `.ticker-text` 負責 `font-size`、`padding-right: gap`。
   - 這樣和 Weather 的「字級不放在定位 box 上」一致。

3. **Overlay 覆寫**(`cg-overlay.scss`)
   - 新增 `html.cg-overlay-on .ticker-text` 使用 `calc(var(--cg-sub-font, 3.2) * 1vh)`。
   - 新增 `html.cg-overlay-on .brk-text` 使用 `calc(var(--cg-brk-font, 3.2) * 1vh)`。
   - 只影響 overlay。Panel 桌面預覽仍用 `cqh`,不受影響。

4. **文件**
   - [`cg.mdc`](.cursor/rules/cg.mdc):在「Overlay 用 `vh`」那條補上 Ticker 與 Breaking。
   - [`cg.regression.md`](src/app/apps/jaxfr/features/cg/cg.regression.md):新增 Breaking 有字、Ticker 在 OBS 改 Size 會變的項目。

5. **檢查與版本**
   - 跑 `tsc` 與 `npm run lint`。
   - 建議版本 4.113.1(bug fix = patch)。請你確認後再 commit 與 push。
   - 依規則不自動開瀏覽器。改完後建議切到 L2 再 `/verify`,並請你在 OBS 實際確認 Ticker 改 Size、Breaking 顯示文字。
