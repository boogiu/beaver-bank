import {
  Banknote,
  ChartNoAxesCombined,
  CircleParking,
  CreditCard,
  Landmark,
  PiggyBank,
  TrendingUp,
  Wallet
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AccountType, CardType } from '@shared/domain'

export const ACCOUNT_INFO: Record<AccountType, { label: string; icon: LucideIcon }> = {
  checking: { label: '입출금', icon: Wallet },
  installment: { label: '적금', icon: PiggyBank },
  deposit: { label: '예금', icon: Landmark },
  parking: { label: '파킹통장', icon: CircleParking },
  cma: { label: 'CMA', icon: Banknote },
  investment: { label: '투자', icon: TrendingUp }
}
export const CARD_INFO: Record<CardType, { label: string; icon: LucideIcon }> = {
  debit: { label: '체크카드', icon: CreditCard },
  credit: { label: '신용카드', icon: ChartNoAxesCombined }
}
export const money = (amount: number): string => `${amount.toLocaleString('ko-KR')}원`
