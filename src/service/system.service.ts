import { Debt, DebtDTO } from '../models/Debit.model';
import { Deposit, DepositDTO } from '../models/Deposit.model';
import { DebtRepository } from '../repository/entities/debt.entity';
import DepositRepository from '../repository/entities/deposit.entity';
import { PersonRepository } from '../repository/entities/person.entity';
import { randomUUID } from 'crypto';

export default class SystemService {
  public registerDebt(userId, debt: DebtDTO) {
    const debtRepo = new DebtRepository();
    return debtRepo.addDebt(userId, {
      id: randomUUID(),
      title: debt.title,
      credor: debt.credor,
      amount: debt.amount,
      status: debt.status,
      tags: debt.tags,
      dueDate: debt.dueDate || new Date().toISOString(),
      payDate: debt.payDate || 'Não pago'
    });
  }

  public async listDebts(userId: string): Promise<Debt[]> {
    const debtsRepo = new DebtRepository();
    const debts = await debtsRepo.listDebtsByPersonId(userId);

    return debts.sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );
  }

  public async payDebt(userId: string, debtId: string, amount: number) {
    const personRepo = new PersonRepository();

    const user = await personRepo.findById(userId);
    if (!user || (user.money || 0) < amount) {
      throw new Error('Saldo insuficiente ou usuário não encontrado');
    }

    await personRepo.removeMoney(userId, amount);
    await personRepo.payDebit(userId, debtId);

    return { success: true };
  }

  public async registerDeposit(userId: string, deposit: DepositDTO) {
    const depositRepo = new DepositRepository();
    await depositRepo.addDeposit(
      userId,
      randomUUID(),
      deposit.name,
      deposit.isLoan || false,
      deposit.creditorName || 'no name',
      deposit.value
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
}
