export interface DebtDTO {
  title: string;
  credor: string;
  amount: number;
  status: string;
  tags: string[];
  dueDate?: string;
  payDate?: string;
}

export interface Debt {
  id: string;
  title: string;
  credor: string;
  amount: number;
  status: string;
  tags: string[];
  dueDate: string;
  payDate?: string;
}
