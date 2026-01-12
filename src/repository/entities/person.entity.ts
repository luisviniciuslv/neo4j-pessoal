import { Debt } from '../../models/Debit.model';
import { Person } from '../../models/Person.model';
import Neo4jService from '../../service/drivers/neo4jDriver';
import { BaseRepository } from '../repository';

export class PersonRepository extends BaseRepository<Person> {
  constructor() {
    super('Person');
  }

  async payDebit(personId: string, debitId: string) {
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

  async addMoney(personId: string, amount: number) {
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

  async removeMoney(personId: string, amount: number) {
    const session = Neo4jService.getSession();
    const query = `
      MATCH (p:Person { id: $personId })
      SET p.money = coalesce(p.money, 0) - $amount
      RETURN p
    `;
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
