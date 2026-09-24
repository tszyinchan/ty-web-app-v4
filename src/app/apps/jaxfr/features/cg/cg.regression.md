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
- [ ] `.cursor/test-credentials.local.json` 存在；用 **user-a** 登入成功
- [ ] user-a 已有 CG feature grant（沒有則 Welcome 看不到，`/cg/list` 會被送回 Welcome）
- [ ] `/cg/list` 沒有名稱以 `[TEST] CG` 開頭的 package；有的話先當 leftover 刪掉

---

## 場景

### A — 多個 package，不是寫死 CH36

| # | 操作 | 預期 |
|---|---|---|
| A1 | Welcome 點 **CG**，或開 `/cg/list` | 進入 package 清單 |
| A2 | 點 **New package**。Panel 已有一塊 Logo（sample PNG 在 Stage 左上）。Name = `PKG_A`，Role = Channel。Appear = **Fade** 400ms。Save | 頂列出現 Package Output URL；清單之後看得到 Channel |
| A3 | 再 New，Name = `PKG_B`，Role = Source，Save | 兩個 package 並存；Role 標 Source |

### B — Panel On/Off，定位在 Stage 上

| # | 操作 | 預期 |
|---|---|---|
| B1 | 打開 `PKG_A`。頂列小 16:9 Stage；下面只有 Layer 格子。點 Logo tile | 進入該 Layer 設定頁（Stage + X/Y/圖）。Panel 底下沒有 inspector |
| B1b | 在 Layer 頁點 **Choose local image**，選本機 PNG | Stage 換成該圖；欄位顯示 embedded 檔名，不是 `C:\\` 路徑 |
| B2 | 改 X / Y / Width / Scale | Stage 裡的 logo 跟著動，不必重載 |
| B3 | 切 **Alpha** / **Studio** | Alpha 是棋盤（只在後台）；Studio 是暗底。都不是綠幕 |
| B4 | 回到 Panel，撥 Logo 的 On/Off toggle | tile 變淡但圖還在。頂列 **Panel Stage 預覽**依 Package Appear 淡出或 cut。Package Output **先不要變**（還沒 Save） |
| B5 | Save | 成功。約 **300ms** 內 **只有這次有變的 layer** 用 Package `duration_ms` 淡入/淡出（`0` = 瞬間 cut）。已經 On 的 layer 維持原樣，不會整場閃一次。重整後位置、圖、On/Off、Appear 還在 |
| B6 | 點 catalog 裡灰色的 Clock / Title | 不能加（soon）。**Logo** 與 **Subtitle** 能加；加完進 Layer 設定頁 |
| B6b | `PKG_A` 加 **Subtitle**。Paste 或 Load **.txt / .srt**。點 queue 上氣。**Blank**：氣上沒字，queue 仍記住那一句並捲到該句。再 Down 從下一句繼續；Up 把剛那句拉回來。**不要 Save** | Stage / overlay 約 300ms 換成亮起的那句。字級 Scale 1 ≈ ffmpeg 16.1（畫面高 5.6%），白字、細黑邊、ScaleY 1.11，不是粗 stroke。Subtitle desk 只有 Scale / Y / Width。Layout / On/Off 仍要 Save |
| B7 | `PKG_A` 加第二層 Logo，兩層都 On，Save。再開 overlay。然後只 Off 其中一層，Save | overlay 裡那一層淡出；另一層 Logo **一直在、不眨眼** |
| B8 | `PKG_A` 改 Appear = **Cut**（或 Fade ms = `0`），Save。再開 overlay，On/Off 一層再 Save | overlay **瞬間**切，沒有 400ms fade。改回 Fade 400、Save，之後又是淡入淡出 |
| B9 | `PKG_A` 兩層 Logo。拖第二層到第一格，看 Panel Stage：後拖到前面的那層應蓋在上面。Save，overlay 順序一樣 | 沒 Save 前 overlay 不變。數字 1 = 最後面 |
| B10 | Panel 改 Look = **B&W**。Panel Stage 用 Package ms **淡成灰**，已 On 的 layer **z-order 不變**。Save，overlay 同樣淡灰。改回 Color、Save | overlay 淡回彩色。Layer Output 跟 Package 同一個 look |

### C — Package Output 是預設；Layer Output 也能開

| # | 操作 | 預期 |
|---|---|---|
| C1 | Copy **Package Output**，新分頁打開 | URL 是 `http://cg.localhost:4200/o/…`（正式是 `cg.tszyin.com/o/…`）。真透明底 + package 裡所有 On 的 layer。壞 token 是空白，不是 Jaxfr 登入頁 |
| C2 | 回到後台改 Scale，**先不要 Save**，看 overlay | overlay **不變**。Save 之後約 300ms，**這一層** 更新；其他 On 的 layer 不動 |
| C3 | Copy Logo 的 **Layer Output**，另開分頁 | 同樣全幅透明，只畫那顆 Logo |

### CLEANUP

| # | 操作 | 預期 |
|---|---|---|
| Z1 | 刪除 `PKG_A`、`PKG_B` | 清單不再出現 `[TEST] CG` |
