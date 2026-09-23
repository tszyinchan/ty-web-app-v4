# CG — Regression Script

改這個 feature 的行為（路由、package / slot 寫入、logo 預覽、overlay URL）時，**必須同步更新本檔**，否則該次改動不算完成。

| | |
|---|---|
| Feature 路由 | `/cg` |
| 子頁 | `/cg/list`、`/cg/new`、`/cg/edit/:id`；overlay `http://cg.localhost:4200/o/:token` 或 `https://cg.tszyin.com/o/:token` |
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
| PKG_A | `[TEST] CG CH36` | Channel package + logo |
| PKG_B | `[TEST] CG News SNG` | Source package（證明 package 不是寫死頻道） |

---

## 前置條件

- [ ] `http://localhost:4200` 已開
- [ ] 已在 Supabase 跑過 `supabase/sql/cg-v1.sql`
- [ ] `.cursor/test-credentials.local.json` 存在；用 **user-a** 登入成功
- [ ] user-a 已有 CG feature grant（沒有則 Welcome 看不到，`/cg/list` 會被送回 Welcome）
- [ ] `/cg/list` 沒有名稱以 `[TEST] CG` 開頭的 package；有的話先當 leftover 刪掉

---

## 場景

### A — 多個 package，不是寫死 CH36

| # | 操作 | 預期 |
|---|---|---|
| A1 | Welcome 點 **CG**，或開 `/cg/list` | 進入 package 清單 |
| A2 | 點 **New package**，Name = `PKG_A`，Role = Channel，Save | 進入 edit；清單之後看得到 Channel |
| A3 | 再 New，Name = `PKG_B`，Role = Source，Save | 兩個 package 並存；Role 標 Source |

### B — Logo 在舞台上，不是 OBS 裡定位

| # | 操作 | 預期 |
|---|---|---|
| B1 | 打開 `PKG_A`，點 **Add logo**，再點 **Use sample PNG** | 16:9 預覽左上出現透明 PNG |
| B1b | 點 **Choose local image**，選本機 PNG | 預覽換成該圖；欄位顯示 embedded 檔名，不是 `C:\\` 路徑 |
| B2 | 改 X / Y / Width / Scale | 預覽裡的 logo 跟著動，不必重載 |
| B3 | 切 **Alpha** / **Studio** | Alpha 是棋盤（只在後台）；Studio 是暗底。都不是綠幕 |
| B4 | 關 **Visible** | 預覽裡 logo 消失 |
| B5 | Save | 成功；重整後位置與圖還在 |

### C — 一條 URL 一個元件

| # | 操作 | 預期 |
|---|---|---|
| C1 | Copy OBS URL，新分頁打開 | URL 是 `http://cg.localhost:4200/o/…`（正式是 `cg.tszyin.com/o/…`）。真透明底 + 同一個 logo。壞 token 是空白，不是 Jaxfr 登入頁 |
| C2 | 回到後台改 Scale，等約 2 秒看 overlay 分頁 | overlay 跟著變，不用重開 |

### CLEANUP

| # | 操作 | 預期 |
|---|---|---|
| Z1 | 刪除 `PKG_A`、`PKG_B` | 清單不再出現 `[TEST] CG` |
