export interface Deposit {
  id: string;
  name: string;
  value: number;
  isLoan?: boolean;
  creditorName?: string;
  date: Date;
}

export interface DepositDTO {
  name: string;
  value: number;
  isLoan?: boolean;
  creditorName?: string;
  date?: Date;
}
