# Daily Log — Regression Script

改這個 feature 的行為（路由、資料寫法、UI 互動、權限）時，**必須同步更新本檔**，否則該次改動不算完成。

| | |
|---|---|
| Feature 路由 | `/daily-log` |
| 子頁 | `/daily-log/new`、`/daily-log/library`、`/daily-log/template`、`/daily-log/stats`、`/daily-log/others`、`/daily-log/viewers` |
| 測試帳 | `.cursor/test-credentials.local.json` 的 **user-a** / **user-b**（皆 USER） |
| Super Admin | 本 feature **沒有** Super Admin 專屬行為，略過，不要編造 `Needs Super Admin` 列 |
| 結果報告 | `.cursor/regression/runs/YYYY-MM-DD-daily-log.md`（gitignore） |

---

## 執行規則

1. 先完整讀完本劇本，再開始點。
2. `ng serve` 必須由使用者在可見 terminal 跑；確認 `http://localhost:4200` 可開。
3. Cursor browser **必須是使用者看得到的那個分頁**（見 `.cursor/rules/browser-must-be-visible.mdc`）。看不到就停。
4. Cursor browser 用 **user-a** 登入。需要第二人時改登 **user-b**，測完立刻切回 user-a。
5. 照 A → … → CLEANUP 順序跑。CLEANUP **一定要跑**，即使前面有 Fail。
6. **遇到 Fail：先旗標，不要改程式。** 把該列標 Fail、寫實際現象，繼續能安全跑的後續案例（尤其 CLEANUP）。整輪結束後把 Fail 清單問使用者，等他決定要修、要跳過、還是劇本過期。
7. 截圖不算驗證。每個步驟都要點、打字、送出、看畫面反應。
8. `confirm()` 對話框（刪除、Discard unsaved changes）要按預期選 OK 或 Cancel，並在報告寫你按了哪一個。

### Cursor browser（自動回歸時必讀）

- 開分頁：`browser_navigate` + `position: "active"`，然後 `browser_lock`。使用者看編輯器分頁 **Jaxfr:4200**。
- **Take Control** 常要**滑鼠移到該視窗上**才出現；沒有 overlay 但畫面有跟著點，仍可繼續。
- 不要用 `open_resource` 開 `http://localhost:4200`（Simple Browser，Agent 點不到）。
- 週曆日期若點擊被攔截：改開 `/daily-log?date=YYYY-MM-DD`。
- `[(ngModel)]` 欄位用 **slowly type**；建議清單要先 **click** 輸入框觸發 Angular `(focus)`，只 type 不夠。
- emoji picker 若點不到格子：可對 `emoji-picker` 送 `emoji-click`（`detail.unicode`）。
- native `confirm()`：Cursor browser 的 click 通常會帶 OK；在報告註明。
- 切 user-b：從 Jaxfr 登出再登入，不要開第二個隱藏分頁。

---

## 測試資料標記

所有本次建立的名稱都用此前綴，方便辨識與清理：

| 代號 | 名稱 | 用途 |
|---|---|---|
| ITEM_A | `[TEST] DL Item` | Library 新增，之後改名 |
| ITEM_A′ | `[TEST] DL Item Edited` | ITEM_A 編輯後的名稱 |
| ITEM_B | `[TEST] DL Pack` | 在 Template 用「打新名字」一併建立 Library + Template record |

測完後 Library / Template / 該日 day item / viewer grant **不得留下** `[TEST] DL`。

空的 `tyapp_daily_log_day` 列（mood / title 都清空後）目前沒有 UI 可刪，可接受；週曆圓點不應再亮。

---

## 前置條件

- [ ] `http://localhost:4200` 已開
- [ ] `.cursor/test-credentials.local.json` 存在；用 **user-a** 登入成功
- [ ] user-a 與 user-b 在**同一個 user group**（Viewers 才能互相授權；否則 G 標 Blocked 並寫原因）
- [ ] `/daily-log/library` 沒有名稱以 `[TEST] DL` 開頭的 item；有的話先當 leftover 清掉再開始
- [ ] 選一個**未來週、當天清單為空**的日期當測試日（不要用 user-a 已有真實紀錄的今天）。在報告開頭記下 `log_date = YYYY-MM-DD`

選日：`/daily-log` → 週列 `›` 往未來翻，點一個顯示 *Nothing on this date yet.* 的日子。

---

## 場景

### A — Library：新增 item

| # | 操作 | 預期 |
|---|---|---|
| A1 | Log 頂列點 **Library**，或開 `/daily-log/library` | 標題 Library；有 New item 欄 |
| A2 | New item 輸入 `ITEM_A`（`[TEST] DL Item`） | 出現 emoji / 顏色列與 Add |
| A3 | 點 **Add emoji**，選 ✅（或 picker 第一個 emoji） | 按鈕顯示該 emoji。若 picker 沒反應：標 Blocked，其餘案例用無 emoji 繼續 |
| A4 | 點顏色 **Blue** | Blue chip 呈 selected |
| A5 | 點 Add（aria-label `Add`） | 清單出現 ITEM_A；emoji、藍色點正確；輸入欄清空 |
| A6 | New item 再輸入完全相同的 `[TEST] DL Item` | 出現 `That name already exists.`；不要再按 Add |

### B — Library：編輯 item

| # | 操作 | 預期 |
|---|---|---|
| B1 | ITEM_A 列點 **Edit Library item** | 進入 inline editor |
| B2 | 文字改成 `[TEST] DL Item Edited`；顏色改 **Teal** | 欄位與 chip 更新 |
| B3 | 點 **Save** | 清單顯示新名稱與 teal；editor 關閉 |
| B4 | 再點編輯，改一個字，點 **Cancel** | 若有 `Discard unsaved changes?` 按 OK；清單仍是 Edited / Teal，editor 關閉 |

### C — Template：加入 record（既有 + 新建）

Template 是一包 **Library item 的 record**（排序清單）。Apply template 只把「該日還沒有的」加上去，不刪已有的。

| # | 操作 | 預期 |
|---|---|---|
| C1 | Library 頁點 **Open Template**，或開 `/daily-log/template` | 標題 Template |
| C2 | 「Add to Template」focus，點建議裡的 ITEM_A′ | 清單多一列 ITEM_A′；輸入欄清空。這是加 **record**，不是再造一個 Library item |
| C3 | 同一欄打 `[TEST] DL Pack`（ITEM_B），選 emoji、顏色 **Gold**，點 Add | Template 與 Library **都**出現 ITEM_B |
| C4 | ITEM_B 在 ITEM_A′ 下方時，對 ITEM_B 點 **Move up** | 順序對調。若只有一列，標 Blocked |
| C5 | ITEM_A′ 點 **Remove from Template**，confirm 按 OK | ITEM_A′ 從 Template 消失；再到 Library 確認 ITEM_A′ **仍在** |
| C6 | 再把 ITEM_A′ 加回 Template（重做 C2） | Template 又有 ITEM_A′ 與 ITEM_B |

### D — Log：套用 Template、勾選、編輯、備註

| # | 操作 | 預期 |
|---|---|---|
| D1 | 回 `/daily-log`，確認仍在選定的 `log_date` | 該日仍空（或僅有稍後案例留下的東西） |
| D2 | 點日期旁 **Use template** | ITEM_A′ 與 ITEM_B 出現在當日清單；進度 `0 / 2`（若 Template 還有使用者自己的舊 item，只要求這兩個有出現，並在報告註明多了哪些） |
| D3 | 點 ITEM_A′ 的勾選（aria-label `Mark complete`） | 該列呈完成態；進度分子 +1 |
| D4 | 再點一次（`Mark incomplete`） | 恢復未完成 |
| D5 | 點 ITEM_A′ 的 **Edit item**；Remarks 填 `test remark`；點 **Save** | 列上出現 `test remark` |
| D6 | 再開編輯，改 Remarks 後點 **Cancel** | 若有 discard confirm 按 OK；畫面上仍是 `test remark` |

### E — Log：從 Add item 頁加入（既有 Library）

| # | 操作 | 預期 |
|---|---|---|
| E1 | 先把 ITEM_B 從**當日**移除：編輯 → **Remove** → confirm OK | 當日只剩 ITEM_A′（外加任何非測試舊 item） |
| E2 | 點 **Add item**（或 chrome **Add**） | `/daily-log/new`；intro 含選定日期 |
| E3 | Library 清單點 ITEM_B | 回到 Log；ITEM_B 又在當日。不要另外新建第三個 `[TEST]` 名 |

### F — Mood 與 Title

| # | 操作 | 預期 |
|---|---|---|
| F1 | 點 Mood **Happy** | 大頭貼變 Happy；該鈕 `picked` |
| F2 | 點 **Clear mood** | 頭貼空白；Happy 不再 picked |
| F3 | 「How was your day?」打 `Test title`，blur（點頁面空白處） | 欄位留下該字 |
| F4 | chrome **Refresh**（或重新進入該日） | title 仍是 `Test title`（已寫入） |

### G — Viewers grant + Others（user-b）

user-b 被授權後，可在 `/daily-log/others` **看** user-a 的 mood / title / items，**不能**勾選或編輯。

| # | 操作 | 預期 |
|---|---|---|
| G1 | user-a 開 `/daily-log/others` → chrome **Who can view**（或 `/daily-log/viewers`） | 標題 Who can view |
| G2 | 「Allowed viewers」搜 user-b 的顯示名，點建議 | chip 出現 user-b |
| G3 | 登出 user-a，用 **user-b** 登入，開 `/daily-log/others` | 月曆可開，不報錯 |
| G4 | 點測試日（或先翻到該月再點該日） | feed 出現 user-a；看得到 title `Test title`、ITEM_A′（含完成態若當時是完成）、ITEM_B。**沒有**勾選 / 編輯按鈕（user-a 自己那張卡才有 Edit in Log） |
| G5 | 登出 user-b，改回 **user-a**。Viewers 頁對 user-b chip 點 × | chip 消失 |
| G6 | 再以 user-b 登入，開 Others、點同一日 | user-a 的 log **不再**出現。然後切回 user-a |

若 G2 出現 `Everyone granted access must belong to the same user group`：整段 G 標 Blocked，寫原因，**不要**為了測這個去改 group 資料。

### H — Stats

| # | 操作 | 預期 |
|---|---|---|
| H1 | user-a 開 `/daily-log/stats`（或 Log 頂列 **Stats**） | 標題 Stats；有 Summary / Completion by date / Most completed / Recently completed |
| H2 | 點 range **This week**、**Last 30 days**、**All time** | chip `picked` 跟著切；數字與列表隨 range 變（空 range 顯示 `No log dates in this range.` 等 empty copy，也算 Pass） |
| H3 | 若測試日在目前 range 內 | 該日列得出現；ITEM_A′ 完成過的話，Most completed / Recently completed 可能看得到。沒完成過不要當 Fail |

### I — 刪除限制（Library 仍被日期占用）

| # | 操作 | 預期 |
|---|---|---|
| I1 | `/daily-log/library` 看 ITEM_A′ | usage 為 `On 1 date`（若還在其他日，寫實際數字） |
| I2 | ITEM_A′ 的刪除鈕 | **disabled**；tooltip `Remove this item from every date first` |
| I3 | 回測試日，編輯 ITEM_A′ → **Remove** → confirm OK；同樣移除 ITEM_B | 當日沒有任何 `[TEST] DL` item |
| I4 | 再回 Library | ITEM_A′ / ITEM_B 刪除鈕可點；usage `On 0 dates` |

### J — Use yesterday（隔離日）

不要對 user-a 真實的「昨天」按 Use yesterday。

| # | 操作 | 預期 |
|---|---|---|
| J1 | 選定測試日的**前一天**（`log_date - 1`）。若該日已有真實資料，整段 J 標 Blocked，不要覆蓋 |
| J2 | 若前一天是空的：Add item 把 ITEM_A′ 加進去（此時 Library 還在） | 前一天有 ITEM_A′ |
| J3 | 回到測試日（應已無測試 item），點 **Use yesterday** | 測試日出現 ITEM_A′，且不刪該日其他非測試 item |
| J4 | 測試日與前一天上的 ITEM_A′ 都 Remove | 兩日都沒有 `[TEST] DL` |

### CLEANUP — 清掉測試垃圾

順序固定：當日 item → 相鄰測試日 item → Template record → Library item → viewer grant → mood/title。

| # | 操作 | 預期 |
|---|---|---|
| CLp1 | `/daily-log` 測試日與（若跑過 J）前一天：每個 `[TEST] DL` item 編輯 → Remove → OK | 那些日期沒有測試 item |
| CLp2 | `/daily-log/template`：每個 `[TEST] DL` 列 Remove → OK | Template 沒有測試 record；使用者自己原本的 Template item **不要動** |
| CLp3 | `/daily-log/library`：每個 `[TEST] DL` 刪除 → confirm `Delete "…" from the Library?` OK | Library 沒有 `[TEST] DL`。若刪除仍 disabled，回去找還掛在哪一天，Remove 後再刪 |
| CLp4 | `/daily-log/viewers`：若還有本次加的 user-b chip，點 × | 本次 grant 不在 |
| CLp5 | 測試日：Clear mood；title 清空後 blur | 週曆該日圓點不因本次測試而亮 |
| CLp6 | 報告寫「Cleanup: done / partial」，partial 時列出還沒清掉的名稱與所在頁 |

---

## 結果報告格式

存到 `.cursor/regression/runs/YYYY-MM-DD-daily-log.md`：

```markdown
# Daily Log regression — YYYY-MM-DD

- appUrl:
- 帳號: user-a（G 段切過 user-b）
- log_date:
- 劇本版本: 本檔最後說明的行為（對應 commit / working tree）

| # | 情境 | 我做了什麼 | 預期 | 實際 | 結果 |
|---|---|---|---|---|---|
| A5 | … | … | … | … | Pass / Fail / Blocked |

Cleanup: done | partial — …

N passed, N failed, N blocked, N need Super Admin.
```

Fail 列下面加：`問使用者：要修程式 / 更新劇本 / 這次忽略`

本 feature 無 Super Admin 列時，最後一句的 need Super Admin 為 0。

---

## 何時必須改這份劇本

以下任一變更，沒改本檔就不能說做完：

- Library / Template / day item 的新增、編輯、刪除、排序、占用刪除限制
- `daily-log.routes.ts` 或 chrome 導覽（Log / Others / Library / Stats / Viewers）
- Use template、Use yesterday、Add item 頁的既有/新建邏輯
- Mood、Title 儲存
- Viewer grant 與 Others 唯讀
- Stats range（This week / Last 30 days / All time）
- `tyapp_daily_log_*` / `tyapp_daily_log_share` 資料形狀
- 測試名稱前綴或清理規則
