import { DebtDTO, DebtStatus } from '../models/Debit.model';
import { DepositDTO } from '../models/Deposit.model';

const VALID_DEBT_STATUS: DebtStatus[] = ['pending', 'partially_paid', 'paid'];

function validateRequiredString(value: string | undefined, fieldName: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Campo obrigatório inválido: ${fieldName}`);
  }
}

export function validateRequiredField(
  value: string | undefined,
  fieldName: string
): void {
  validateRequiredString(value, fieldName);
}

function validatePositiveNumber(value: number, fieldName: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`O campo ${fieldName} deve ser um número maior que 0`);
  }
}

function validateInstallments(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`O campo ${fieldName} deve ser um inteiro maior ou igual a 1`);
  }
}

function validateDebtStatus(status: string): void {
  if (!VALID_DEBT_STATUS.includes(status as DebtStatus)) {
    throw new Error(
      `Status inválido. Valores permitidos: ${VALID_DEBT_STATUS.join(', ')}`
    );
  }
}

export function validateDebtInput(input: DebtDTO): void {
  validateRequiredString(input.title, 'title');
  validateRequiredString(input.credor, 'credor');

  if (input.amount !== undefined && input.amount !== null) {
    validatePositiveNumber(input.amount, 'amount');
  }

  if (!Array.isArray(input.tags)) {
    throw new Error('O campo tags é obrigatório e deve ser um array');
  }

  if (input.status !== undefined) {
    validateDebtStatus(input.status);
  }

  if (input.totalInstallments !== undefined && input.totalInstallments !== null) {
    validateInstallments(input.totalInstallments, 'totalInstallments');
  }
}

export function validateDepositInput(input: DepositDTO): void {
  validateRequiredString(input.name, 'name');
  validatePositiveNumber(input.value, 'value');

  if (input.isLoan === true) {
    validateRequiredString(input.creditorName, 'creditorName');
  }
}

export function validatePayDebtInput(
  userId: string,
  debtId: string,
  amount?: number,
  installmentsToPay?: number
): void {
  validateRequiredString(userId, 'userId');
  validateRequiredString(debtId, 'debtId');

  if (amount !== undefined) {
    validatePositiveNumber(amount, 'amount');
  }

  if (installmentsToPay !== undefined) {
    validateInstallments(installmentsToPay, 'installmentsToPay');
  }
}
