export interface Deposit {
  id: string;
  name: string;
  value: number;
  isLoan?: boolean;
  creditorName?: string;
  date: string;
}

export interface DepositDTO {
  name: string;
  value: number;
  isLoan?: boolean;
  creditorName?: string;
  date?: string;
}
