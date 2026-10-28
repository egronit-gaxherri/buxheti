// Të gjitha shumat janë në CENT (integer). monthKey = 'YYYY-MM', date = 'YYYY-MM-DD'.

export interface Budget {
  id: string
  name: string
  color: string
  order: number
  /** I ndarë me familjen (sinkronizohet). */
  shared?: boolean
}

export interface Category {
  id: string
  name: string
  icon: string
  keywords: string[] // fjalë kyçe të vogla, pa theks, për auto-kategorizim
}

/** Një person që jep para (për shtëpi ose për ty): Edi, mami, babi… */
export interface Person {
  id: string
  name: string
  color: string
  archived: boolean
  createdAt: number
  /** Personi që përfaqëson një anëtar të familjes në sinkronizim. */
  memberId?: string
}

export interface Income {
  id: string
  monthKey: string
  /** Kush i dha paratë; mungon = vetë përdoruesi (rroga). */
  personId?: string
  source: string // emri i personit ose "Rrogë" — për shfaqje
  amount: number
  date: string
  createdAt: number
  note?: string
  /** E hyrë e ardhur nga një anëtar tjetër i familjes (vetëm pjesa për buxhetet e përbashkëta). */
  shadow?: boolean
}

/** Ndarja e një të hyre mes buxheteve. Shuma e ndarjeve = shuma e të hyrës. */
export interface IncomeSplit {
  id: string
  incomeId: string
  budgetId: string
  monthKey: string
  amount: number
}

export interface Expense {
  id: string
  monthKey: string
  budgetId: string
  categoryId: string
  amount: number
  description: string
  note?: string
  receipt?: Blob
  date: string
  createdAt: number
  recurringId?: string
  /** Emri i anëtarit të familjes që e shtoi (vetëm për shpenzimet e përbashkëta). */
  addedBy?: string
}

export interface Transfer {
  id: string
  monthKey: string
  fromBudgetId: string
  toBudgetId: string
  amount: number
  date: string
  createdAt: number
  note?: string
}

/** Korrigjim i bilancit (përshtatje me realitetin). amount mund të jetë negativ. */
export interface Adjustment {
  id: string
  monthKey: string
  budgetId: string
  amount: number
  date: string
  createdAt: number
  note?: string
  /** Lëvizje e krijuar nga një borxh (dhënie/marrje hua ose pagesë) — jo korrigjim. */
  debtId?: string
  /** Para të vëna mënjanë për një qëllim kursimi (ose të tërhequra prej tij). */
  goalId?: string
}

export interface GoalContribution {
  id: string
  /** pozitive = kursim (para të vëna mënjanë), negative = tërheqje */
  amount: number
  date: string
  /** Buxheti nga/ku lëvizën paratë; mungon = para nga jashtë buxheteve. */
  budgetId?: string
  adjustmentId?: string
  note?: string
  auto?: boolean
}

export interface GoalAuto {
  amount: number
  budgetId: string
  dayOfMonth: number
  lastRunMonth?: string
}

/** Qëllim kursimi: "Pushime 600 € deri në korrik". */
export interface Goal {
  id: string
  name: string
  icon: string
  color: string
  target: number
  deadline?: string
  contributions: GoalContribution[]
  /** Kursim automatik çdo muaj. */
  auto?: GoalAuto
  archived: boolean
  createdAt: number
}

export type DebtDirection = 'owed_to_me' | 'i_owe'

export interface DebtPayment {
  id: string
  amount: number
  date: string
  /** Buxheti ku hynë/dolën paratë; mungon = pa lëvizje në buxhet. */
  budgetId?: string
  /** Lëvizja përkatëse te `adjustments`, që të fshihet bashkë me pagesën. */
  adjustmentId?: string
  note?: string
}

/** Detyrim/borxh: kush i ka borxh kujt, sa dhe deri kur. */
export interface Debt {
  id: string
  /** owed_to_me = i dhashë hua (më ka borxh); i_owe = mora hua (i kam borxh) */
  direction: DebtDirection
  counterparty: string
  personId?: string
  amount: number
  date: string
  dueDate?: string
  note?: string
  /** Buxheti nga/ku lëvizën paratë kur u krijua borxhi. */
  budgetId?: string
  adjustmentId?: string
  payments: DebtPayment[]
  /** I shlyer plotësisht ose i mbyllur me dorë (falur). */
  settled: boolean
  settledAt?: number
  createdAt: number
}

export interface Recurring {
  id: string
  budgetId: string
  categoryId: string
  amount: number
  description: string
  dayOfMonth: number
  active: boolean
  lastRunMonth?: string
}

export interface Limit {
  id: string
  categoryId: string
  amount: number // limit mujor
}

export interface MonthRecord {
  monthKey: string
  closed: boolean
  /** Bartja në këtë muaj, për çdo buxhet (budgetId → cent). */
  carryIn: Record<string, number>
  /** Sa u bart nga ky muaj te muaji tjetër kur u mbyll (për ta zhbërë te "Hap përsëri"). */
  carried?: Record<string, number>
  closedAt?: number
}

export interface DescriptionStat {
  text: string // i normalizuar (lowercase)
  display: string
  count: number
  lastCategoryId: string
  lastBudgetId: string
  lastAmount?: number
  lastUsed: number
}

export interface Setting {
  key: string
  value: unknown
}

/** Gjurmë e asaj që u sinkronizua herën e fundit për çdo rekord (`type:id` → hash). */
export interface SyncStateRow {
  key: string
  hash: string
}
