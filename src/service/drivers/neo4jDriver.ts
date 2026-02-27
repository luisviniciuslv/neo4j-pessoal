import neo4j, {
  Driver,
  ManagedTransaction,
  QueryResult,
  Session
} from 'neo4j-driver';

type Neo4jConfig = {
  uri: string;
  user: string;
  pass: string;
};

export default class Neo4jService {
  private static driver: Driver;

  private static getConfigFromEnv(): Neo4jConfig {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER;
    const pass = process.env.NEO4J_PASSWORD;

    if (!uri || !user || !pass) {
      throw new Error(
        'Variáveis de ambiente do Neo4j ausentes. Defina NEO4J_URI, NEO4J_USER e NEO4J_PASSWORD.'
      );
    }

    return { uri, user, pass };
  }

  static connect(config?: Neo4jConfig) {
    const { uri, user, pass } = config ?? this.getConfigFromEnv();
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  }

  static getSession(): Session {
    return this.driver.session();
  }

  static async executeWrite<T>(
    work: (tx: ManagedTransaction) => Promise<T>
  ): Promise<T> {
    const session = this.getSession();
    try {
      return await session.executeWrite(work);
    } finally {
      await session.close();
    }
  }

  static runInTransaction(
    tx: ManagedTransaction,
    query: string,
    parameters?: Record<string, unknown>
  ): Promise<QueryResult> {
    return tx.run(query, parameters);
  }

  static async close() {
    await this.driver.close();
  }
}