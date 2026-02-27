import { Deposit } from '../../models/Deposit.model';
import Neo4jService from '../../service/drivers/neo4jDriver';
import { BaseRepository } from '../repository';

export default class DepositRepository extends BaseRepository<Deposit> {
  constructor() {
    super('Deposit');
  }

  async addDeposit(
    personId: string,
    depositId: string,
    name: string,
    isLoan: boolean,
    creditorName: string,
    value: number,
    date: string = new Date().toISOString()
  ): Promise<void> {
    const session = Neo4jService.getSession();
    const query = `
      MATCH (p:Person { id: $personId })
      CREATE (d:Deposit { id: $depositId, name: $name, value: $value, isLoan: $isLoan, creditorName: $creditorName, date: $date })
      CREATE (p)-[:HAS_DEPOSIT]->(d)
      RETURN d
    `;
    try {
      await session.run(query, {
        personId,
        name,
        depositId,
        value,
        isLoan,
        creditorName,
        date
      });
    } finally {
      await session.close();
    }
  }

  async lisDepositByUserId(personId: string): Promise<Deposit[]> {
    const session = Neo4jService.getSession();
    const query = `
      MATCH (p:Person { id: $personId })-[:HAS_DEPOSIT]->(d:Deposit)
      RETURN d
      `;

    try {
      const result = await session.run(query, {
        personId
      });

      return result.records.map((record) => record.get('d').properties as any);
    } finally {
      await session.close();
    }
  }
}
