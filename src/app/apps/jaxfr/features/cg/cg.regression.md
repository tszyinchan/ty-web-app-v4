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
- [ ] 已在 Supabase 跑過 `supabase/sql/cg-traffic-v1.sql`（流量最佳化：`rev`、`tyapp_cg_get_output_state_by_token`；**一定要在前端部署前跑**，可重跑）
- [ ] `.cursor/test-credentials.local.json` 存在；用 **user-a** 登入成功
- [ ] user-a 已有 CG feature grant（沒有則 Welcome 看不到，`/cg/list` 會被送回 Welcome）
- [ ] `/cg/list` 沒有名稱以 `[TEST] CG` 開頭的 package；有的話先當 leftover 刪掉

---

## 場景

### A — 多個 package，不是寫死 CH36

| # | 操作 | 預期 |
|---|---|---|
| A1 | Welcome 點 **CG**，或開 `/cg/list` | 進入 package 清單。**有**全域 AppToolbar（跟 Attendance / Article 一樣：標題 CG、回 Welcome、Refresh、New package）。內容是 `standard-list-view` 列 + Article 同款 `mat-form-field` 搜尋（不是自製卡片格子）。**沒有**頁面切換動畫。Panel（`/cg/edit`）仍**沒有**全域 toolbar。清單不再鎖 `width=1280`；進 Panel 才鎖桌面寬 |
| A2 | 點 **New package**。預設 **Studio mode**。Name = `PKG_A`。頂列順序：**Take/Create** 在雲端狀態**左邊**。點 **Create** | 建立成功；狀態變 **On air**；Copy OBS（content_copy）可用 |
| A3 | 再 New，Name = `PKG_B`，Role = Source，Create | 兩個 package 並存 |

### B — Panel On/Off，定位在 Stage 上

| # | 操作 | 預期 |
|---|---|---|
| B0 | 打開 `PKG_A`（Studio mode 開）。關掉 **Studio mode** switch（在監看區上方） | 單監看 176px；**Take** 隱藏（留 spacer）。再開 → 兩監看與 **Take**（在 On air 狀態左邊）回來 |
| B0a | Studio mode **關**（Direct）：撥 Logo On/Off，或改 Look | ~0.5s auto-save；無 Take 鈕 |
| B1 | Studio mode 開。監看區上方：Studio mode switch、緊挨右邊的 **Take**、右側 ☁ On air。頂列 Back + Package + Alpha/Dim + Copy OBS。左下深紅白字 Delete package。Layers 標題旁 Alpha/Dim。點 Logo tile | tile：**上** drag_indicator+序號+On-Off，**下** 名稱。desk **左** Stage + Name\|Look 並排（**沒有** Layer Studio mode；Layer 在 On air 時 Stage 上方出現「This layer is on air. Edits go to OBS now.」） + Source + Copy to package + 深紅白字 Delete layer + Copy layer OBS；**右** Place |
| B1b | 開任一 Layer desk → Delete layer → confirm | 留在同一 Package Panel（`/cg/edit/:id`），**不要**跳 `/login`。draft 少一 tile；Studio 下需 Take 才寫 DB |
| B1c | List 點 package → Panel；點 tile 開 desk → 再點同 tile 關；Back → list；New package | URL 皆為絕對 `/cg/…`，不要進 `/login`。Overlay 複製鈕產生 `cg.*.tszyin.com/o/…`（或 localhost） |
| B1a | `PKG_A`（Studio）加新 Logo（未 Take）。看 desk 小監看 | desk 可預覽草稿；**尚未有 DB id 前** Layer Live 不會寫上氣。Take 後才有 layer id，之後改內容才 live（Layer 內容一律 Live） |
| B1d | Package Studio：改已有 id 的 Logo Scale／圖。**不要**碰 On/Off | Package **不**變 Unsaved／Take；Package On air／overlay 內容立刻變 |
| B1e | Studio：Off Logo → Take → 開 desk 改 Scale | Package Pending／On air **不**畫該層；desk 監看**仍**顯示。改完 On → Take 才回混音 |
| B1b | 已 Take 過的 Logo：Choose local image | ~0.5s 後 Package **On air** 與 overlay 換圖（不必再 Take）。Storage URL |
| B2 | 改 Logo Anchor／X／Y／Scale（Package Studio，已有 layer id） | Package Pending 與 **On air** 都動（內容 Live）；不必 Take；Package 不 Unsaved。Top right + 小 X/Y → 靠右上。Outline 開 → desk 黃框紅影；OBS 無框 |
| B2a | Logo Place 右欄 | 只有 Anchor／X／Y／Scale／Outline；無 Unit／Width；輸入框非全寬；滑鼠停在 X／Y／Scale 上滾輪可加減 |
| B2k | 九宮格定位（Logo 與 Subtitle 都測）：X=4、Y=4，逐一點 9 個 Anchor | 四個角落各自靠對應角落、離邊約 4；Top/Bottom center 只靠上/下邊；Center left/right 只靠左/右邊；永遠在畫面內 |
| B2l | Logo／Subtitle 選 Top center | X 欄變灰顯示「—」且不能輸入、滾輪無效；Y 照用。改選 Center left → Y 灰、X 可用。選正中 Center → X、Y 都灰，內容在畫面正中 |
| B2m | 先在 Top left 把 X 設 20，換成 Top center，再換回 Top left | 換成 Top center 時 X 被忽略；換回後 X 仍是 20（數值沒被改寫） |
| B2n | Subtitle Place：Anchor 下方有 Align 三顆按鈕。點 Anchor Top left | Align 自動變 Left，字幕框左邊緣在 Anchor 點（離左、上各 X、Y），字幕框貼著文字大小。再手動點 Align right → 框的右邊緣移到同一個 Anchor 點、往左延伸；News／Show preset 不變 Custom |
| B2o | Subtitle Anchor Bottom right（X=4、Y=11），依序點 Align right / center / left | right：框右邊緣在 Anchor 點，整個框在畫面內；center：框中心在 Anchor 點，一半超出畫面右側；left：框左邊緣在 Anchor 點，整個框在畫面外。垂直位置三次相同；tile、desk、overlay 一致 |
| B2o2 | Subtitle Anchor Bottom center + Align left / right；Anchor Bottom left + Align right | Bottom center：框左（或右）邊緣在畫面水平中心，不自動夾回畫面；Bottom left + right：框右邊緣在離左邊 X 處、往左超出畫面。皆不被限制在畫面內 |
| B2o3 | Subtitle 一句兩行（含 `\n`）的 cue，各 Align 值 | 框寬跟最長那行；兩行文字靠左／置中／靠右與 Align 同方向；cue 換句淡出時舊句貼在同一邊緣，不跳位 |
| B2p | 新加 Subtitle | 預設 Bottom center、Align center，約離底部 11%（外觀同舊預設）；Place 沒有 Width 欄（只有 X / Y / Scale）；Style 區沒有「文字對齊」下拉 |
| B2b | Logo desk 沒有 Studio mode / Apply / Discard。離開 desk（關 tile、Back）不會出現 confirm | 一律 Live，沒有「Discard and leave」提示 |
| B2e | On air 監看 = 實際播出：Studio 與 Direct 都做：改 Scale、撥 On/Off（Take）、改 Look、cue Down，同時開 overlay 分頁 | Panel **On air** 與 overlay 逐項一致（位置、大小、灰階、字幕句）；On air 比編輯晚約 0.5–1s（debounce + RPC）。Direct 模式 On air 也走這條，不是草稿 |
| B2f | 斷網（或封鎖 Realtime）後改 Logo Scale | 出現錯誤提示；Panel **On air** 不更新（不顯示沒送到 OBS 的內容） |
| B2g | Subtitle 設定 Font / Size / Color / Stroke 後看 Layer tile 與 desk 監看 | tile 與 desk 字幕樣式一致（tile 不再只套 preset） |
| B2h | 同一個 Logo（預設 px 位置，圖片較大）在 tile、desk、overlay 比例 | 三處相對位置與大小一致（px 以 1920 為基準，不是在小監看上放大） |
| B2i | Subtitle cue 後重新整理 Panel，再按 cue Down | overlay 立刻換句（不必等 30s poll） |
| B2j | Studio：Logo Off → Take → 開 desk | desk 不顯示 on-air 警示；On → Take 後警示出現 |
| B3 | 頂列 Package / Layers 標題旁 **Alpha / Dim** | 監看底換（棋盤 / 暗底） |
| B4 | Studio mode：撥 Logo On/Off | tile 變淡但仍看得到縮圖。Pending 淡出。On air 先不變（混音仍等 Take）。開 desk：監看**仍顯示**該層。Package **變** Unsaved |
| B5 | **Take**（Studio） | On air 追上 Pending 的 On/Off、排序、Package 欄位；**不**靠 Take 重寫 Layer 內容 |
| B6 | 點 catalog 裡灰色的 Clock / Title | 不能加（soon）。**Logo** 與 **Subtitle** 能加 |
| B6b | 加 Subtitle，Cue 上氣，**不要 Take** | overlay 立刻換句。Layout / Layer Look / Style 在有 id 後也立刻上氣（Layer Direct） |
| B7 | 兩層 Logo On，Take。再開 overlay。Off 一層再 Take | 那層淡出；另一層不眨眼 |
| B8 | Appear = Cut，Take。On/Off 再 Take | Host 瞬間切 |
| B8a | Package Appear = Fade。切 Logo Look Color↔B&W（不要改 On/Off） | Look **瞬間**切（不跟 Package Fade）；On/Off 仍用 Package Appear |
| B8b | Package Look = B&W（已 Take）。Layer Look = Color。看 tile 與 desk | tile／Package 監看／OBS **灰**；desk 大監看仍 **彩色**（Layer Look only） |
| B9 | 拖排序（Studio），再 Take | 沒 Take 前 On air / overlay 不變 |
| B10 | Package Look = B&W（Studio），再 Take | Take 前 On air 仍彩色（Package 欄位） |
| B11 | Subtitle Look = Color，Package B&W，Take | 全部仍灰 |
| B12 | Style = Show，不要 Take（已有 id） | Package On air / overlay 改 Show（Layer Direct）；Package 不 Unsaved |
| B13 | Subtitle Copy to `PKG_B` | 新 Layer、Blank |
| B14 | 未 Take 改 Scale（Studio，已有 id） | Package On air 也變（Layer Direct）；On/Off 仍要 Take；Package 不因 Scale 而 Unsaved |
| B15 | Cue = Cut。↓（cue down） | 字幕瞬間換句 |
| B16 | 視窗縮到手機寬 | 仍是桌面三欄 |
| B17 | Load 含雙行 cue 的 .srt（約 2000 句）。點中段 queue、看 Panel On air 與 overlay | 同一句；queue 筆數 = cue 數（雙行 cue 不算兩筆）。重整 Panel 後筆數不變 |
| B18 | 連按 Down 約 20 次 | overlay 最後停在與 Panel 相同的一句（不亂序、不拆行） |
| B19 | 1920×1080 開 Subtitle desk | Place / Style / Cue / queue 都點得到；窄於約 1300px desk 時可捲。Font 有 Web fonts / Installed on OBS PC；Other… 會出現文字框 |
| B20 | Subtitle：選華康中黑體 (DFHei)，句子含中文與 English 123。再點 Bold、Italic、Underline、Strikethrough，以及 Gradient | 中文、英文、數字都是同一字體（英文不再是 Segoe UI）；英數字距仍比中文緊。四個樣式作用在整句。Gradient 出現 End color 與 Angle，填色是雙色、描邊仍單色。關掉 Gradient 回到實色。沒有這些新欄位的舊字幕維持 Regular、無底線、實色 |

### C — Package Output

| # | 操作 | 預期 |
|---|---|---|
| C1 | 點 Copy OBS（content_copy），另開分頁 | `cg.localhost:4200/o/…`（或正式 `cg.tszyin.com`）。真透明。壞 token 空白 |
| C2 | Studio：改 Scale（已有 id），不要 Take，看 overlay | overlay / Package On air **立刻**變（Layer Direct） |
| C3 | Layer desk 點 Copy OBS（Layer output） | 只畫那層 |
| C4 | Overlay 已開。Panel cue Down | overlay **立刻**換句（小 cue broadcast，不必等 30s poll） |

### T — 流量（Network 面板 / Supabase 請求數；OBS 畫面行為必須與改版前一致）

| # | 操作 | 預期 |
|---|---|---|
| T1 | Overlay 開著、不操作 2 分鐘，看 Network | 每 30s 只有一個 `tyapp_cg_get_output_state_by_token`（幾百 bytes）；**沒有** `tyapp_cg_get_output_by_token` |
| T2 | 連按 cue Down ~10 次，看 Network | overlay 即時換句；poll 仍只打 state RPC，不下載完整 output；Layer cue RPC 照常寫 DB |
| T3 | 只改 Layer **Name**（有 id） | DB 更新；**沒有**新的 Realtime broadcast，也沒有 `get_output_by_token`；overlay 不眨眼 |
| T3b | 改 Scale／Anchor／Look／Style | overlay 仍在約 0.5–1s 內變（有 publish）；改回原值再改，同樣有 publish |
| T4 | Studio：只改 Package **Name**／Role 再 Take | 不產生 broadcast；改 On/Off、排序、Duration、Look 再 Take → overlay 照舊更新 |
| T5 | 只開 Package Output overlay（不開 Layer Output），改 Layer 內容 | Package overlay 正常更新；Layer token 不 broadcast（Presence 無人聽）。再開一個 Layer Output 分頁後改內容，該分頁也更新 |
| T6 | Take 後看 Network | 沒有緊接的 `tyapp_cg_package` + `tyapp_cg_layer` 完整重抓；Panel 狀態（On air、Layer id）正確 |
| T7 | 暫時斷網 30s 後復網 | overlay 保持原畫面不變空白；復網後自動對齊（一次 full fetch） |

### W — 滑鼠滾輪（Layer desk 與 Package Appear）

| # | 操作 | 預期 |
|---|---|---|
| W1 | Logo desk：滑鼠停在 X 上滾（不點）：往上、往下 | 每格 ±0.1；Alt ±0.01；Shift ±1；預覽立刻變；desk 不跟著捲動 |
| W2 | Scale 滾到底（往下） | 停在 0.05，不再變；到底後繼續滾不產生新的 Network 寫入 |
| W3 | Subtitle desk：Size／字距／行距／Scale X／Scale Y／Stroke／Shadow Distance／Radius 各滾一格 | 步進依序 0.1／0.01／0.05／0.05／0.05／0.01／0.5／0.5；News 會變 Custom |
| W4 | 字距（預設 0.104）往上滾一格 | 對齊格線 → 0.11，再一格 0.12 |
| W5 | Shadow Angle：135 往上滾；滾過 360；0 往下滾 | 步進 15（Alt 1、Shift 45）；360 之後回 0；0 往下變 345 |
| W5b | Gradient Angle（先開 Gradient） | 與 Shadow Angle 相同步進與回繞 |
| W6 | Cue ms 往下滾到底 | 停在 50，不變成 Cut；ms 欄位不消失。往上到 5000 停住 |
| W7 | Cue ms 連續滾約 2 秒，看 Network | 只有停手後約 0.5s 一次 `tyapp_cg_layer` update + 一次 publish |
| W8 | Package Appear ms 滾輪（Studio） | 步進 50；Studio 要 Take 才上 OBS |
| W9 | Font 下拉：滑鼠停在上面往下滾到底 | 依選單順序換字體（含 Default），不會選到「Other…」；到底停住 |
| W10 | Copy to package 下拉滾輪 | 在「Choose…」與各 package 間移動；不會自動 Copy |
| W11 | X 被置中錨點忽略（顯示 `—`） | 滾輪無作用 |

### Clock / Weather

| # | 操作 | 預期 |
|---|---|---|
| K1 | 新增 Clock layer | Desk 有 Background、Text place、Style、Clock。Stage 右上顯示香港時間，每秒 +1 |
| K2 | Format 改 `y年M月d日 HH:mm:ss`，Language 繁體中文 | 畫面上有「年」「月」「日」與中文星期（若格式含 EEEE） |
| K3 | Timezone 改 Tokyo | 時間改成東京，與香港差 1 小時 |
| K4 | Custom，輸入一個整分時間，按 Push | 立刻顯示該時間，下一秒 +1。只改輸入、不按 Push 不會上 OBS |
| K5 | 切回 Live | 回到現在時間 |
| K6 | Background 選一張圖，Anchor 與文字不同 | 圖與文字各自定位；Clear 後只剩文字 |
| K7 | 新增 Weather，地點搜尋 Tokyo 並選取 | 一列顯示溫度、濕度、圖示。預設 Hong Kong 在選取前就有資料 |
| K8 | 等分鐘交界（或把 Temperature 改成 Celsius / Fahrenheit） | alternate 在奇偶分鐘切換 °C / °F；固定單位不切換 |

### CLEANUP

| # | 操作 | 預期 |
|---|---|---|
| Z1 | 刪除 `PKG_A`、`PKG_B` | 清單不再出現 `[TEST] CG` |
