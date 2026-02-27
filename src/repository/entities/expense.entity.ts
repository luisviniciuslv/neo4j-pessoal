import { ManagedTransaction } from 'neo4j-driver';
import { Expense } from '../../models/Expense.model';
import Neo4jService from '../../service/drivers/neo4jDriver';
import { BaseRepository } from '../repository';

export default class ExpenseRepository extends BaseRepository<Expense> {
  constructor() {
    super('Expense');
  }

  async addExpense(
    personId: string,
    expense: Expense,
    tx?: ManagedTransaction
  ): Promise<void> {
    const query = `
      MATCH (p:Person { id: $personId })
      CREATE (e:Expense {
        id: $id,
        description: $description,
        value: $value,
        tags: $tags,
        date: $date
      })
      CREATE (p)-[:HAS_EXPENSE]->(e)
      RETURN e
    `;

    const params = {
      personId,
      id: expense.id,
      description: expense.description,
      value: expense.value,
      tags: expense.tags,
      date: expense.date
    };

    if (tx) {
      await Neo4jService.runInTransaction(tx, query, params);
      return;
    }

    const session = Neo4jService.getSession();
    try {
      await session.run(query, params);
    } finally {
      await session.close();
    }
  }

  async listExpensesByUserId(personId: string): Promise<Expense[]> {
    const session = Neo4jService.getSession();
    const query = `
      MATCH (p:Person { id: $personId })-[:HAS_EXPENSE]->(e:Expense)
      RETURN e
    `;

    try {
      const result = await session.run(query, { personId });
      return result.records.map((record) => record.get('e').properties as Expense);
    } finally {
      await session.close();
    }
  }
}