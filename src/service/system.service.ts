import { Debt, DebtDTO } from '../models/Debit.model';
import { Deposit, DepositDTO } from '../models/Deposit.model';
import { Expense, ExpenseDTO } from '../models/Expense.model';
import { DebtRepository } from '../repository/entities/debt.entity';
import DepositRepository from '../repository/entities/deposit.entity';
import ExpenseRepository from '../repository/entities/expense.entity';
import { PersonRepository } from '../repository/entities/person.entity';
import { randomUUID } from 'crypto';
import Neo4jService from './drivers/neo4jDriver';
import {
  validateDebtInput,
  validateDepositInput,
  validateExpenseInput,
  validatePayDebtInput,
  validateRequiredField
} from '../validation/input.validation';

type DebtPaymentResult = {
  success: boolean;
  debtId: string;
  installmentsPaidNow: number;
  paidInstallments: number;
  totalInstallments: number | null;
  remainingAmount: number | null;
  status: 'paid' | 'partially_paid';
};

export default class SystemService {
  public registerDebt(userId: string, debt: DebtDTO): Promise<void> {
    validateRequiredField(userId, 'userId');
    validateDebtInput(debt);

    const debtRepo = new DebtRepository();
    const hasFixedInstallments =
      typeof debt.totalInstallments === 'number' &&
      Number.isInteger(debt.totalInstallments) &&
      debt.totalInstallments >= 1;
    const totalInstallments = hasFixedInstallments
      ? Math.floor(debt.totalInstallments as number)
      : null;
    const hasKnownTotalAmount =
      typeof debt.amount === 'number' &&
      Number.isFinite(debt.amount) &&
      debt.amount > 0;
    const installmentAmount =
      hasFixedInstallments && hasKnownTotalAmount
        ? Number(((debt.amount as number) / (totalInstallments as number)).toFixed(2))
        : null;

    return debtRepo.addDebt(userId, {
      id: randomUUID(),
      title: debt.title,
      credor: debt.credor,
      amount: hasKnownTotalAmount ? debt.amount : null,
      status: debt.status || 'pending',
      tags: debt.tags,
      dueDate: debt.dueDate || new Date().toISOString(),
      payDate: debt.payDate || 'Não pago',
      totalInstallments,
      paidInstallments: 0,
      installmentAmount,
      remainingAmount: hasKnownTotalAmount ? debt.amount : null
    });
  }

  public async listDebts(userId: string): Promise<Debt[]> {
    const debtsRepo = new DebtRepository();
    const debts = await debtsRepo.listDebtsByPersonId(userId);

    return debts.sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );
  }

  public async payDebt(
    userId: string,
    debtId: string,
    amount?: number,
    installmentsToPay: number = 1
  ): Promise<DebtPaymentResult> {
    validatePayDebtInput(userId, debtId, amount, installmentsToPay);

    const personRepo = new PersonRepository();
    const debtsRepo = new DebtRepository();
    const debts = await debtsRepo.listDebtsByPersonId(userId);
    const debt = debts.find((item) => item.id === debtId);

    if (!debt) {
      throw new Error('Dívida não encontrada');
    }

    if (debt.status === 'paid') {
      throw new Error('Dívida já está paga');
    }

    if (!Number.isInteger(installmentsToPay) || installmentsToPay < 1) {
      throw new Error('A quantidade de parcelas para pagamento deve ser >= 1');
    }

    const hasFixedInstallments =
      typeof debt.totalInstallments === 'number' &&
      Number.isInteger(debt.totalInstallments) &&
      debt.totalInstallments >= 1;
    const totalInstallments = hasFixedInstallments
      ? Number(debt.totalInstallments)
      : null;
    const hasKnownTotalAmount =
      typeof debt.amount === 'number' &&
      Number.isFinite(debt.amount) &&
      debt.amount > 0;
    const paidInstallments = Number(debt.paidInstallments || 0);
    const remainingAmount =
      typeof debt.remainingAmount === 'number' && Number.isFinite(debt.remainingAmount)
        ? debt.remainingAmount
        : hasKnownTotalAmount
          ? (debt.amount as number)
          : null;
    const remainingInstallments = hasFixedInstallments
      ? Math.max(0, (totalInstallments as number) - paidInstallments)
      : null;

    if (
      hasFixedInstallments &&
      installmentsToPay > Number(remainingInstallments)
    ) {
      throw new Error(
        `Não é possível pagar ${installmentsToPay} parcelas. Restam ${remainingInstallments}`
      );
    }

    const installmentAmount = Number(
      debt.installmentAmount ||
        (hasFixedInstallments && hasKnownTotalAmount
          ? Number(((debt.amount as number) / (totalInstallments as number)).toFixed(2))
          : 0)
    );

    let expectedAmount: number | null = null;
    if (hasFixedInstallments) {
      if (remainingAmount === null) {
        expectedAmount = null;
      } else {
      expectedAmount = 0;
      for (let index = 1; index <= installmentsToPay; index++) {
        const isLastInstallmentOfDebt =
          paidInstallments + index >= (totalInstallments as number);
        const currentInstallmentAmount = isLastInstallmentOfDebt
          ? Number(((remainingAmount as number) - expectedAmount).toFixed(2))
          : installmentAmount;
        expectedAmount += currentInstallmentAmount;
      }

      expectedAmount = Number(expectedAmount.toFixed(2));
      }
    }

    if ((!hasFixedInstallments || expectedAmount === null) && amount === undefined) {
      throw new Error(
        'Informe o valor a pagar para cobranças com valor total indefinido'
      );
    }

    const amountToPay = amount ?? (expectedAmount as number);

    if (remainingAmount !== null && amountToPay > remainingAmount) {
      throw new Error('O valor informado é maior que o saldo restante da dívida');
    }

    const user = await personRepo.findById(userId);
    if (!user || (user.money || 0) < amountToPay) {
      throw new Error('Saldo insuficiente ou usuário não encontrado');
    }

    const newPaidInstallments = paidInstallments + installmentsToPay;
    const newRemainingAmount =
      remainingAmount === null
        ? null
        : Number(Math.max(0, remainingAmount - amountToPay).toFixed(2));
    const isFullyPaid =
      (newRemainingAmount !== null && newRemainingAmount <= 0) ||
      (hasFixedInstallments &&
        newPaidInstallments >= (totalInstallments as number));

    await Neo4jService.executeWrite(async (tx) => {
      const debitResult = await Neo4jService.runInTransaction(
        tx,
        `
          MATCH (p:Person { id: $personId })
          WHERE coalesce(p.money, 0) >= $amount
          SET p.money = coalesce(p.money, 0) - $amount
          RETURN p
        `,
        {
          personId: userId,
          amount: amountToPay
        }
      );

      if (debitResult.records.length === 0) {
        throw new Error('Saldo insuficiente ou usuário não encontrado');
      }

      await personRepo.updateDebtPayment(
        userId,
        debtId,
        isFullyPaid ? 'paid' : 'partially_paid',
        newPaidInstallments,
        newRemainingAmount,
        new Date().toISOString(),
        tx
      );
    });

    return {
      success: true,
      debtId,
      installmentsPaidNow: installmentsToPay,
      paidInstallments: newPaidInstallments,
      totalInstallments,
      remainingAmount: newRemainingAmount,
      status: isFullyPaid ? 'paid' : 'partially_paid'
    };
  }

  public async payDebtInstallments(
    userId: string,
    debtId: string,
    installmentsToPay: number
  ): Promise<DebtPaymentResult> {
    return this.payDebt(userId, debtId, undefined, installmentsToPay);
  }

  public async registerDeposit(
    userId: string,
    deposit: DepositDTO
  ): Promise<void> {
    validateRequiredField(userId, 'userId');
    validateDepositInput(deposit);

    const depositRepo = new DepositRepository();
    await depositRepo.addDeposit(
      userId,
      randomUUID(),
      deposit.name,
      deposit.isLoan || false,
      deposit.creditorName || 'no name',
      deposit.value,
      deposit.date || new Date().toISOString()
    );
    const personRepo = new PersonRepository();
    await personRepo.addMoney(userId, deposit.value);
  }

  public async listDeposits(userId: string): Promise<Deposit[]> {
    const depositRepo = new DepositRepository();
    const deposits = await depositRepo.lisDepositByUserId(userId);
    return deposits.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  public async register_expense(
    userId: string,
    expense: ExpenseDTO
  ): Promise<void> {
    validateRequiredField(userId, 'userId');
    validateExpenseInput(expense);

    const expenseRepo = new ExpenseRepository();
    const value = Number(expense.value.toFixed(2));

    await Neo4jService.executeWrite(async (tx) => {
      const debitResult = await Neo4jService.runInTransaction(
        tx,
        `
          MATCH (p:Person { id: $personId })
          WHERE coalesce(p.money, 0) >= $amount
          SET p.money = coalesce(p.money, 0) - $amount
          RETURN p
        `,
        {
          personId: userId,
          amount: value
        }
      );

      if (debitResult.records.length === 0) {
        throw new Error('Saldo insuficiente ou usuário não encontrado');
      }

      await expenseRepo.addExpense(
        userId,
        {
          id: randomUUID(),
          description: expense.description,
          value,
          tags: expense.tags || [],
          date: expense.date || new Date().toISOString()
        },
        tx
      );
    });
  }

  public async registerExpense(
    userId: string,
    expense: ExpenseDTO
  ): Promise<void> {
    return this.register_expense(userId, expense);
  }

  public async listExpenses(userId: string): Promise<Expense[]> {
    validateRequiredField(userId, 'userId');
    const expenseRepo = new ExpenseRepository();
    const expenses = await expenseRepo.listExpensesByUserId(userId);
    return expenses.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }
}
