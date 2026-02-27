export interface Expense {
  id: string;
  description: string;
  value: number;
  tags: string[];
  date: string;
}

export interface ExpenseDTO {
  description: string;
  value: number;
  tags?: string[];
  date?: string;
}