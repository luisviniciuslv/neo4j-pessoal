import { DebtDTO, Debt } from '../../models/Debit.model';
import Neo4jService from '../../service/drivers/neo4jDriver';
import { BaseRepository } from '../repository';

export class DebtRepository extends BaseRepository<Debt> {
  constructor() {
    super('Debt');
  }

  public async addDebt(
    personId,
    { id, title, amount, tags, dueDate, payDate }: Debt
  ) {
    const session = Neo4jService.getSession();
    const query = `
      MATCH (p:Person { id: $personId })
      CREATE (d:Debt { id: $id, title: $title, amount: $amount, tags: $tags, status: 'pending', dueDate: $dueDate, payDate: $payDate })
      CREATE (p)-[:HAS_BILL]->(d)
      return d
    `;
    try {
      await session.run(query, {
        personId,
        id,
        title,
        amount,
        tags,
        dueDate,
        payDate
      });
    } finally {
      await session.close();
    }
  }

  async listDebtsByPersonId(personId: string): Promise<Debt[]> {
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
