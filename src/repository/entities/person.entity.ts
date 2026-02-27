import { Debt } from '../../models/Debit.model';
import { Person } from '../../models/Person.model';
import Neo4jService from '../../service/drivers/neo4jDriver';
import { ManagedTransaction } from 'neo4j-driver';
import { BaseRepository } from '../repository';

export class PersonRepository extends BaseRepository<Person> {
  constructor() {
    super('Person');
  }

  async updateDebtPayment(
    personId: string,
    debitId: string,
    status: string,
    paidInstallments: number,
    remainingAmount: number | null,
    payDate: string,
    tx?: ManagedTransaction
  ): Promise<void> {
    const query = `
      MATCH (p:Person { id: $personId })-[:HAS_BILL]->(d:Debt { id: $debitId })
      SET d.status = $status,
          d.paidInstallments = $paidInstallments,
          d.remainingAmount = $remainingAmount,
          d.payDate = $payDate
      RETURN d
    `;
    if (tx) {
      await Neo4jService.runInTransaction(tx, query, {
        personId,
        debitId,
        status,
        paidInstallments,
        remainingAmount,
        payDate
      });
      return;
    }

    const session = Neo4jService.getSession();
    try {
      await session.run(query, {
        personId,
        debitId,
        status,
        paidInstallments,
        remainingAmount,
        payDate
      });
    } finally {
      await session.close();
    }
  }

  async payDebit(personId: string, debitId: string): Promise<void> {
    const session = Neo4jService.getSession();
    const query = `
      MATCH (p:Person { id: $personId })-[:HAS_BILL]->(d:Debt { id: $debitId })
      SET d.status = 'paid'
      RETURN d
    `;
    try {
      await session.run(query, { personId, debitId });
    } finally {
      await session.close();
    }
  }

  async addMoney(personId: string, amount: number): Promise<void> {
    const session = Neo4jService.getSession();
    const query = `
      MATCH (p:Person { id: $personId })
      SET p.money = coalesce(p.money, 0) + $amount
      RETURN p
    `;

    try {
      await session.run(query, { personId, amount });
    } finally {
      await session.close();
    }
  }

  async removeMoney(
    personId: string,
    amount: number,
    tx?: ManagedTransaction
  ): Promise<void> {
    const query = `
      MATCH (p:Person { id: $personId })
      SET p.money = coalesce(p.money, 0) - $amount
      RETURN p
    `;

    if (tx) {
      await Neo4jService.runInTransaction(tx, query, { personId, amount });
      return;
    }

    const session = Neo4jService.getSession();
    try {
      await session.run(query, { personId, amount });
    } finally {
      await session.close();
    }
  }

  async listDebts(personId: string): Promise<Debt[]> {
    const session = Neo4jService.getSession();
    const query = `
      MATCH (p:Person { id: $personId })-[:HAS_BILL]->(d:Debt)
      RETURN d
    `;
    try {
      const result = await session.run(query, { personId });
      return result.records.map((record) => record.get('d').properties as any);
    } finally {
      await session.close();
    }
  }
}
