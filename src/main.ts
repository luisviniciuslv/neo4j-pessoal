import Neo4jService from './service/drivers/neo4jDriver';
import { PersonRepository } from './repository/entities/person.entity';
import { randomUUID } from 'crypto';
import SystemService from './service/system.service';
import DepositRepository from './repository/entities/deposit.entity';
import { DebtRepository } from './repository/entities/debt.entity';

async function runTests() {
  // 1. Conexão
  Neo4jService.connect(
    'neo4j+s://c3a4826d.databases.neo4j.io',
    'neo4j',
    'PhBHO_DUmikfmjj4uguGYnBZ-Fxtok7rRFgHOedrIAs'
  );

  const system = new SystemService();
  const personRepo = new PersonRepository();
  const userId = randomUUID();

  try {
    console.log('--- Iniciando Testes de Finanças ---');

    // 2. Criar Usuário
    await personRepo.create({
      id: userId,
      name: 'Usuario Teste',
      money: 0
    });
    console.log('✅ Usuário criado');

    // 3. Registrar Depósito (Entrada de Dinheiro)
    await system.registerDeposit(userId, {
      name: 'Salário Mensal',
      value: 5000,
      isLoan: false
    });
    console.log('✅ Depósito de R$ 5000 realizado');

    // 4. Verificar Saldo após depósito
    const userAfterDeposit = await personRepo.findById(userId);
    console.log(`💰 Saldo atual: R$ ${userAfterDeposit?.money}`);

    // 5. Registrar uma Dívida
    await system.registerDebt(userId, {
      title: 'Aluguel',
      credor: 'Imobiliária X',
      amount: 1200,
      status: 'pending',
      tags: ['moradia', 'essencial'],
      dueDate: new Date('2024-02-10').toISOString()
    });
    console.log('✅ Dívida de Aluguel (R$ 1200) registrada');

    // 6. Listar Dívidas
    const debts = await system.listDebts(userId);
    console.log(`📋 Total de dívidas encontradas: ${debts.length}`);
    console.log(`Dívida 1: ${debts[0].title} - Status: ${debts[0].status}`);

    // 7. Pagar a Dívida
    console.log('--- Processando Pagamento ---');
    await system.payDebt(userId, debts[0].id, debts[0].amount);
    console.log('✅ Dívida paga com sucesso');

    // 8. Verificar Saldo Final e Status da Dívida
    const userFinal = await personRepo.findById(userId);
    const debtsFinal = await system.listDebts(userId);

    console.log(`💰 Saldo Final: R$ ${userFinal?.money}`); // Deve ser 3800
    console.log(`📋 Status Final da Dívida: ${debtsFinal[0].status}`); // Deve ser 'paid'

    // 9. Listar Histórico de Depósitos
    const history = await system.listDeposits(userId);
    console.log(`📥 Histórico de depósitos: ${history.length} entrada(s)`);
  } catch (error) {
    console.error('❌ Erro durante os testes:', error.message);
  } finally {
    await Neo4jService.close();
    console.log('--- Testes Finalizados ---');
  }
}

// runTests();
async function clearDatabase() {
  Neo4jService.connect(
    'neo4j+s://c3a4826d.databases.neo4j.io',
    'neo4j',
    'PhBHO_DUmikfmjj4uguGYnBZ-Fxtok7rRFgHOedrIAs'
  );
  const debtRepo = new DebtRepository();
  const a = await debtRepo.list();
  console.log(a);
  // await debtRepo.clearAllData();
  const personRepo = new PersonRepository();
  const b = await personRepo.list();
  console.log(b);
  // await personRepo.clearAllData();
  const depositRepo = new DepositRepository();
  const c = await depositRepo.list();
  console.log(c);

  // await depositRepo.clearAllData();

  console.log('Database cleared');
  await Neo4jService.close();
}

clearDatabase();
