import { DebtDTO, Debt } from '../../models/Debit.model';
import Neo4jService from '../../service/drivers/neo4jDriver';
import { BaseRepository } from '../repository';

export class DebtRepository extends BaseRepository<Debt> {
  constructor() {
    super('Debt');
  }

  public async addDebt(
    personId: string,
    {
      id,
      title,
      credor,
      amount,
      status,
      tags,
      dueDate,
      payDate,
      totalInstallments,
      paidInstallments,
      installmentAmount,
      remainingAmount
    }: Debt
  ): Promise<void> {
    const session = Neo4jService.getSession();
    const query = `
      MATCH (p:Person { id: $personId })
      CREATE (d:Debt {
        id: $id,
        title: $title,
        credor: $credor,
        amount: $amount,
        tags: $tags,
        status: $status,
        dueDate: $dueDate,
        payDate: $payDate,
        totalInstallments: $totalInstallments,
        paidInstallments: $paidInstallments,
        installmentAmount: $installmentAmount,
        remainingAmount: $remainingAmount
      })
      CREATE (p)-[:HAS_BILL]->(d)
      return d
    `;
    try {
      await session.run(query, {
        personId,
        id,
        title,
        credor,
        amount,
        status,
        tags,
        dueDate,
        payDate,
        totalInstallments,
        paidInstallments,
        installmentAmount,
        remainingAmount
      });
    } finally {
      await session.close();
    }
  }

  public async listDebtsByPersonId(personId: string): Promise<Debt[]> {
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
