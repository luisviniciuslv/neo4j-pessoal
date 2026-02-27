export type DebtStatus = 'pending' | 'partially_paid' | 'paid';

export interface DebtDTO {
  title: string;
  credor: string;
  amount?: number | null;
  status?: DebtStatus;
  tags: string[];
  dueDate?: string;
  payDate?: string;
  totalInstallments?: number | null;
}

export interface Debt {
  id: string;
  title: string;
  credor: string;
  amount?: number | null;
  status: DebtStatus;
  tags: string[];
  dueDate: string;
  payDate?: string;
  totalInstallments?: number | null;
  paidInstallments: number;
  installmentAmount?: number | null;
  remainingAmount?: number | null;
}
