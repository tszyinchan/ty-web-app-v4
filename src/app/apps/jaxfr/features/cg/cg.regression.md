# CG — Regression Script

改這個 feature 的行為（路由、package / layer 寫入、Panel On/Off、Package Output / Layer Output）時，**必須同步更新本檔**，否則該次改動不算完成。

| | |
|---|---|
| Feature 路由 | `/cg` |
| 子頁 | `/cg/list`、`/cg/new`、`/cg/edit/:id`、`/cg/edit/:id/layer/:layerId`；overlay `http://cg.localhost:4200/o/:token` 或 `https://cg.tszyin.com/o/:token` |
| 測試帳 | `.cursor/test-credentials.local.json` 的 **user-a**（USER） |
| Super Admin | Welcome 目錄列、`tyapp_user_feature_access` grant。劇本有標 `Needs Super Admin` 的才列 |
| 結果報告 | `.cursor/regression/runs/YYYY-MM-DD-cg.md`（gitignore） |

---

## 執行規則

1. 先完整讀完本劇本，再開始點。
2. `ng serve` 必須由使用者在可見 terminal 跑；確認 `http://localhost:4200` 可開。
3. Cursor browser **必須是使用者看得到的那個分頁**。
4. Cursor browser 用 **user-a** 登入。
5. 照 A → CLEANUP 順序跑。CLEANUP **一定要跑**。
6. **遇到 Fail：先旗標，不要改程式。**
7. 截圖不算驗證。

---

## 測試資料標記

| 代號 | 名稱 | 用途 |
|---|---|---|
| PKG_A | `[TEST] CG CH36` | Channel package + Logo layer |
| PKG_B | `[TEST] CG News SNG` | Source package（證明 package 不是寫死頻道） |

---

## 前置條件

- [ ] `http://localhost:4200` 已開
- [ ] 已在 Supabase 跑過 `supabase/sql/cg-v2.sql`（會 drop v1 的 `tyapp_cg_slot`）
- [ ] 已在 Supabase 跑過 `supabase/sql/cg-package-duration.sql`（package `duration_ms` + Output RPC；**不要**再跑一次 v2）
- [ ] 已在 Supabase 跑過 `supabase/sql/cg-package-look.sql`（package `look` color/mono；**不要**再跑一次 v2）
- [ ] 已在 Supabase 跑過 `supabase/sql/cg-layer-look.sql`（layer `look` inherit/color/mono；**不要**再跑一次 v2）
- [ ] `.cursor/test-credentials.local.json` 存在；用 **user-a** 登入成功
- [ ] user-a 已有 CG feature grant（沒有則 Welcome 看不到，`/cg/list` 會被送回 Welcome）
- [ ] `/cg/list` 沒有名稱以 `[TEST] CG` 開頭的 package；有的話先當 leftover 刪掉

---

## 場景

### A — 多個 package，不是寫死 CH36

| # | 操作 | 預期 |
|---|---|---|
| A1 | Welcome 點 **CG**，或開 `/cg/list` | 進入 package 清單。**沒有** 200ms 整頁 crossfade（Welcome → CG、以及 CG 裡 list / Panel 換頁都是瞬間）。其他 feature（例如 Welcome → Chat）Aero 仍有淡入。清單與 Panel 在窄螢幕仍是桌面排法（viewport `width=1280`，可 pinch），不是直向堆疊。**沒有**全域頂列 toolbar；清單自己的頁首有 Home（回 Welcome）、Refresh、New package。CG 按鈕**沒有**固定配色 — 跟著使用者自己的 Aero/Material 面板選擇換（Aero 是立體光澤按鈕，Material 是扁平藥丸按鈕），切 light/dark 也一起換。用 `Ctrl+Alt+H` 打開 Dev HUD 可以在畫面上直接切換確認 |
| A2 | 點 **New package**。頂列左 **Pending**、右 **On air**。Pending 左上有 sample Logo。**On air** 空白（還沒 Save）。Name = `PKG_A`，Role = Channel。Appear = **Fade** 400ms。Save | 頂列出現 Package Output URL；兩塊看起來一樣；清單之後看得到 Channel |
| A3 | 再 New，Name = `PKG_B`，Role = Source，Save | 兩個 package 並存；Role 標 Source |

### B — Panel On/Off，定位在 Stage 上

| # | 操作 | 預期 |
|---|---|---|
| B1 | 打開 `PKG_A`。左欄標題 **Package**（監看 + 控制），右欄標題 **Layers**（catalog + 格子）。Package 標題比 Layers 重。左欄標題列本身有 **Back**（回清單）、Save/Create、（既有 package 才有）Delete、sync 狀態小字——沒有全域頂列。點 Logo tile | 右邊出現該 Layer 設定（X/Y/圖），**上方多一組較小的 Pending/On air 監看**（只畫這一層，有自己的 Alpha/Studio 切換，跟左欄 Package 整體監看分開，不影響左欄尺寸）。左欄 Package 監看與控制留在左邊。URL 是 `/cg/edit/:id/layer/:layerId` |
| B1a | `PKG_A` 加一個新 Logo layer（還沒 Save）。看它 desk 上方那組小監看 | 這一層的 **Pending** 有內容；這一層的 **On air** 是空白（這層還沒被 Save 過一次）。Save 之後兩塊一樣 |
| B1b | 在右欄點 **Choose local image**，選本機 PNG | **Pending** 換成該圖；**On air** 仍是舊圖。欄位顯示 embedded 檔名，不是 `C:\\` 路徑 |
| B2 | 改 X / Y / Width / Scale | **Pending** 裡的 logo 跟著動，不必重載。**On air** 不動 |
| B3 | 切 **Alpha** / **Studio** | 兩塊小畫面一起換。Alpha 是棋盤（只在後台）；Studio 是暗底。都不是綠幕 |
| B4 | 回到 Panel，撥 Logo 的 On/Off toggle | tile 變淡但圖還在。**Pending** 依 Package Appear 淡出或 cut。**On air** 與 Package Output **先不要變**（還沒 Save） |
| B5 | Save | 成功。**On air** 追上 **Pending**。約 **300ms** 內 **只有這次有變的 layer** 用 Package `duration_ms` 淡入/淡出（`0` = 瞬間 cut）。已經 On 的 layer 維持原樣，不會整場閃一次。重整後位置、圖、On/Off、Appear 還在 |
| B6 | 點 catalog 裡灰色的 Clock / Title | 不能加（soon）。**Logo** 與 **Subtitle** 能加；加完右欄出現該 Layer 設定 |
| B6b | `PKG_A` 加 **Subtitle**。Paste 或 Load **.txt / .srt**。點 queue 上氣。**Blank**：氣上沒字，queue 仍記住那一句並捲到該句。再 Down 從下一句繼續；Up 把剛那句拉回來。**不要 Save** | **On air** / overlay 約 300ms 換成亮起的那句，並用 **這一層 Cue** crossfade（預設 Fade 400）。**不是** Package Appear。Cue Fade / Cut **立刻**上氣（不必 Save）。字級 Scale 1 ≈ ffmpeg 16.1（畫面高 5.6%），白字、黑邊是一圈（後面 stroke、前面填色）。Subtitle desk：Up/Down/Blank 下面就是 Cue Fade/Cut + ms，然後 News/Show。Layout / On/Off / Look / Style 仍要 Save |
| B7 | `PKG_A` 加第二層 Logo，兩層都 On，Save。再開 overlay。然後只 Off 其中一層，Save | overlay 裡那一層淡出；另一層 Logo **一直在、不眨眼** |
| B8 | `PKG_A` 改 Appear = **Cut**（或 Fade ms = `0`），Save。再開 overlay，On/Off 一層再 Save | overlay **瞬間**切 Host，沒有 400ms fade。**Cue 仍 Fade**（除非那層 Cue 也是 Cut）。改回 Fade 400、Save，之後 Host 又是淡入淡出 |
| B9 | `PKG_A` 兩層 Logo。拖第二層到第一格，看 **Pending**：後拖到前面的那層應蓋在上面。Save，overlay 順序一樣 | 沒 Save 前 **On air** / overlay 不變。數字 1 = 最後面 |
| B10 | Panel 改 Look = **B&W**。**Pending** 用 Package ms **淡成灰**，已 On 的 layer **z-order 不變**。**On air** 仍彩色直到 Save。Save，overlay 同樣淡灰。改回 Color、Save | overlay 淡回彩色。Inherit layer 跟 Package 同一個 look |
| B11 | Subtitle desk：Look = **Color**，Package 仍是 B&W。Save | **全部仍灰**（Package B&W 是總閘）。改 Package = Color、這一層 Look = **B&W**、Save → 只有這層灰，其他 Color/Inherit 層彩色 |
| B12 | Subtitle 改 Style = **Show**。**Pending** 立刻較大、偏金。**不要 Save**，看 **On air** / overlay | On air / overlay 仍是 News。Save 之後 overlay 變 Show。Cue 仍即時上氣，但 style 不跟著 patch |
| B13 | Subtitle Copy to `PKG_B`。打開 `PKG_B` | 新 Layer、新 Output URL、queue 有字但 **Blank**（`index` null）。`PKG_A` 原本那層不動 |
| B14 | 未 Save 時改 Scale。看兩塊小畫面 | **Pending** 變；**On air** 不變。Save 後兩塊一樣 |
| B15 | Subtitle Cue = **Cut**（不必 Save）。Package Appear 仍 Fade。Down 一句 | 字幕 **瞬間**換句（Pending 與 On air 一樣）。再把一層 Logo Off、**Save**：那層仍依 Package Appear **淡出** |
| B16 | 把視窗縮到手機寬（或 DevTools iPhone）。仍在 Panel | 仍是左監看 / 左 Package / 右 Layers 三欄，沒有直向改排。viewport meta 是 `width=1280`。離開 CG 後回到 `width=device-width` |

### C — Package Output 是預設；Layer Output 也能開

| # | 操作 | 預期 |
|---|---|---|
| C1 | Copy **Package Output**，新分頁打開 | URL 是 `http://cg.localhost:4200/o/…`（正式是 `cg.tszyin.com/o/…`）。真透明底 + package 裡所有 On 的 layer。壞 token 是空白，不是 Jaxfr 登入頁 |
| C2 | 回到後台改 Scale，**先不要 Save**，看 overlay 與 **On air** | overlay 與 On air **不變**。**Pending** 變。Save 之後約 300ms，**這一層** 更新；其他 On 的 layer 不動 |
| C3 | Copy Logo 的 **Layer Output**，另開分頁 | 同樣全幅透明，只畫那顆 Logo |

### CLEANUP

| # | 操作 | 預期 |
|---|---|---|
| Z1 | 刪除 `PKG_A`、`PKG_B` | 清單不再出現 `[TEST] CG` |
