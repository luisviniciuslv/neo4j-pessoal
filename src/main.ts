#!/usr/bin/env node
import 'dotenv/config';
import chalk from 'chalk';
import Table from 'cli-table3';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

import Neo4jService from './service/drivers/neo4jDriver';
import SystemService from './service/system.service';
import { Person } from './models/Person.model';
import { Debt } from './models/Debit.model';
import { Deposit } from './models/Deposit.model';
import { Expense } from './models/Expense.model';
import { PersonRepository } from './repository/entities/person.entity';

const system = new SystemService();
const personRepo = new PersonRepository();
const stateFilePath = path.join(os.homedir(), '.financas-cli.json');

type CliState = {
  activeUserId?: string;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: unknown): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(toNumber(value));
}

function formatDate(value: string | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

function printSuccess(message: string): void {
  console.log(chalk.green(`✅ ${message}`));
}

function printError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.log(chalk.red(`❌ ${message}`));
}

function printInfo(message: string): void {
  console.log(chalk.cyan(`ℹ️  ${message}`));
}

function parseOptions(args: string[]): {
  positional: string[];
  options: Record<string, string | boolean>;
} {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < args.length; index++) {
    const token = args[index];

    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = args[index + 1];

    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { positional, options };
}

async function readState(): Promise<CliState> {
  try {
    const raw = await fs.readFile(stateFilePath, 'utf-8');
    const data = JSON.parse(raw) as CliState;
    return data || {};
  } catch {
    return {};
  }
}

async function writeState(state: CliState): Promise<void> {
  await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
}

async function getUsers(): Promise<Person[]> {
  return personRepo.list();
}

async function resolveUserByNameOrId(identifier: string): Promise<Person> {
  const users = await getUsers();
  if (users.length === 0) {
    throw new Error('Nenhum usuário cadastrado. Use: financas createUser <nome> [saldo]');
  }

  const normalized = identifier.trim().toLowerCase();
  const byId = users.find((user) => user.id === identifier);
  if (byId) return byId;

  const byName = users.filter((user) => user.name.trim().toLowerCase() === normalized);

  if (byName.length === 0) {
    throw new Error(`Usuário não encontrado: ${identifier}`);
  }

  if (byName.length > 1) {
    throw new Error(
      `Há ${byName.length} usuários com esse nome. Use o id no comando setUser.`
    );
  }

  return byName[0];
}

async function requireActiveUser(): Promise<Person> {
  const state = await readState();

  if (!state.activeUserId) {
    throw new Error('Nenhum usuário ativo. Defina com: financas setUser <nome-ou-id>');
  }

  const user = await personRepo.findById(state.activeUserId);
  if (!user) {
    await writeState({});
    throw new Error('Usuário ativo não existe mais. Defina novamente com setUser.');
  }

  return user;
}

async function commandHelp(): Promise<void> {
  console.log(chalk.bold('\nFINANÇAS CLI'));
  console.log('Uso: financas <comando> [argumentos] [--opcoes]\n');
  console.log('Comandos principais:');
  console.log('  financas createUser <nome> [saldo]');
  console.log('  financas setUser <nome-ou-id>');
  console.log('  financas whoami');
  console.log('  financas listUsers');
  console.log('  financas summary');
  console.log('  financas addDeposit <valor> <descricao> [--loan] [--creditor <nome>]');
  console.log('  financas addExpense <valor> <descricao> [--tags <a,b>]');
  console.log('  financas addDebt <titulo> <credor> [--amount <valor>] [--installments <n>] [--due <YYYY-MM-DD>] [--tags <a,b>]');
  console.log('  financas listDeposits');
  console.log('  financas listExpenses');
  console.log('  financas listDebts');
  console.log('  financas payDebt <debtId> <parcelas> [valor]');
  console.log('  financas deleteUser <nome-ou-id>');
  console.log('\nExemplo:');
  console.log('  financas setUser vinicius');
  console.log('  financas addDeposit 1500 salario');
}

async function commandCreateUser(name?: string, initialMoney?: string): Promise<void> {
  if (!name || !name.trim()) {
    throw new Error('Uso: financas createUser <nome> [saldo]');
  }

  const parsedMoney = initialMoney === undefined ? 0 : Number(initialMoney.replace(',', '.'));
  if (!Number.isFinite(parsedMoney) || parsedMoney < 0) {
    throw new Error('Saldo inicial inválido. Informe um número >= 0.');
  }

  const id = randomUUID();
  await personRepo.create({
    id,
    name: name.trim(),
    money: parsedMoney
  });

  await writeState({ activeUserId: id });
  printSuccess(`Usuário criado e definido como ativo: ${name.trim()}`);
}

async function commandSetUser(identifier?: string): Promise<void> {
  if (!identifier || !identifier.trim()) {
    throw new Error('Uso: financas setUser <nome-ou-id>');
  }

  const user = await resolveUserByNameOrId(identifier);
  await writeState({ activeUserId: user.id });
  printSuccess(`Usuário ativo: ${user.name} (${formatMoney(user.money)})`);
}

async function commandWhoAmI(): Promise<void> {
  const user = await requireActiveUser();
  printInfo(`Usuário ativo: ${user.name} • ${formatMoney(user.money)} • ${user.id}`);
}

async function commandListUsers(): Promise<void> {
  const users = await getUsers();
  const state = await readState();

  if (users.length === 0) {
    printInfo('Nenhum usuário cadastrado.');
    return;
  }

  const table = new Table({
    head: [chalk.white('Ativo'), chalk.white('Nome'), chalk.white('Saldo'), chalk.white('ID')],
    colWidths: [8, 24, 16, 40]
  });

  users.forEach((user) => {
    table.push([
      user.id === state.activeUserId ? chalk.green('●') : chalk.gray('○'),
      user.name,
      formatMoney(user.money),
      user.id
    ]);
  });

  console.log(table.toString());
}

async function commandSummary(): Promise<void> {
  const user = await requireActiveUser();

  const [debts, deposits, expenses] = await Promise.all([
    system.listDebts(user.id),
    system.listDeposits(user.id),
    system.listExpenses(user.id)
  ]);

  const pendingDebts = debts.filter((debt) => debt.status !== 'paid');
  const totalDebt = debts.reduce((sum, debt) => sum + toNumber(debt.remainingAmount), 0);
  const totalDeposits = deposits.reduce((sum, dep) => sum + toNumber(dep.value), 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + toNumber(exp.value), 0);

  console.log(chalk.bold('\n📊 Resumo do usuário ativo'));
  console.log(chalk.white(`Nome: ${user.name}`));
  console.log(chalk.white(`ID: ${user.id}`));
  console.log(chalk.white(`Saldo atual: ${formatMoney(user.money)}`));
  console.log(chalk.white(`Depósitos registrados: ${deposits.length} (${formatMoney(totalDeposits)})`));
  console.log(chalk.white(`Despesas registradas: ${expenses.length} (${formatMoney(totalExpenses)})`));
  console.log(chalk.white(`Dívidas pendentes: ${pendingDebts.length} (${formatMoney(totalDebt)})`));
}

async function commandAddDeposit(args: string[], options: Record<string, string | boolean>): Promise<void> {
  const user = await requireActiveUser();

  const valueText = args[0];
  const name = args[1];

  if (!valueText || !name) {
    throw new Error(
      'Uso: financas addDeposit <valor> <descricao> [--loan] [--creditor <nome>]'
    );
  }

  const value = Number(valueText.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Valor do depósito inválido. Informe um número maior que 0.');
  }

  const isLoan = Boolean(options.loan);
  const creditorName = typeof options.creditor === 'string' ? options.creditor : undefined;

  await system.registerDeposit(user.id, {
    name,
    value,
    isLoan,
    creditorName
  });

  printSuccess(`Depósito registrado para ${user.name}: ${formatMoney(value)}`);
}

async function commandAddDebt(args: string[], options: Record<string, string | boolean>): Promise<void> {
  const user = await requireActiveUser();

  const title = args[0];
  const credor = args[1];

  if (!title || !credor) {
    throw new Error(
      'Uso: financas addDebt <titulo> <credor> [--amount <valor>] [--installments <n>] [--due <YYYY-MM-DD>] [--tags <a,b>]'
    );
  }

  const amount =
    typeof options.amount === 'string'
      ? Number(options.amount.replace(',', '.'))
      : undefined;

  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
    throw new Error('O valor total da dívida deve ser um número maior que 0.');
  }

  const installments =
    typeof options.installments === 'string' ? Number(options.installments) : undefined;

  if (
    installments !== undefined &&
    (!Number.isInteger(installments) || installments < 1)
  ) {
    throw new Error('Parcelas inválidas. Informe um número inteiro maior ou igual a 1.');
  }

  const dueDateInput = typeof options.due === 'string' ? options.due : undefined;
  const dueDate = dueDateInput ? new Date(dueDateInput) : new Date();

  if (Number.isNaN(dueDate.getTime())) {
    throw new Error('Data inválida. Use formato YYYY-MM-DD.');
  }

  const tags =
    typeof options.tags === 'string'
      ? options.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      : [];

  await system.registerDebt(user.id, {
    title,
    credor,
    amount,
    tags,
    dueDate: dueDate.toISOString(),
    totalInstallments: installments
  });

  printSuccess(`Dívida registrada para ${user.name}: ${title}`);
}

async function commandAddExpense(
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  const user = await requireActiveUser();

  const valueText = args[0];
  const description = args[1];

  if (!valueText || !description) {
    throw new Error('Uso: financas addExpense <valor> <descricao> [--tags <a,b>]');
  }

  const value = Number(valueText.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Valor da despesa inválido. Informe um número maior que 0.');
  }

  const tags =
    typeof options.tags === 'string'
      ? options.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      : [];

  await system.register_expense(user.id, {
    value,
    description,
    tags
  });

  printSuccess(`Despesa registrada para ${user.name}: ${formatMoney(value)}`);
}

async function commandListDebts(): Promise<void> {
  const user = await requireActiveUser();
  const debts = await system.listDebts(user.id);

  if (debts.length === 0) {
    printInfo('Nenhuma dívida encontrada para o usuário ativo.');
    return;
  }

  const table = new Table({
    head: [
      chalk.white('ID'),
      chalk.white('Título'),
      chalk.white('Credor'),
      chalk.white('Restante'),
      chalk.white('Parcelas'),
      chalk.white('Status'),
      chalk.white('Vencimento')
    ],
    colWidths: [38, 20, 16, 14, 12, 16, 14],
    wordWrap: true
  });

  debts.forEach((debt: Debt) => {
    const totalInstallments = toNumber(debt.totalInstallments);
    const paidInstallments = toNumber(debt.paidInstallments);
    const hasFixedInstallments = Number.isInteger(totalInstallments) && totalInstallments >= 1;

    table.push([
      debt.id,
      debt.title,
      debt.credor,
      formatMoney(debt.remainingAmount ?? debt.amount ?? 0),
      hasFixedInstallments ? `${paidInstallments}/${totalInstallments}` : `${paidInstallments}/∞`,
      debt.status,
      formatDate(debt.dueDate)
    ]);
  });

  console.log(table.toString());
}

async function commandListDeposits(): Promise<void> {
  const user = await requireActiveUser();
  const deposits = await system.listDeposits(user.id);

  if (deposits.length === 0) {
    printInfo('Nenhum depósito encontrado para o usuário ativo.');
    return;
  }

  const table = new Table({
    head: [
      chalk.white('ID'),
      chalk.white('Descrição'),
      chalk.white('Valor'),
      chalk.white('Empréstimo'),
      chalk.white('Credor'),
      chalk.white('Data')
    ],
    colWidths: [38, 22, 14, 12, 20, 14]
  });

  deposits.forEach((deposit: Deposit) => {
    table.push([
      deposit.id,
      deposit.name,
      formatMoney(deposit.value),
      deposit.isLoan ? 'Sim' : 'Não',
      deposit.creditorName || '-',
      formatDate(deposit.date)
    ]);
  });

  console.log(table.toString());
}

async function commandListExpenses(): Promise<void> {
  const user = await requireActiveUser();
  const expenses = await system.listExpenses(user.id);

  if (expenses.length === 0) {
    printInfo('Nenhuma despesa encontrada para o usuário ativo.');
    return;
  }

  const table = new Table({
    head: [
      chalk.white('ID'),
      chalk.white('Descrição'),
      chalk.white('Valor'),
      chalk.white('Tags'),
      chalk.white('Data')
    ],
    colWidths: [38, 24, 14, 22, 14],
    wordWrap: true
  });

  expenses.forEach((expense: Expense) => {
    table.push([
      expense.id,
      expense.description,
      formatMoney(expense.value),
      expense.tags.length > 0 ? expense.tags.join(', ') : '-',
      formatDate(expense.date)
    ]);
  });

  console.log(table.toString());
}

async function commandPayDebt(debtId?: string, installmentsText?: string, amountText?: string): Promise<void> {
  const user = await requireActiveUser();

  if (!debtId || !installmentsText) {
    throw new Error('Uso: financas payDebt <debtId> <parcelas> [valor]');
  }

  const installments = Number(installmentsText);
  if (!Number.isInteger(installments) || installments < 1) {
    throw new Error('Parcelas inválidas. Informe um inteiro >= 1.');
  }

  const amount =
    amountText === undefined
      ? undefined
      : Number(amountText.replace(',', '.'));

  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
    throw new Error('Valor inválido. Informe um número maior que 0.');
  }

  const result = await system.payDebt(user.id, debtId, amount, installments);
  printSuccess(
    `Pagamento concluído: ${result.paidInstallments}/${result.totalInstallments ?? '∞'} parcelas • restante ${formatMoney(result.remainingAmount ?? 0)}`
  );
}

async function commandDeleteUser(identifier?: string): Promise<void> {
  if (!identifier || !identifier.trim()) {
    throw new Error('Uso: financas deleteUser <nome-ou-id>');
  }

  const user = await resolveUserByNameOrId(identifier);
  await personRepo.delete(user.id);

  const state = await readState();
  if (state.activeUserId === user.id) {
    await writeState({});
  }

  printSuccess(`Usuário removido: ${user.name}`);
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    await commandHelp();
    return;
  }

  const { positional, options } = parseOptions(argv.slice(1));

  Neo4jService.connect();
  try {
    switch (command) {
      case 'createUser':
        await commandCreateUser(positional[0], positional[1]);
        break;
      case 'setUser':
        await commandSetUser(positional[0]);
        break;
      case 'whoami':
        await commandWhoAmI();
        break;
      case 'listUsers':
        await commandListUsers();
        break;
      case 'summary':
        await commandSummary();
        break;
      case 'addDeposit':
        await commandAddDeposit(positional, options);
        break;
      case 'addExpense':
        await commandAddExpense(positional, options);
        break;
      case 'addDebt':
        await commandAddDebt(positional, options);
        break;
      case 'listDebts':
        await commandListDebts();
        break;
      case 'listDeposits':
        await commandListDeposits();
        break;
      case 'listExpenses':
        await commandListExpenses();
        break;
      case 'payDebt':
        await commandPayDebt(positional[0], positional[1], positional[2]);
        break;
      case 'deleteUser':
        await commandDeleteUser(positional[0]);
        break;
      default:
        throw new Error(`Comando inválido: ${command}. Use: financas help`);
    }
  } finally {
    await Neo4jService.close();
  }
}

run().catch((error) => {
  printError(error);
  process.exit(1);
});
