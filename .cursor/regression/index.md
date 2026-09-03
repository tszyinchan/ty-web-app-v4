# Jaxfr regression index

全回歸：由上到下跑「建議順序」裡**已有劇本**的 feature。每次只跑一個 feature，寫一份 run 報告，再下一個。

單 feature：直接打開該列的劇本。

## 怎麼跑

1. 使用者在可見 terminal 開好 `ng serve`（`http://localhost:4200`）。Agent **不要**在背景自己開 dev server。
2. Cursor browser **必須可見**（`.cursor/rules/browser-must-be-visible.mdc`）。看不到就停，不要在背景點。
3. 讀 `.cursor/test-credentials.local.json`：Cursor browser 登 **user-a**。需要第二人再用 **user-b**。檔案不存在就停，請使用者準備。
4. 嚴格照該 feature 的 `*.regression.md` 點 UI。截圖不算。
5. **Fail 先旗標，先問使用者，再改程式。** 不要一邊跑回歸一邊「順便修」。Cleanup 段仍要盡力跑完。
6. 每輪結束寫 `.cursor/regression/runs/YYYY-MM-DD-<feature>.md`（此資料夾 gitignore）。
7. Super Admin 專屬行為：劇本有寫就列入報告 `Needs Super Admin` + 要點哪裡；劇本註明「無 Super Admin 行為」則不要編造。

改某個 feature 的行為時：同步更新該 feature 的 `*.regression.md`，並在 `.cursorrules` §8 的回歸規則下交差。沒更新劇本不算做完。

## 建議順序

| 序 | Feature | 劇本 | 狀態 | 備註 |
|---|---|---|---|---|
| 1 | Daily Log | [`daily-log.regression.md`](../../src/app/apps/jaxfr/features/daily-log/daily-log.regression.md) | 已有劇本 | 含 Library / Template / Log CRUD / Viewers；測完清 `[TEST] DL` |
| 2 | Settings | — | 待寫 | 主題、偏好；建議早跑，避免後面看起來像 UI 壞了 |
| 3 | Chat | — | 待寫 | 需要 user-a + user-b |
| 4 | Article | — | 待寫 | |
| 5 | Fit | — | 待寫 | |
| 6 | Filelink | — | 待寫 | |
| 7 | Docsign | — | 待寫 | |
| 8 | Work Employment | — | 待寫 | |
| 9 | Work Schedule | — | 待寫 | 依賴 employment 資料 |
| 10 | Work Attendance | — | 待寫 | 依賴 schedule |
| 11 | YYEMS | — | 待寫 | |
| 12 | User / Groups / Invites | — | 待寫 | Super Admin 案例多 |
| 13 | App / Feature / Function / App Log | — | 待寫 | Super Admin |
| 14 | Tyweb | — | 待寫 | |

Archive（`src/app/apps/jaxfr/archive/`）不列入。

## Run 報告

路徑：`.cursor/regression/runs/YYYY-MM-DD-<feature>.md`

`<feature>` 用短 slug，與資料夾名一致（例：`daily-log`、`chat`）。同一天重跑就加後綴：`YYYY-MM-DD-daily-log-2.md`。
