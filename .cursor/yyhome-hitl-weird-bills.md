# yyHome HITL — 歷史異常帳單

來源：`20260929_142600_Items.xlsx`／YYEMS  
完整表：`yyhome-hitl-weird-bills.csv`（請填 `your_answer` 欄）。

## 怎麼回答

| 答案 | 意思 |
|---|---|
| `KEEP_DEBT` | 真的還沒還的債 — share 維持現狀（付≠扛）。 |
| `FORCE_OWN_EQ_PAY` | 不該影響 Split — 把 share 改成「扛 = 付的人」。 |
| `HAS_PAYBACK_PAIR` | 已用內部轉帳還過 — 可註明對應那一對；我們會清成不進債務。 |
| `KEEP_YYEMS` | 共同還款轉帳 — 維持 0.5／0.5。 |
| `SET_CTY`／`SET_FRD`／`SET_YYEMS` | 僅用於 Ownership 空白。 |
| `OTHER` | 在 remark 寫說明，或在聊天告訴我。 |

## 筆數統計

- **C_expense_own_ne_pay**：104 筆，cty_net_effect 合計 ≈ 8895.63
- **A_xfer_own_ne_pay**：33 筆，cty_net_effect 合計 ≈ -23498.01
- **B_xfer_yyems**：2 筆，cty_net_effect 合計 ≈ -12076.0
- **合計標註**：139 筆

### 旗標意思

- `A_xfer_own_ne_pay` — 內部轉帳，Ownership ≠ wallet 主人
- `B_xfer_yyems` — 內部轉帳標成共同（yyems）
- `C_expense_own_ne_pay` — 一般消費、私人 Ownership、別人付款（會產生 Split 債務）
- `D_blank_ownership` — Ownership 空白

## CAD 私人消費（C_）快速檢視

- `20250513-2208add-06` 2024-07-11 15:24:04 own=frd pay=cty out net=146.89 CAD | Mountain Warehouse | 冬天羽絨Mountain Warehouse，一年保養， 如果遇到咩問題可以拎住張電子單（在電郵）就可以去問
- `YYEMS-20250522-2cc06094` 2025-05-22 17:33:00 own=frd pay=cty out net=101.37 CAD | Uniqlo | 
- `YYEMS-20250110-77bab354` 2025-01-10 12:24:00 own=cty pay=frd out net=-96.04 CAD | Canadian Tire | 彦安全鞋
- `20250513-2219add-01` 2024-06-07 19:18:38 own=frd pay=cty out net=73.98 CAD | 飯飯掂 Lucky Pot | 彦哥
- `YYEMS-20250514-0f24e649` 2025-05-14 16:21:25 own=frd pay=cty out net=62.15 CAD | Decathlon | 
- `20250513-2219add-04` 2024-06-23 19:52:57 own=frd pay=cty out net=34.17 CAD | Pizza Hut | 彦哥比 Pizza Hut
- `YYEMS-20250110-0c93f833` 2025-01-10 15:36:00 own=cty pay=frd out net=-33.79 CAD | Uniqlo | 彦上班長T (Uniqlo)
- `20250513-2208add-07` 2024-07-12 14:37:25 own=frd pay=cty in net=-29.38 CAD | Mountain Warehouse | 羽絨8折回贈
- `YYEMS-20250419-4bb2a334` 2025-04-19 13:42:00 own=cty pay=frd out net=-28.03 CAD | Uniqlo | AIRism boxer briefs 9.9+TAIRism boxer briefs (seamless) 14.9
- `YYEMS-20260311-6d6c2064` 2026-03-11 09:58:14 own=frd pay=cty out net=25.0 CAD | U solo Hair Salon | FRD剪髮，原價$25，9折後$22.5，連Tips $25。
- `YYEMS-20250126-c61977e7` 2025-01-26 14:23:00 own=cty pay=frd out net=-14.68 CAD | Marshalls Homesense | Yin:襪

## HKD 私人消費（C_）依 |net| 排序

- `20250513add-FrdSelfDev-03` 2024-08-15 11:18:02 own=frd pay=cty out net=1683.56 HKD | Volunteer/Course in general | ASISTtraining. HKD1683.56 (未計回贈)
- `20250513add-2017` 2023-11-10 22:54:35 own=frd pay=cty out net=1045.0 HKD | NA | 酒店
- `20250513add-2000` 2023-08-30 08:51:06 own=frd pay=cty out net=405.0 HKD | MoneyManager_食物_晚餐 | 
- `20250513add-2059` 2024-04-13 03:33:51 own=frd pay=cty out net=360.0 HKD | MoneyManager_食物_午餐 | 
- `20250513add-1989` 2023-08-09 08:38:43 own=frd pay=cty out net=334.0 HKD | MoneyManager_食物_晚餐 | 
- `20250513add-2009` 2023-10-12 08:38:48 own=frd pay=cty out net=260.0 HKD | MoneyManager_食物 | 
- `20250513add-2057` 2024-03-29 04:13:37 own=frd pay=cty out net=246.0 HKD | MoneyManager_食物_午餐 | 
- `20250513add-2020` 2023-11-21 00:49:34 own=frd pay=cty out net=207.0 HKD | MoneyManager_食物_午餐 | 
- `20250513add-2072` 2024-05-23 01:45:42 own=frd pay=cty out net=185.0 HKD | MoneyManager_食物_午餐 | 
- `20250513add-1990` 2023-08-15 07:53:35 own=frd pay=cty out net=168.0 HKD | MoneyManager_食物_晚餐 | 
- `20250513add-2050` 2024-03-02 03:09:58 own=frd pay=cty out net=168.0 HKD | MoneyManager_食物_午餐 | 
- `YYEMS-20260108-6b014a12` 2026-01-08 17:11:52 own=frd pay=cty out net=168.0 HKD | Luna cake | 
- `20250513add-2016` 2023-11-08 07:48:40 own=frd pay=cty out net=161.0 HKD | MoneyManager_食物_晚餐 | 
- `20250513add-2010` 2023-10-14 02:55:10 own=frd pay=cty out net=156.6 HKD | MoneyManager_護理_安全套 | watson，88折
- `20250513add-1986` 2023-08-01 07:11:28 own=frd pay=cty out net=150.0 HKD | MoneyManager_食物_晚餐 | 
- `20250513add-2066` 2024-05-13 01:53:28 own=frd pay=cty out net=148.0 HKD | MoneyManager_食物_午餐 | 
- `20250513add-2004` 2023-09-16 02:01:08 own=frd pay=cty out net=140.0 HKD | MoneyManager_食物 | 
- `20250513add-2065` 2024-05-08 01:53:20 own=frd pay=cty out net=134.0 HKD | MoneyManager_食物_午餐 | 
- `20250513add-2058` 2024-04-08 05:39:19 own=frd pay=cty out net=129.0 HKD | MoneyManager_食物_午餐 | 
- `20250513add-1992` 2023-08-17 03:15:08 own=frd pay=cty out net=128.0 HKD | MoneyManager_食物_午餐 | 飲茶
- `20250513add-2036` 2024-01-22 00:21:31 own=frd pay=cty out net=125.0 HKD | MoneyManager_食物_午餐 | 
- `20250513add-2068` 2024-05-20 01:07:36 own=frd pay=cty out net=115.0 HKD | MoneyManager_食物_午餐 | 
- `20250513add-2063` 2024-05-01 02:29:17 own=frd pay=cty out net=110.0 HKD | MoneyManager_食物_午餐 | 壽司
- `20250513add-2014` 2023-10-29 04:01:59 own=frd pay=cty out net=102.0 HKD | MoneyManager_食物_下午茶 | 
- `20250513add-2008` 2023-10-07 08:14:17 own=frd pay=cty out net=99.0 HKD | MoneyManager_食物_晚餐 | 

## 全部 A_xfer_own_ne_pay（內部轉帳且付≠扛）

- `20250513add-2102` 2024-06-19 11:44:09 in own=frd pay=cty -36036.01 HKD | Kelly (Yin mum) AXA insurance（7月6日 彦已還）
- `20250513add-2132` 2024-07-06 15:00:18 out own=frd pay=cty 36036.01 HKD | 彦還錢比Frd
- `20250513add-2195` 2024-09-08 14:20:41 in own=frd pay=cty -8110.71 HKD | 耀比返淘寶+幫彦找信用卡嘅錢彦比返CAD耀YYEMSCTY 比 FRD : CAD643.6 FRD 比 CTY : HKD3738.56C
- `YYEMS-20250707-ab4de1df` 2025-07-07 21:49:15 in own=frd pay=cty -8000.0 HKD | 
- `20250513add-2158` 2024-07-21 21:19:53 in own=frd pay=cty -7689.0 HKD | 彦比CAD耀，之後耀會比返HKD彦找卡數
- `YYEMS-20250611-26ac1985` 2025-06-11 22:47:00 in own=frd pay=cty -5000.0 HKD | 
- `YYEMS-20250707-e2753236` 2025-07-07 21:50:43 out own=frd pay=cty 1388.0 CAD | 
- `20250513-transfer-05` 2024-07-20 16:25:50 out own=frd pay=cty 1351.14 CAD | 彦比CAD耀，之後耀會比返HKD彦找卡數
- `YYEMS-20250611-046a6ddc` 2025-06-11 22:50:00 in own=cty pay=frd -875.0 CAD | 
- `20250513-transfer-07` 2024-09-08 13:43:00 out own=frd pay=cty 643.6 CAD | 月尾彦信用卡找數(YYEMS)
- `20250513-transfer-09` 2024-09-08 14:02:57 out own=frd pay=cty 456.78 CAD | 月尾彦信用卡找數(彦耀私人項目)
- `YYEMS-20260611-b927aa74` 2024-02-26 05:43:48 out own=frd pay=cty 290.0 HKD | 彦比我買電池
- `20250513-transfer-11` 2024-12-08 21:17:27 out own=frd pay=cty 237.3 CAD | 彦鞋
- `20250513-transfer-06` 2024-08-14 17:00:36 out own=frd pay=cty 200.0 CAD | yin轉錢比Frd（Frd第二日取現金比yin）
- `YYEMS-20260612-163a8fcc` 2024-08-15 10:52:00 in own=frd pay=cty -200.0 CAD | 
- `YYEMS-20260108-4d6a1845` 2026-01-08 17:21:00 in own=frd pay=cty -168.0 HKD | 
- `20250513-transfer-10` 2024-12-08 21:15:59 out own=frd pay=cty 107.35 CAD | Decathlon彦
- `20250513-transfer-12` 2025-01-10 16:44:51 out own=frd pay=cty 96.04 CAD | 彦還錢：彦安全鞋
- `20250513-transfer-04` 2024-07-12 19:46:53 in own=frd pay=cty -67.51 CAD | 還羽絨錢
- `20250513-transfer-01` 2024-07-05 14:20:28 out own=frd pay=cty 50.0 CAD | 
- `20250513-transfer-02` 2024-07-05 14:23:43 in own=frd pay=cty -50.0 CAD | 現金比彦
- `20250513-transfer-03` 2024-07-12 19:42:28 in own=frd pay=cty -50.0 CAD | RBC 拎現金，將現金比彦
- `20250513-transfer-13` 2025-01-10 16:46:29 out own=frd pay=cty 33.79 CAD | 彦還錢：彦上班長T (Uniqlo)
- `YYEMS-20260611-72cf0e15` 2025-02-28 16:27:59 out own=frd pay=cty 33.79 CAD | 彦還錢：彦上班長T (Uniqlo)
- `MoneyManager20250512-TransferIn-02` 2024-08-13 07:51:19 out own=frd pay=cty 30.0 CAD | 增值presto.CTY MMPOWER
- `20250513-transfer-15` 2025-04-19 16:23:37 out own=frd pay=cty 28.03 CAD | 
- `20250513-transfer-14` 2025-01-28 13:51:30 out own=frd pay=cty 14.68 CAD | sock
- `YYEMS-20260530-505d85a8` 2026-05-30 12:52:50 in own=cty pay=frd -10.0 HKD | FRD增值Payme$10
- `YYEMS-20260530-0765defa` 2026-05-30 12:52:50 out own=cty pay=frd 10.0 HKD | FRD增值Payme$10
- `YYEMS-20260530-c970f838` 2026-05-30 12:54:27 in own=cty pay=frd -10.0 HKD | 彦比返錢耀（payme $10去3diy）
- `YYEMS-20260612-c180a438` 2026-06-12 11:12:00 in own=frd pay=cty -9.0 CAD | Adjustment for cash account
- `20250513-transfer-08` 2024-09-08 14:02:25 out own=frd pay=cty 3.96 CAD | 月尾彦信用卡找數(彦耀私人項目)
- `YYEMS-20260612-cce5583f` 2025-02-22 12:57:00 in own=frd pay=cty -3.25 CAD | TNT退錢，耀比返CTY

## B_xfer_yyems（內部轉帳且標共同）

- `YYEMS-20260225-001d6a2b` 2026-02-25 14:31:25 out pay=frd 12076.0 HKD | 彦用MMPOWER付款HKD12076(2人機票來回多倫多和香港），耀即時匯豐過錢HKD12076比彦
- `YYEMS-20260225-9979598d` 2026-02-25 14:31:25 in pay=cty -12076.0 HKD | 彦用MMPOWER付款HKD12076(2人機票來回多倫多和香港），耀即時匯豐過錢HKD12076比彦
