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
| A2 | 桌面寬時看左側 | 有 Details 抽屜（Title / Date / Signers / Body Markdown）。紙仍在右側可見 |
| A3 | 點工具列 **Hide details** | 抽屜收起，紙仍在，桌面變寬 |
| A4 | 點 **Details** | 抽屜回來 |

### B — Zoom：紙不重排，只縮放

| # | 操作 | 預期 |
|---|---|---|
| B1 | 點 **50%** | 紙變小且留在桌面中央，標題／本文／簽名欄相對位置不變（不會變成單欄或紙變窄） |
| B2 | 拖 zoom 拉桿到約 **150%**，或點 **150%** | 紙平滑放大，仍置中；桌面出現捲軸（若放不下） |
| B3 | 點 **Fit** | 紙寬對齊桌面內側，仍是同一張 A4 比例，不是把內容重排 |
| B4 | 點 **100%** | 回到實寸。重整頁面後 zoom 應記住上次選擇 |

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
