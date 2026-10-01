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
- [ ] 已在 Supabase 跑過 `supabase/sql/cg-logo-storage.sql`（public bucket `cg-logo` + 清掉 `payload.imageUrl` 的 `data:image`；**不要**再跑一次 v2、**不要** drop `tyapp_cg_*`）
- [ ] `.cursor/test-credentials.local.json` 存在；用 **user-a** 登入成功
- [ ] user-a 已有 CG feature grant（沒有則 Welcome 看不到，`/cg/list` 會被送回 Welcome）
- [ ] `/cg/list` 沒有名稱以 `[TEST] CG` 開頭的 package；有的話先當 leftover 刪掉

---

## 場景

### A — 多個 package，不是寫死 CH36

| # | 操作 | 預期 |
|---|---|---|
| A1 | Welcome 點 **CG**，或開 `/cg/list` | 進入 package 清單。**有**全域 AppToolbar（跟 Attendance / Article 一樣：標題 CG、回 Welcome、Refresh、New package）。內容是 `standard-list-view` 列 + Article 同款 `mat-form-field` 搜尋（不是自製卡片格子）。**沒有** 200ms 整頁 crossfade。Panel（`/cg/edit`）仍**沒有**全域 toolbar。清單不再鎖 `width=1280`；進 Panel 才鎖桌面寬 |
| A2 | 點 **New package**。預設 **Studio mode**。Name = `PKG_A`。頂列順序：**Take/Create** 在雲端狀態**左邊**。點 **Create** | 建立成功；狀態變 **On air**；📋 可用 |
| A3 | 再 New，Name = `PKG_B`，Role = Source，Create | 兩個 package 並存 |

### B — Panel On/Off，定位在 Stage 上

| # | 操作 | 預期 |
|---|---|---|
| B0 | 打開 `PKG_A`（Studio mode 開）。關掉 **Studio mode** switch（在監看區上方） | 單監看 176px；**Take** 隱藏（留 spacer）。再開 → 兩監看與 **Take**（在 On air 狀態左邊）回來 |
| B0a | Studio mode **關**（Direct）：撥 Logo On/Off，或改 Look | ~0.5s auto-save；無 Take 鈕 |
| B1 | Studio mode 開。監看區上方：Studio mode switch、緊挨右邊的 **Take**、右側 ☁ On air。頂列只有 Back + Package。左下 Backdrop ⬚/⬛、Delete package、📋。點 Logo tile | desk **永遠單 On air**（Layer Direct），不是 Pending\|On air |
| B1a | `PKG_A`（Studio）加新 Logo（未 Take）。看 desk 小監看 | desk 可預覽草稿；**尚未有 DB id 前** Layer Direct 不會寫上氣。Take 後才有 layer id，之後改內容才 live |
| B1b | 已 Take 過的 Logo：Choose local image | ~0.5s 後 Package **On air** 與 overlay 換圖（不必再 Take）。Storage URL |
| B2 | 改 X/Y/Width/Scale（Studio，已有 layer id） | Package Pending 與 **On air** 都動；不必 Take |
| B3 | 左下 **Backdrop** 切 ⬚ / ⬛ | 監看底換（棋盤 / 暗底）。title 仍寫 Alpha、Dim |
| B4 | Studio mode：撥 Logo On/Off | tile 變淡。Pending 淡出。On air 先不變（混音仍等 Take） |
| B5 | **Take**（Studio） | On air 追上 Pending（On/Off、排序、Package 欄位） |
| B6 | 點 catalog 裡灰色的 Clock / Title | 不能加（soon）。**Logo** 與 **Subtitle** 能加 |
| B6b | 加 Subtitle，Cue 上氣，**不要 Take** | overlay 立刻換句。Layout / Layer Look / Style 在有 id 後也立刻上氣（Layer Direct） |
| B7 | 兩層 Logo On，Take。再開 overlay。Off 一層再 Take | 那層淡出；另一層不眨眼 |
| B8 | Appear = Cut，Take。On/Off 再 Take | Host 瞬間切 |
| B9 | 拖排序（Studio），再 Take | 沒 Take 前 On air / overlay 不變 |
| B10 | Package Look = B&W（Studio），再 Take | Take 前 On air 仍彩色（Package 欄位） |
| B11 | Subtitle Look = Color，Package B&W，Take | 全部仍灰 |
| B12 | Style = Show，不要 Take（已有 id） | Package On air / overlay 改 Show（Layer Direct） |
| B13 | Subtitle Copy to `PKG_B` | 新 Layer、Blank |
| B14 | 未 Take 改 Scale（Studio，已有 id） | Package On air 也變（Layer Direct）；On/Off 仍要 Take |
| B15 | Cue = Cut。Down | 字幕瞬間換句 |
| B16 | 視窗縮到手機寬 | 仍是桌面三欄 |

### C — Package Output

| # | 操作 | 預期 |
|---|---|---|
| C1 | 點 📋 **Copy OBS URL**，另開分頁 | `cg.localhost:4200/o/…`（或正式 `cg.tszyin.com`）。真透明。壞 token 空白 |
| C2 | Studio：改 Scale（已有 id），不要 Take，看 overlay | overlay / Package On air **立刻**變（Layer Direct） |
| C3 | Layer desk 點 📋（Layer output） | 只畫那層 |

### CLEANUP

| # | 操作 | 預期 |
|---|---|---|
| Z1 | 刪除 `PKG_A`、`PKG_B` | 清單不再出現 `[TEST] CG` |
