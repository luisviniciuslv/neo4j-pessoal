import Neo4jService from '../service/drivers/neo4jDriver';

export abstract class BaseRepository<T extends { id: string }> {
  constructor(protected readonly label: string) {}

  async create(data: T): Promise<void> {
    const session = Neo4jService.getSession();
    const query = `CREATE (n:${this.label} $props)`;
    try {
      await session.run(query, { props: data });
    } finally {
      await session.close();
    }
  }

  async findById(id: string): Promise<T | null> {
    const session = Neo4jService.getSession();
    const query = `MATCH (n:${this.label} { id: $id }) RETURN n`;
    try {
      const result = await session.run(query, { id });
      if (result.records.length === 0) return null;
      return result.records[0].get('n').properties as T;
    } finally {
      await session.close();
    }
  }

  async delete(id: string): Promise<void> {
    const session = Neo4jService.getSession();
    const query = `MATCH (n:${this.label} { id: $id }) DETACH DELETE n`;
    try {
      console.log(`Deleting ${this.label} with id ${id}`);
      await session.run(query, { id });
    } catch (error) {
      throw new Error(
        `Failed to delete ${this.label} with id ${id} : ${error}`
      );
    } finally {
      await session.close();
    }
  }

  async list(): Promise<T[]> {
    const session = Neo4jService.getSession();
    const query = `MATCH (n:${this.label}) RETURN n`;
    try {
      const result = await session.run(query);
      return result.records.map((record) => record.get('n').properties as T);
    } finally {
      await session.close();
    }
  }

  async clearAllData(): Promise<void> {
    const session = Neo4jService.getSession();
    const query = `MATCH (n:${this.label}) DETACH DELETE n`;
    try {
      await session.run(query);
    } finally {
      await session.close();
    }
  }
}
