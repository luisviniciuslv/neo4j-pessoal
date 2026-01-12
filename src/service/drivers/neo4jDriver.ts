import neo4j, { Driver, Session } from 'neo4j-driver';

export default class Neo4jService {
  private static driver: Driver;

  static connect(uri: string, user: string, pass: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  }

  static getSession(): Session {
    return this.driver.session();
  }

  static async close() {
    await this.driver.close();
  }
}