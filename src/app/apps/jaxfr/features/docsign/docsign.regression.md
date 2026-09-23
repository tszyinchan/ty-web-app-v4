# Doc Sign — Regression Script

改這個 feature 的行為（路由、資料寫法、UI 互動、權限、紙張／列印）時，**必須同步更新本檔**，否則該次改動不算完成。

| | |
|---|---|
| Feature 路由 | `/docsign` |
| 子頁 | `/docsign/list`、`/docsign/new`、`/docsign/edit/:id`、`/docsign/compare/:id`、`/docsign/print/:id/:printLogId`、`/docsign/prints`、`/docsign/signature` |
| 測試帳 | `.cursor/test-credentials.local.json` 的 **user-a**（USER）。第二人用 **user-b** |
| Super Admin | 本 feature **沒有** Super Admin 專屬行為，略過，不要編造 `Needs Super Admin` 列 |
| 結果報告 | `.cursor/regression/runs/YYYY-MM-DD-docsign.md`（gitignore） |

---

## 執行規則

1. 先完整讀完本劇本，再開始點。
2. `ng serve` 必須由使用者在可見 terminal 跑；確認 `http://localhost:4200` 可開。
3. Cursor browser **必須是使用者看得到的那個分頁**（見 `.cursor/rules/browser-must-be-visible.mdc`）。看不到就停。
4. Cursor browser 用 **user-a** 登入。
5. 照 A → … → CLEANUP 順序跑。CLEANUP **一定要跑**，即使前面有 Fail。
6. **遇到 Fail：先旗標，不要改程式。**
7. 截圖不算驗證。每個步驟都要點、打字、看畫面反應。
8. native `confirm()`：Cursor browser 的 click 通常會帶 OK；在報告註明。

---

## 測試資料標記

| 代號 | 名稱 | 用途 |
|---|---|---|
| DOC_A | `[TEST] DS Paper` | 本次建立的草稿，測完刪除 |

---

## 前置條件

- [ ] `http://localhost:4200` 已開
- [ ] `.cursor/test-credentials.local.json` 存在；用 **user-a** 登入成功
- [ ] user-a 已有簽名（`/docsign/signature`）。沒有就先設一個再繼續
- [ ] `/docsign/list` 沒有標題以 `[TEST] DS` 開頭的文件；有的話先當 leftover 刪掉

---

## 場景

### A — 開新文件：紙在中間，不是 Details/Paper 對切

| # | 操作 | 預期 |
|---|---|---|
| A1 | Welcome 或 `/docsign/list` 點 **New Document** | 進入 `/docsign/new`。中間灰色桌面上有一張白紙。**沒有** Details / Paper 兩個 toggle |
| A2 | 桌面寬時看左側 | 有 Details 抽屜（約 520px，Title / Date / Signers / Body Markdown）。紙仍在右側可見。不是一條窄欄加獨立細捲軸 |
| A3 | 點工具列 **Hide details** | 抽屜收起，紙仍在，桌面變寬 |
| A4 | 點 **Details** | 抽屜回來 |

### B — Zoom：紙不重排，只縮放

| # | 操作 | 預期 |
|---|---|---|
| B1 | 點 **50%** | 紙變小且留在桌面中央，標題／本文／簽名欄相對位置不變（不會變成單欄或紙變窄） |
| B2 | 拖 zoom 拉桿到約 **150%**，或點 **150%** | 紙平滑放大，仍置中；桌面出現捲軸（若放不下） |
| B3 | 點 **Fit** | 紙寬對齊桌面內側，仍是同一張 A4 比例，不是把內容重排 |
| B4 | 點 **100%** | 回到實寸。重整頁面後 zoom 應記住上次選擇 |
| B5 | 點 **200%** | 紙放大約兩倍，整張都看得到（放不下就出現捲軸）。**不是**只剩左邊一條白紙、右邊一大片灰桌 |
| B6 | 點 **300%** | 紙放大約三倍，整張都在（通常要捲）。不是只剩左邊一條 |

### C — Markdown 仍驅動紙上正文

| # | 操作 | 預期 |
|---|---|---|
| C1 | Title 填 `DOC_A`（`[TEST] DS Paper`） | 紙上標題同步變成該字 |
| C2 | Body 輸入 `Hello **bold**` | 紙上出現 Hello 與粗體 bold，看不到 `**` |
| C3 | 點 **Save draft** | 成功；仍停在編輯頁 |

### D — 手機寬度：看紙／全螢幕編輯

| # | 操作 | 預期 |
|---|---|---|
| D1 | 視窗縮到 ≤1100px（或 DevTools 手機寬） | 紙在桌面上。工具列是 **Edit**（不是 Details/Paper 對切） |
| D2 | 點 **Edit** | 表單佔滿畫面（給虛擬鍵盤空間），紙暫時看不見。按鈕變成 **Paper** |
| D3 | 點 **Paper** | 回到紙張桌面，Edit 還在 |
| D4 | 再點 **Edit**，把 Body 填長，往下拉 | 整張編輯畫面可以垂直捲到 Title、Signers、Body。不是卡在上面一段 |
| D5 | 桌面與手機：看 Markdown 工具列 | 桌面 520px 抽屜通常一列就放下。放不下或手機窄時，拖捲軸／滾輪可滑到 Table / 分隔線，不是只看到條、拖不動 |
| D6 | 回到 **Paper**，雙指捏紙 | 紙跟著放大縮小（25–300%），不是整頁瀏覽器 zoom。桌面用完整工具列也可 |
| D7 | 手機寬度看 Paper 的 zoom 列 | 只有目前 %、**50% / 100% / 200% / Fit**。沒有拉桿、沒有 −/+、沒有 25/75/125/150/300 按鈕 |

（D6 真機雙指。Cursor browser 做不到就標 Blocked，寫「請用手機捏紙」。）

### F — 真分頁：長文切成多張 297mm A4

Body 用下面這段（約 20 段，應超過一頁）。不要只打一行。

```
## Page break sample
1. Alpha paragraph for pagination.
2. Bravo paragraph for pagination.
3. Charlie paragraph for pagination.
4. Delta paragraph for pagination.
5. Echo paragraph for pagination.
6. Foxtrot paragraph for pagination.
7. Golf paragraph for pagination.
8. Hotel paragraph for pagination.
9. India paragraph for pagination.
10. Juliet paragraph for pagination.
11. Kilo paragraph for pagination.
12. Lima paragraph for pagination.
13. Mike paragraph for pagination.
14. November paragraph for pagination.
15. Oscar paragraph for pagination.
16. Papa paragraph for pagination.
17. Quebec paragraph for pagination.
18. Romeo paragraph for pagination.
19. Sierra paragraph for pagination.
20. Tango paragraph for pagination.
```

| # | 操作 | 預期 |
|---|---|---|
| F1 | 在 Body 貼上上面的 20 段 | 桌面出現 **至少 2 張** 分開的白紙，中間有空隙。不是一張往下長的長紙 |
| F2 | 看第 1 張 | 有品牌／標題／Date 表頭。紙高仍是 A4。右上角有 `1 / N` |
| F3 | 看最後一張 | 有 `… — continued`。**Signatures** 與 disclaimer 只在最後一張，不在第 1 張重複 |
| F4 | 工具列頁碼是 `1 / N`。點 **›** | 桌面捲到第 2 張，讀數變成 `2 / N` |
| F5 | 點 **‹** | 回到第 1 張，讀數 `1 / N` |
| F6 | 點 **50%** | 每一張都一起縮小，仍是 A4 比例，不會重排成單欄 |
| F7 | 把 Body 改成一行 `Short.` | 變回 **1 張**，工具列 `1 / 1`，Signatures 在這張 |

### E — 列印（僅已鎖定文件）

鎖定文件需要所有簽署人都簽完。若這次只建了單人草稿：

| # | 操作 | 預期 |
|---|---|---|
| E1 | 若 DOC_A 仍是草稿：點 **Sign & send**，confirm OK | 回到 list；文件狀態變完成／Locked（只有自己簽） |
| E2 | 再開 DOC_A | 紙只讀。工具列有 **Print** |
| E3 | 點 Print | 進列印頁；紙仍是文件，不是窄欄。可取消列印對話框 |

若 Sign & send 因「沒有簽名」失敗：標 Blocked，寫要先去 My signature。

### CLEANUP

| # | 操作 | 預期 |
|---|---|---|
| Z1 | 打開 DOC_A，點 **Delete**，confirm OK | 回到 list，沒有 `[TEST] DS Paper` |
