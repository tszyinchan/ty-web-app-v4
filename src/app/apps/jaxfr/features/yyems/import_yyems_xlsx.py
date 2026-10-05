# Load AppSheet xlsx into tyapp_yyhome_* (Phase D names).
#
# Prereqs:
#   1. Paste yyhome.drop-yyems.sql then yyems.schema.sql (+ split/fridge patches) in Supabase.
#   2. tyapp_user.appsheet_525_user_id is 'cty' and 'frd' for the two logins.
#   3. pip install openpyxl supabase
#   4. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
#
# Usage:
#   python .../import_yyems_xlsx.py --dry-run --through-bills
#   python .../import_yyems_xlsx.py --through-bills --wipe
#   python .../import_yyems_xlsx.py --dicts-only --wipe
#
# --dicts-only: A dictionaries only.
# --through-bills: A dictionaries + B bills. No prices/buys/eats/files.
# Full import (no flag): everything including kitchen cycle.

from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

DEFAULT_XLSX = (
    r"j:\.shortcut-targets-by-id\1yqrgKWWM13JcXnN0VdIaLbLVzW7LytpH"
    r"\6FRD\Project\2024_YYEMS Appsheet\20261005_101700_Items.xlsx"
)

EMAIL_TO_PARTY = {
    "tszyinchan99@gmail.com": "cty",
    "fredchuny1@gmail.com": "frd",
}

MEALS = {"1早", "2茶", "3午", "4茶", "5晚", "6宵", "7用", "8調", "9洗"}
BATCH = 200


def nonempty(v: object) -> bool:
    return v is not None and str(v).strip() != ""


def as_text(v: object) -> str | None:
    if not nonempty(v):
        return None
    return str(v).strip()


def as_bool(v: object) -> bool | None:
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in {"true", "1", "y", "有機", "有味精"}:
        return True
    if s in {"false", "0", "n", "無味精"}:
        return False
    return None


def as_num(v: object) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def as_int(v: object, default: int | None = None) -> int | None:
    n = as_num(v)
    if n is None:
        return default
    return int(n)


def as_iso_dt(v: object) -> str | None:
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day).isoformat()
    if not nonempty(v):
        return None
    s = str(v).strip()
    try:
        return datetime.fromisoformat(s[:19]).isoformat()
    except ValueError:
        return None


def as_iso_date(v: object) -> str | None:
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if not nonempty(v):
        return None
    s = str(v).strip()[:10]
    if len(s) >= 10 and s[4] == "-":
        return s[:10]
    try:
        return datetime.fromisoformat(str(v)[:19]).date().isoformat()
    except ValueError:
        return None


def sheet_rows(wb, name: str) -> list[dict[str, object]]:
    ws = wb[name]
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows)]
    out: list[dict[str, object]] = []
    for row in rows:
        rec: dict[str, object] = {}
        empty = True
        for i, key in enumerate(header):
            if not key:
                continue
            val = row[i] if i < len(row) else None
            rec[key] = val
            if nonempty(val):
                empty = False
        if not empty:
            out.append(rec)
    return out


def new_id() -> str:
    return str(uuid.uuid4())


def chunked(rows: list[dict[str, Any]], size: int = BATCH):
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def find_couple_group_id(client: Any, cty_id: str, frd_id: str) -> str | None:
    """Group whose active members are exactly the two appsheet-bound users."""
    members = (
        client.table("tyapp_user_group_member")
        .select("group_id, user_id")
        .execute()
        .data
        or []
    )
    by_group: dict[str, set[str]] = {}
    for row in members:
        gid = row.get("group_id")
        uid = row.get("user_id")
        if gid and uid:
            by_group.setdefault(gid, set()).add(uid)
    want = {cty_id, frd_id}
    for gid, ids in by_group.items():
        if ids == want:
            return gid
    return None


class Skip(Exception):
    pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Test-import 525 xlsx into Supabase")
    parser.add_argument("--xlsx", default=DEFAULT_XLSX)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--dicts-only",
        action="store_true",
        help="Import dictionary tables only (no bills / prices / buys / eats / files)",
    )
    parser.add_argument(
        "--through-bills",
        action="store_true",
        help="Dictionaries + bills only (skip prices / buys / eats / files)",
    )
    parser.add_argument(
        "--wipe",
        action="store_true",
        help="Delete existing yyhome rows first (scope follows --dicts-only / --through-bills)",
    )
    parser.add_argument(
        "--key",
        "--service-role-key",
        dest="service_role_key",
        default="",
        help="Supabase service role key (or set via SUPABASE_SERVICE_ROLE_KEY env)",
    )
    parser.add_argument(
        "--url",
        default="",
        help="Supabase URL (optional; defaults to project URL)",
    )
    args = parser.parse_args()
    if args.dicts_only and args.through_bills:
        print("Use only one of --dicts-only or --through-bills", file=sys.stderr)
        return 1

    load_bills = not args.dicts_only
    load_kitchen = not args.dicts_only and not args.through_bills

    xlsx = Path(args.xlsx)
    if not xlsx.is_file():
        print(f"xlsx not found: {xlsx}", file=sys.stderr)
        return 1

    url = (
        args.url.strip()
        or os.environ.get("SUPABASE_URL", "").strip()
        or "https://hqaxwodbhaohwyunbzxg.supabase.co"
    )
    key = (
        args.service_role_key.strip()
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    )
    if not args.dry_run and not key:
        print(
            "Set SUPABASE_SERVICE_ROLE_KEY or pass --key <service_role_key>.\n"
            "Example in PowerShell:\n"
            "  $env:SUPABASE_SERVICE_ROLE_KEY=\"<your_service_role_key>\"\n"
            "Or directly:\n"
            "  python src/app/apps/jaxfr/features/yyems/import_yyems_xlsx.py --through-bills --wipe --key \"<your_service_role_key>\"",
            file=sys.stderr,
        )
        return 1

    print(f"Reading {xlsx} …")
    wb = load_workbook(xlsx, read_only=True, data_only=True)

    categories = sheet_rows(wb, "Categories")
    items = sheet_rows(wb, "Items")
    vendor_cats = sheet_rows(wb, "Vendor Categories")
    vendors = sheet_rows(wb, "Vendors")
    fas = sheet_rows(wb, "Financial_Accounts")
    wallets = sheet_rows(wb, "Wallet")
    fx_rows = sheet_rows(wb, "Currency_conversion")
    if load_bills:
        bills = sheet_rows(wb, "YYEMS")
    else:
        bills = []
    if load_kitchen:
        prices = sheet_rows(wb, "Prices")
        buys = sheet_rows(wb, "Buy")
        eats = sheet_rows(wb, "Eat")
        files = sheet_rows(wb, "YYEMS_Images")
    else:
        prices, buys, eats, files = [], [], [], []
    wb.close()

    mode_label = (
        "(dicts-only)"
        if args.dicts_only
        else "(through-bills)"
        if args.through_bills
        else "(full)"
    )
    print(
        "rows:",
        f"cat={len(categories)} item={len(items)} vcat={len(vendor_cats)}",
        f"vendor={len(vendors)} fa={len(fas)} wallet={len(wallets)}",
        f"fx={len(fx_rows)}",
        f"bill={len(bills)} price={len(prices)} buy={len(buys)}",
        f"eat={len(eats)} file={len(files)}",
        mode_label,
    )

    client = None
    party_user: dict[str, str] = {}
    default_created_by = ""
    couple_group_id: str | None = None

    if args.dry_run:
        party_user = {
            "cty": "00000000-0000-0000-0000-000000000001",
            "frd": "00000000-0000-0000-0000-000000000002",
        }
        default_created_by = party_user["cty"]
        couple_group_id = "00000000-0000-0000-0000-0000000000aa"
        print("dry-run: dummy user ids for mapping only")
    else:
        try:
            from supabase import create_client
        except ImportError:
            print("pip install supabase", file=sys.stderr)
            return 1
        client = create_client(url, key)
        users = (
            client.table("tyapp_user")
            .select("user_id, appsheet_525_user_id")
            .is_("deleted_at", "null")
            .execute()
            .data
            or []
        )
        for u in users:
            code = (u.get("appsheet_525_user_id") or "").strip().lower()
            if code in {"cty", "frd"}:
                party_user[code] = u["user_id"]
        if "cty" not in party_user or "frd" not in party_user:
            print(
                "Need tyapp_user.appsheet_525_user_id = cty and frd",
                file=sys.stderr,
            )
            return 1
        default_created_by = party_user["cty"]
        print("mapped users", party_user)

        couple_group_id = find_couple_group_id(
            client, party_user["cty"], party_user["frd"]
        )
        if load_bills and not couple_group_id:
            print(
                "No user group whose members are exactly cty+frd; "
                "bills need group_id. Create that group first.",
                file=sys.stderr,
            )
            return 1
        if couple_group_id:
            print("couple group_id", couple_group_id)

        if args.wipe:
            dict_tables = [
                "tyapp_yyhome_wallet",
                "tyapp_yyhome_financial_account",
                "tyapp_yyhome_fx_rate",
                "tyapp_yyhome_vendor",
                "tyapp_yyhome_vendor_category",
                "tyapp_yyhome_item",
                "tyapp_yyhome_item_category",
            ]
            bill_tables = [
                "tyapp_yyhome_bill",
            ]
            kitchen_tables = [
                "tyapp_yyhome_eat",
                "tyapp_yyhome_file",
                "tyapp_yyhome_buy",
                "tyapp_yyhome_price",
            ]
            if args.dicts_only:
                wipe_tables = dict_tables
            elif args.through_bills:
                wipe_tables = bill_tables + dict_tables
            else:
                wipe_tables = kitchen_tables + bill_tables + dict_tables

            for table in wipe_tables:
                client.table(table).delete().gte(
                    "created_at", "1970-01-01T00:00:00Z"
                ).execute()
            print("wiped:", ", ".join(wipe_tables))

    def created_by_from_email(email: object) -> str:
        party = EMAIL_TO_PARTY.get((as_text(email) or "").lower(), "")
        return party_user.get(party, default_created_by)

    def person_user(code: object) -> str | None:
        c = (as_text(code) or "").strip().lower()
        if c in {"cty", "frd"}:
            return party_user.get(c)
        return None

    skipped: dict[str, int] = {}

    def skip(kind: str) -> None:
        skipped[kind] = skipped.get(kind, 0) + 1

    cat_ids: dict[str, str] = {}
    item_ids: dict[str, str] = {}
    vcat_ids: dict[str, str] = {}
    vendor_ids: dict[str, str] = {}
    fa_ids: dict[str, str] = {}
    wallet_ids: dict[str, str] = {}
    bill_ids: dict[str, str] = {}
    price_ids: dict[str, str] = {}
    buy_ids: dict[str, str] = {}

    cat_payload: list[dict[str, Any]] = []
    for i, row in enumerate(categories):
        lid = as_text(row.get("ID"))
        if not lid:
            skip("category")
            continue
        pk = new_id()
        cat_ids[lid] = pk
        cat_payload.append(
            {
                "tb_tyapp_yhic_id": pk,
                "legacy_id": lid,
                "code": lid,
                "name_zh": as_text(row.get("Category")) or lid,
                "name_en": as_text(row.get("Category_EN")),
                "division": as_text(row.get("Division")),
                "sort_order": i,
            }
        )

    item_payload: list[dict[str, Any]] = []
    for row in items:
        lid = as_text(row.get("Item ID"))
        cat = as_text(row.get("Category"))
        if not lid or not cat or cat not in cat_ids:
            skip("item")
            continue
        pk = new_id()
        item_ids[lid] = pk
        plan = as_bool(row.get("Plan Buy?"))
        item_payload.append(
            {
                "tb_tyapp_yhit_id": pk,
                "legacy_id": lid,
                "category_id": cat_ids[cat],
                "name_zh": as_text(row.get("Name")) or lid,
                "name_en": as_text(row.get("Name_EN"))
                or as_text(row.get("Name_EN_auto")),
                "food_category": as_text(row.get("Food Category")),
                "description": as_text(row.get("Description")),
                "plan_buy": bool(plan) if plan is not None else False,
            }
        )

    vcat_payload: list[dict[str, Any]] = []
    for row in vendor_cats:
        lid = as_text(row.get("ID"))
        if not lid:
            skip("vendor_category")
            continue
        pk = new_id()
        vcat_ids[lid] = pk
        vcat_payload.append(
            {
                "tb_tyapp_yhvc_id": pk,
                "legacy_id": lid,
                "level1": as_text(row.get("一級分類")) or "",
                "level2": as_text(row.get("二級分類")) or "",
                "level3": as_text(row.get("三級分類")) or "",
                "display_name": as_text(row.get("顯示名稱")) or lid,
            }
        )

    vendor_payload: list[dict[str, Any]] = []
    default_vcat_id = vcat_ids.get("其他_其他") or (next(iter(vcat_ids.values())) if vcat_ids else None)
    for row in vendors:
        lid = as_text(row.get("ID"))
        cat = as_text(row.get("Vendor Categories"))
        if not lid:
            skip("vendor")
            continue
        vcat_id = vcat_ids.get(cat) if cat else None
        if not vcat_id:
            # Fallback category to avoid dropping vendor and its transactions
            name_lower = (as_text(row.get("Name")) or "").lower()
            if "bakery" in name_lower and "飲食_麵包店" in vcat_ids:
                vcat_id = vcat_ids["飲食_麵包店"]
            else:
                vcat_id = default_vcat_id
        if not vcat_id:
            skip("vendor")
            continue
        pk = new_id()
        vendor_ids[lid] = pk
        vendor_payload.append(
            {
                "tb_tyapp_yhvd_id": pk,
                "legacy_id": lid,
                "category_id": vcat_id,
                "name": as_text(row.get("Name")) or lid,
                "name_short": as_text(row.get("Name_簡稱_如有")),
                "sort_order": as_int(row.get("Order")),
            }
        )

    fa_payload: list[dict[str, Any]] = []
    for row in fas:
        lid = as_text(row.get("ID"))
        cur = as_text(row.get("Currency")) or "CAD"
        if not lid:
            skip("fa")
            continue
        pk = new_id()
        fa_ids[lid] = pk
        person = (as_text(row.get("Person ID")) or "").lower()
        fa_payload.append(
            {
                "tb_tyapp_yhfa_id": pk,
                "legacy_id": lid,
                "owner_user_id": person_user(person),
                "display_name": as_text(row.get("Display Name")) or lid,
                "currency": cur if cur != "FREE" else "FREE",
            }
        )

    wallet_payload: list[dict[str, Any]] = []
    for row in wallets:
        lid = as_text(row.get("ID"))
        fa = as_text(row.get("Financial_Accounts"))
        if not lid or not fa or fa not in fa_ids:
            skip("wallet")
            continue
        pk = new_id()
        wallet_ids[lid] = pk
        wallet_payload.append(
            {
                "tb_tyapp_yhwl_id": pk,
                "legacy_id": lid,
                "financial_account_id": fa_ids[fa],
                "name": as_text(row.get("Name")) or lid,
                "sort_order": as_int(row.get("Order")),
                "remarks": as_text(row.get("Remark")),
            }
        )

    fx_payload: list[dict[str, Any]] = []
    seen_fx: set[tuple[str, int]] = set()
    for row in fx_rows:
        cur = as_text(row.get("Currency"))
        year = as_int(row.get("Year"))
        to_cad = as_num(row.get("To CAD"))
        if not cur or year is None or to_cad is None:
            skip("fx")
            continue
        key = (cur, year)
        if key in seen_fx:
            continue
        seen_fx.add(key)
        fx_payload.append(
            {
                "tb_tyapp_yhfx_id": new_id(),
                "currency": cur,
                "year": year,
                "to_cad": to_cad,
                "source": as_text(row.get("Source")),
            }
        )

    bill_payload: list[dict[str, Any]] = []
    for row in bills if load_bills else []:
        lid = as_text(row.get("YYEMS ID"))
        vendor = as_text(row.get("Vendor ID"))
        wallet = as_text(row.get("Wallet"))
        occurred = as_iso_dt(row.get("DateTime"))
        amount = as_num(row.get("Amount"))
        cur = as_text(row.get("Currency")) or "CAD"
        if amount is None and cur == "FREE":
            amount = 0.0
        if not lid or not vendor or vendor not in vendor_ids:
            skip("bill")
            continue
        if not wallet or wallet not in wallet_ids:
            skip("bill_wallet")
            continue
        if not occurred or amount is None:
            skip("bill_required")
            continue
        tz = as_text(row.get("Location TimeZone")) or "TO"
        if tz not in {"HK", "TO"}:
            tz = "TO"
        flow = (as_text(row.get("In_or_out")) or "out").strip().lower()
        if flow not in {"in", "out", "free"}:
            flow = "out"
        own = (as_text(row.get("Ownership")) or "").strip().lower()
        if own not in {"cty", "frd", "yyems"}:
            own = "yyems"
        pk = new_id()
        bill_ids[lid] = pk
        tick = as_text(row.get("✔️"))
        bill_payload.append(
            {
                "tb_tyapp_yhbl_id": pk,
                "legacy_id": lid,
                "occurred_at": occurred,
                "location_tz": tz,
                "in_or_out": flow,
                "ownership": own,
                "vendor_id": vendor_ids[vendor],
                "currency": cur,
                "amount": amount,
                "wallet_id": wallet_ids[wallet],
                "remark": as_text(row.get("remark")),
                "description": as_text(row.get("description")),
                "reconciled": bool(tick),
                "wallet_amount": as_num(row.get("Wallet Amount")),
                "period_start": as_iso_date(row.get("start_date")),
                "period_end": as_iso_date(row.get("end_date")),
                "created_by": created_by_from_email(row.get("email_address")),
                "group_id": couple_group_id,
            }
        )

    price_payload: list[dict[str, Any]] = []
    for row in prices if load_kitchen else []:
        lid = as_text(row.get("Price ID"))
        item = as_text(row.get("Item ID"))
        priced = as_iso_dt(row.get("Datetime"))
        if not lid or not item or item not in item_ids or not priced:
            skip("price")
            continue
        vendor = as_text(row.get("Vendor ID"))
        btype = as_text(row.get("Barcode_type"))
        bmap = {"UPC": "upc", "PLU": "plu", "Price-embedded": "price_embedded"}
        organic = as_bool(row.get("有機?"))
        msg = as_bool(row.get("有味精?"))
        if as_text(row.get("有味精?")) == "無味精":
            msg = False
        pk = new_id()
        price_ids[lid] = pk
        price_payload.append(
            {
                "tb_tyapp_yhpr_id": pk,
                "legacy_id": lid,
                "priced_at": priced,
                "vendor_id": vendor_ids.get(vendor) if vendor else None,
                "item_id": item_ids[item],
                "product_name": as_text(row.get("Product Name")),
                "product_name_zh": as_text(row.get("ProductName_中文")),
                "brand": as_text(row.get("Brand")),
                "currency": as_text(row.get("Currency")) or "CAD",
                "packed_price": as_num(row.get("Packed Price")),
                "tax_rate": as_num(row.get("Tax %")),
                "discount_rate": as_num(row.get("Discount")),
                "marked_price": as_num(row.get("Marked Price")),
                "marked_amount": as_num(row.get("Marked Amount")),
                "marked_unit": as_text(row.get("Marked Unit")),
                "packed_amount": as_num(row.get("Packed Amount")),
                "packed_unit": as_text(row.get("Packed Unit")),
                "tag": as_text(row.get("Tag")),
                "is_organic": organic,
                "has_msg": msg,
                "origin": as_text(row.get("原產地")),
                "barcode": as_text(row.get("Barcode")),
                "barcode_type": bmap.get(btype or "", None),
                "remarks": as_text(row.get("Remarks")),
                "nutri_basis_amount": as_num(row.get("Nutri_Basis_Amount")),
                "nutri_basis_unit": as_text(row.get("Nutri_Basis_Unit")),
                "protein_g": as_num(row.get("Protein_g")),
                "carb_g": as_num(row.get("Carb_g")),
                "fat_g": as_num(row.get("Fat_g")),
                "calories_kcal": as_num(row.get("Calories_kcal")),
                "fiber_g": as_num(row.get("Fiber_g")),
                "sodium_mg": as_num(row.get("Sodium_mg")),
                "nutri_is_estimated": bool(as_bool(row.get("Nutri_Is_Estimated")) or False),
                "created_by": default_created_by,
            }
        )

    buy_payload: list[dict[str, Any]] = []
    for row in buys if load_kitchen else []:
        lid = as_text(row.get("Buy ID"))
        price = as_text(row.get("Price Log ID"))
        home = as_num(row.get("Home Amount"))
        if not lid or not price or price not in price_ids or home is None:
            skip("buy")
            continue
        bill = as_text(row.get("YYEMS ID"))
        pk = new_id()
        buy_ids[lid] = pk
        # PostgREST bulk insert unions keys across the batch; a missing
        # created_at on one row would send NULL for the whole batch and
        # override DEFAULT now(). Always send a timestamp.
        created = as_iso_dt(row.get("Created at")) or datetime.now(
            timezone.utc
        ).isoformat()
        buy_payload.append(
            {
                "tb_tyapp_yhby_id": pk,
                "legacy_id": lid,
                "price_id": price_ids[price],
                "bill_id": bill_ids.get(bill) if bill else None,
                "paid": as_num(row.get("Paid")),
                "home_amount": home,
                "home_unit": as_text(row.get("Home Unit")),
                "marked_amount_count": as_num(row.get("Number of Marked Amounts")),
                "expiry_date": as_iso_date(row.get("Expiry Date")),
                "remarks": as_text(row.get("Remarks")),
                "paid_adjust_note": as_text(row.get("調整")),
                "paid_adjust_reason": as_text(row.get("調整原因")),
                "eat_priority": as_int(row.get("Priority_in_Eat"), 50) or 50,
                "created_by": default_created_by,
                "created_at": created,
            }
        )

    eat_payload: list[dict[str, Any]] = []
    for row in eats if load_kitchen else []:
        lid = as_text(row.get("Eat ID"))
        buy = as_text(row.get("Buy ID"))
        home = as_num(row.get("Home Amount"))
        meal = as_text(row.get("Meal"))
        eat_date = as_iso_date(row.get("Eat Date"))
        if not lid or not buy or buy not in buy_ids or home is None:
            skip("eat")
            continue
        if meal not in MEALS:
            skip("eat_meal")
            continue
        if not eat_date:
            skip("eat_date")
            continue
        who = (as_text(row.get("Eaten By")) or "").strip().lower()
        eaten_user = person_user(who)
        eaten_other = None
        if who in {"yyems"}:
            eaten_other = "shared"
        elif who in {"dining_out", "外"}:
            eaten_other = "dining_out"
        elif who in {"nil", "無"}:
            eaten_other = "nil"
        elif who and not eaten_user:
            skip("eat_who")
            continue
        added = as_iso_dt(row.get("Add Datetime")) or eat_date
        eat_payload.append(
            {
                "tb_tyapp_yhet_id": new_id(),
                "legacy_id": lid,
                "buy_id": buy_ids[buy],
                "home_amount": home,
                "meal": meal,
                "eaten_by_user_id": eaten_user,
                "eaten_by_other": eaten_other,
                "eat_date": eat_date,
                "added_at": added,
                "description": as_text(row.get("Description")),
                "created_by": default_created_by,
            }
        )

    file_payload: list[dict[str, Any]] = []
    for row in files if load_kitchen else []:
        lid = as_text(row.get("YYEMS Image ID"))
        bill = as_text(row.get("YYEMS ID"))
        if not lid or not bill or bill not in bill_ids:
            skip("file")
            continue
        kind_raw = (as_text(row.get("Type of Image")) or "photo").lower()
        kind = "receipt" if kind_raw == "receipt" else "photo"
        path = as_text(row.get("Image")) or as_text(row.get("File"))
        if as_text(row.get("File")) and not as_text(row.get("Image")):
            kind = "file"
        if not path:
            skip("file_path")
            continue
        file_payload.append(
            {
                "tb_tyapp_yhfl_id": new_id(),
                "legacy_id": lid,
                "bill_id": bill_ids[bill],
                "kind": kind,
                "drive_file_id": None,
                "legacy_path": path,
                "original_filename": path.split("/")[-1],
                "created_by": default_created_by,
            }
        )

    print("payloads:", {k: len(v) for k, v in {
        "cat": cat_payload,
        "item": item_payload,
        "vcat": vcat_payload,
        "vendor": vendor_payload,
        "fa": fa_payload,
        "wallet": wallet_payload,
        "fx": fx_payload,
        "bill": bill_payload,
        "price": price_payload,
        "buy": buy_payload,
        "eat": eat_payload,
        "file": file_payload,
    }.items()})
    print("skipped:", skipped)

    if args.dry_run or client is None:
        print("dry-run: no writes")
        return 0

    def insert_all(table: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        for part in chunked(rows):
            clean = [{k: v for k, v in row.items() if v is not None} for row in part]
            client.table(table).insert(clean).execute()
        print(f"inserted {table} {len(rows)}")

    insert_all("tyapp_yyhome_item_category", cat_payload)
    insert_all("tyapp_yyhome_item", item_payload)
    insert_all("tyapp_yyhome_vendor_category", vcat_payload)
    insert_all("tyapp_yyhome_vendor", vendor_payload)
    insert_all("tyapp_yyhome_financial_account", fa_payload)
    insert_all("tyapp_yyhome_wallet", wallet_payload)
    insert_all("tyapp_yyhome_fx_rate", fx_payload)
    if load_bills:
        insert_all("tyapp_yyhome_bill", bill_payload)
    if load_kitchen:
        insert_all("tyapp_yyhome_price", price_payload)
        insert_all("tyapp_yyhome_buy", buy_payload)
        insert_all("tyapp_yyhome_eat", eat_payload)
        insert_all("tyapp_yyhome_file", file_payload)
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
