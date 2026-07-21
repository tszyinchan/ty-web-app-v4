export interface YyemsRaw {
  'YYEMS ID': string;
  DateTime: string;
  In_or_out: string;
  'Vendor ID': string;
  Currency: string;
  Amount: number;
  Ownership: string;
  Wallet_owner: string;
  Financial_Accounts: string;
  wallet_amount: string | number;
  auto_stat_month: string;
  auto_vendor_name: string;
  auto_vendor_category: string;
  'auto_UTC DateTime': string;
}

export interface VendorRaw {
  ID: string;
  Name: string;
  Vendor_分類: string;
}

export interface AccountRaw {
  ID: string;
  'Person ID': string;
  'Display Name': string;
  Currency: string;
  'Default?': string;
}

export interface YyemsRecord {
  id: string;
  date: Date;
  utcDate: Date;
  statMonth: string;
  type: 'In' | 'Out';
  amount: number;
  currency: string;
  originalAmount: number;
  originalCurrency: string;
  owner: string;
  walletOwner: string;
  vendorName: string;
  category: string;
  accountName: string;
  isTransfer: boolean;
  isAnomaly: boolean;
}
