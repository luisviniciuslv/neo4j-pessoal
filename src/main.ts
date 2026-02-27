import 'dotenv/config';
import inquirer from 'inquirer';
import chalk from 'chalk';
import Table from 'cli-table3';
import { randomUUID } from 'crypto';

import Neo4jService from './service/drivers/neo4jDriver';
import SystemService from './service/system.service';
import { Person } from './models/Person.model';
import { Debt, DebtStatus } from './models/Debit.model';
import { Deposit } from './models/Deposit.model';
import { PersonRepository } from './repository/entities/person.entity';

const system = new SystemService();
const personRepo = new PersonRepository();

let activeUserId: string | null = null;

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

function formatOptionalMoney(value: unknown): string {
  if (value === undefined || value === null) {
    return 'Indefinido';
  }
  return formatMoney(value);
}

function formatDate(value: string | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

function printHeader(): void {
  console.clear();
  console.log(chalk.blueBright('╔══════════════════════════════════════════════╗'));
  console.log(chalk.blueBright('║') + chalk.bold.white('         FINANÇAS PESSOAIS • NEO4J CLI         ') + chalk.blueBright('║'));
  console.log(chalk.blueBright('╚══════════════════════════════════════════════╝'));
  console.log(chalk.gray('Controle de usuários, depósitos, dívidas e pagamentos\n'));
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

function requireActiveUser(): string {
  if (!activeUserId) {
    throw new Error('Nenhum usuário ativo selecionado.');
  }
  return activeUserId;
}

async function listUsers(showTitle: boolean = true): Promise<Person[]> {
  const users = await personRepo.list();

  if (showTitle) {
    console.log(chalk.bold('\n👥 Usuários cadastrados'));
  }

  if (users.length === 0) {
    printInfo('Nenhum usuário cadastrado.');
    return users;
  }

  const table = new Table({
    head: [chalk.white('Ativo'), chalk.white('Nome'), chalk.white('Saldo'), chalk.white('ID')],
    wordWrap: true,
    colWidths: [8, 22, 16, 40]
  });

  users.forEach((user) => {
    table.push([
      user.id === activeUserId ? chalk.green('●') : chalk.gray('○'),
      user.name,
      formatMoney(user.money),
      user.id
    ]);
  });

  console.log(table.toString());
  return users;
}

async function createUser(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Nome do usuário:',
      validate: (value: string) =>
        value.trim().length > 0 ? true : 'Informe um nome válido.'
    },
    {
      type: 'number',
      name: 'money',
      message: 'Saldo inicial (R$):',
      default: 0,
      validate: (value: number) =>
        Number.isFinite(value) && value >= 0
          ? true
          : 'Informe um saldo inicial maior ou igual a 0.'
    }
  ]);

  const id = randomUUID();
  await personRepo.create({
    id,
    name: answers.name.trim(),
    money: answers.money
  });

  activeUserId = id;
  printSuccess(`Usuário criado e definido como ativo: ${answers.name.trim()}`);
}

async function selectActiveUser(): Promise<void> {
  const users = await personRepo.list();
  if (users.length === 0) {
    printInfo('Nenhum usuário disponível para seleção.');
    return;
  }

  const { userId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'userId',
      message: 'Selecione o usuário ativo:',
      choices: users.map((user) => ({
        name: `${user.name} • ${formatMoney(user.money)} • ${user.id}`,
        value: user.id
      }))
    }
  ]);

  activeUserId = userId;
  const selected = users.find((user) => user.id === userId);
  printSuccess(`Usuário ativo: ${selected?.name}`);
}

async function showActiveUserSummary(): Promise<void> {
  const userId = requireActiveUser();
  const [user, debts, deposits] = await Promise.all([
    personRepo.findById(userId),
    system.listDebts(userId),
    system.listDeposits(userId)
  ]);

  if (!user) {
    activeUserId = null;
    throw new Error('Usuário ativo não foi encontrado. Selecione novamente.');
  }

  const pendingDebts = debts.filter((debt) => debt.status !== 'paid');
  const totalDebt = debts.reduce(
    (sum, debt) => sum + toNumber(debt.remainingAmount),
    0
  );
  const totalDeposits = deposits.reduce((sum, dep) => sum + toNumber(dep.value), 0);

  console.log(chalk.bold('\n📊 Resumo do usuário ativo'));
  console.log(chalk.white(`Nome: ${user.name}`));
  console.log(chalk.white(`ID: ${user.id}`));
  console.log(chalk.white(`Saldo atual: ${formatMoney(user.money)}`));
  console.log(chalk.white(`Depósitos registrados: ${deposits.length} (${formatMoney(totalDeposits)})`));
  console.log(chalk.white(`Dívidas pendentes: ${pendingDebts.length} (${formatMoney(totalDebt)})`));
}

async function registerDeposit(): Promise<void> {
  const userId = requireActiveUser();
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Descrição do depósito:',
      validate: (value: string) =>
        value.trim().length > 0 ? true : 'Informe uma descrição válida.'
    },
    {
      type: 'number',
      name: 'value',
      message: 'Valor (R$):',
      validate: (value: number) =>
        Number.isFinite(value) && value > 0 ? true : 'Informe um valor maior que 0.'
    },
    {
      type: 'confirm',
      name: 'isLoan',
      message: 'Esse depósito é um empréstimo?',
      default: false
    },
    {
      type: 'input',
      name: 'creditorName',
      message: 'Nome do credor:',
      when: (answersMap: { isLoan: boolean }) => answersMap.isLoan,
      validate: (value: string) =>
        value.trim().length > 0 ? true : 'Informe o nome do credor.'
    }
  ]);

  await system.registerDeposit(userId, {
    name: answers.name.trim(),
    value: answers.value,
    isLoan: answers.isLoan,
    creditorName: answers.creditorName
  });

  printSuccess(`Depósito registrado: ${formatMoney(answers.value)}`);
}

async function registerDebt(): Promise<void> {
  const userId = requireActiveUser();
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'title',
      message: 'Título da dívida:',
      validate: (value: string) =>
        value.trim().length > 0 ? true : 'Informe um título válido.'
    },
    {
      type: 'input',
      name: 'credor',
      message: 'Credor:',
      validate: (value: string) =>
        value.trim().length > 0 ? true : 'Informe um credor válido.'
    },
    {
      type: 'confirm',
      name: 'indefiniteAmount',
      message: 'Valor total da dívida é indefinido?',
      default: false
    },
    {
      type: 'number',
      name: 'amount',
      message: 'Valor total da dívida (R$):',
      when: (answersMap: { indefiniteAmount: boolean }) =>
        !answersMap.indefiniteAmount,
      validate: (value: number) =>
        Number.isFinite(value) && value > 0 ? true : 'Informe um valor maior que 0.'
    },
    {
      type: 'confirm',
      name: 'indefiniteInstallments',
      message: 'Número de parcelas é indefinido?',
      default: false
    },
    {
      type: 'number',
      name: 'totalInstallments',
      message: 'Quantidade de parcelas:',
      default: 1,
      when: (answersMap: { indefiniteInstallments: boolean }) =>
        !answersMap.indefiniteInstallments,
      validate: (value: number) =>
        Number.isInteger(value) && value >= 1
          ? true
          : 'Informe um número inteiro maior ou igual a 1.'
    },
    {
      type: 'input',
      name: 'tagsText',
      message: 'Tags (separadas por vírgula):',
      default: ''
    },
    {
      type: 'input',
      name: 'dueDate',
      message: 'Data de vencimento (YYYY-MM-DD):',
      default: new Date().toISOString().slice(0, 10),
      validate: (value: string) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime())
          ? 'Informe uma data válida no formato YYYY-MM-DD.'
          : true;
      }
    },
    {
      type: 'list',
      name: 'status',
      message: 'Status inicial da dívida:',
      default: 'pending',
      choices: [
        { name: 'Pendente', value: 'pending' },
        { name: 'Parcialmente paga', value: 'partially_paid' },
        { name: 'Paga', value: 'paid' }
      ]
    }
  ]);

  const tags = String(answers.tagsText)
    .split(',')
    .map((tag: string) => tag.trim())
    .filter((tag: string) => tag.length > 0);

  await system.registerDebt(userId, {
    title: answers.title.trim(),
    credor: answers.credor.trim(),
    amount: answers.indefiniteAmount ? undefined : answers.amount,
    status: answers.status as DebtStatus,
    tags,
    dueDate: new Date(answers.dueDate).toISOString(),
    totalInstallments: answers.indefiniteInstallments
      ? undefined
      : answers.totalInstallments
  });

  printSuccess('Dívida registrada com sucesso.');
}

async function listDeposits(): Promise<Deposit[]> {
  const userId = requireActiveUser();
  const deposits = await system.listDeposits(userId);

  console.log(chalk.bold('\n📥 Histórico de depósitos'));
  if (deposits.length === 0) {
    printInfo('Nenhum depósito encontrado para o usuário ativo.');
    return deposits;
  }

  const table = new Table({
    head: [
      chalk.white('#'),
      chalk.white('Descrição'),
      chalk.white('Valor'),
      chalk.white('Empréstimo'),
      chalk.white('Credor'),
      chalk.white('Data')
    ],
    colWidths: [5, 24, 16, 12, 22, 14]
  });

  deposits.forEach((deposit, index) => {
    table.push([
      index + 1,
      deposit.name,
      formatMoney(deposit.value),
      deposit.isLoan ? 'Sim' : 'Não',
      deposit.creditorName || '-',
      formatDate(deposit.date)
    ]);
  });

  console.log(table.toString());
  return deposits;
}

function debtStatusLabel(status: DebtStatus): string {
  if (status === 'paid') return chalk.green('Paga');
  if (status === 'partially_paid') return chalk.yellow('Parcial');
  return chalk.red('Pendente');
}

function calculateExpectedFixedInstallmentAmount(
  debt: Debt,
  installmentsToPay: number
): number {
  const totalInstallments = toNumber(debt.totalInstallments);
  const paidInstallments = toNumber(debt.paidInstallments);
  const remainingAmount = toNumber(debt.remainingAmount);
  const baseInstallmentAmount =
    toNumber(debt.installmentAmount) ||
    Number((toNumber(debt.amount) / totalInstallments).toFixed(2));

  let expected = 0;
  for (let index = 1; index <= installmentsToPay; index++) {
    const isLastInstallment = paidInstallments + index >= totalInstallments;
    expected += isLastInstallment
      ? Number((remainingAmount - expected).toFixed(2))
      : baseInstallmentAmount;
  }

  return Number(expected.toFixed(2));
}

function hasKnownRemainingAmount(debt: Debt): boolean {
  return (
    typeof debt.remainingAmount === 'number' &&
    Number.isFinite(debt.remainingAmount) &&
    debt.remainingAmount >= 0
  );
}

async function listDebts(): Promise<Debt[]> {
  const userId = requireActiveUser();
  const debts = await system.listDebts(userId);

  console.log(chalk.bold('\n🧾 Dívidas do usuário ativo'));
  if (debts.length === 0) {
    printInfo('Nenhuma dívida encontrada para o usuário ativo.');
    return debts;
  }

  const table = new Table({
    head: [
      chalk.white('#'),
      chalk.white('Título'),
      chalk.white('Credor'),
      chalk.white('Total'),
      chalk.white('Restante'),
      chalk.white('Parcelas'),
      chalk.white('Status'),
      chalk.white('Vencimento')
    ],
    colWidths: [5, 22, 18, 13, 13, 13, 12, 14],
    wordWrap: true
  });

  debts.forEach((debt, index) => {
    const hasFixedInstallments =
      Number.isInteger(toNumber(debt.totalInstallments)) &&
      toNumber(debt.totalInstallments) >= 1;

    table.push([
      index + 1,
      debt.title,
      debt.credor,
      formatOptionalMoney(debt.amount),
      formatOptionalMoney(debt.remainingAmount),
      hasFixedInstallments
        ? `${toNumber(debt.paidInstallments)}/${toNumber(debt.totalInstallments)}`
        : `${toNumber(debt.paidInstallments)}/∞`,
      debtStatusLabel(debt.status),
      formatDate(debt.dueDate)
    ]);
  });

  console.log(table.toString());
  return debts;
}

async function payDebt(): Promise<void> {
  const userId = requireActiveUser();
  const debts = await system.listDebts(userId);
  const payableDebts = debts.filter((debt) => debt.status !== 'paid');

  if (payableDebts.length === 0) {
    printInfo('Não há dívidas em aberto para pagamento.');
    return;
  }

  const { debtId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'debtId',
      message: 'Selecione a dívida para pagar:',
      choices: payableDebts.map((debt) => {
        const hasFixedInstallments =
          Number.isInteger(toNumber(debt.totalInstallments)) &&
          toNumber(debt.totalInstallments) >= 1;
        const remainingInstallments = hasFixedInstallments
          ? toNumber(debt.totalInstallments) - toNumber(debt.paidInstallments)
          : null;

        return {
          name: `${debt.title} • restante ${formatOptionalMoney(debt.remainingAmount)} • ${
            remainingInstallments === null
              ? 'parcelas indefinidas'
              : `${remainingInstallments} parcela(s)`
          }`,
          value: debt.id
        };
      })
    }
  ]);

  const selectedDebt = payableDebts.find((item) => item.id === debtId);
  if (!selectedDebt) {
    throw new Error('Dívida selecionada não encontrada.');
  }

  const hasFixedInstallments =
    Number.isInteger(toNumber(selectedDebt.totalInstallments)) &&
    toNumber(selectedDebt.totalInstallments) >= 1;
  const maxInstallments = hasFixedInstallments
    ? toNumber(selectedDebt.totalInstallments) - toNumber(selectedDebt.paidInstallments)
    : null;

  const { installmentsToPay } = await inquirer.prompt([
    {
      type: 'number',
      name: 'installmentsToPay',
      message:
        maxInstallments === null
          ? 'Quantas parcelas deseja registrar neste pagamento?'
          : `Quantas parcelas deseja pagar agora? (máx. ${maxInstallments})`,
      default: 1,
      validate: (value: number) =>
        Number.isInteger(value) &&
        value >= 1 &&
        (maxInstallments === null || value <= maxInstallments)
          ? true
          : maxInstallments === null
            ? 'Informe um valor inteiro maior ou igual a 1.'
            : `Informe um valor inteiro entre 1 e ${maxInstallments}.`
    }
  ]);

  const hasRemainingAmount = hasKnownRemainingAmount(selectedDebt);
  const expectedAmount = hasFixedInstallments && hasRemainingAmount
    ? calculateExpectedFixedInstallmentAmount(selectedDebt, installmentsToPay)
    : null;

  const { amountText } = await inquirer.prompt([
    {
      type: 'input',
      name: 'amountText',
      message:
        expectedAmount === null
          ? 'Valor a pagar agora (R$):'
          : `Valor a pagar agora (R$) [ENTER para sugerido ${formatMoney(expectedAmount)}]:`,
      validate: (value: string) => {
        const trimmed = value.trim();
        if (trimmed.length === 0 && expectedAmount !== null) {
          return true;
        }

        const parsed = Number(trimmed.replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return 'Informe um valor numérico maior que 0.';
        }

        if (hasRemainingAmount && parsed > toNumber(selectedDebt.remainingAmount)) {
          return 'O valor não pode ser maior que o saldo restante da dívida.';
        }

        return true;
      }
    }
  ]);

  const trimmedAmount = String(amountText).trim();
  const parsedAmount =
    trimmedAmount.length === 0 ? undefined : Number(trimmedAmount.replace(',', '.'));

  const result = await system.payDebt(userId, debtId, parsedAmount, installmentsToPay);

  const installmentsProgress = result.totalInstallments
    ? `${result.paidInstallments}/${result.totalInstallments} parcelas`
    : `${result.paidInstallments} parcela(s) registradas`;

  printSuccess(
    `Pagamento concluído (${installmentsProgress}). Restante: ${formatOptionalMoney(result.remainingAmount)}`
  );
}

async function deleteUser(): Promise<void> {
  const users = await personRepo.list();
  if (users.length === 0) {
    printInfo('Não há usuários para remover.');
    return;
  }

  const { userId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'userId',
      message: 'Selecione o usuário que será removido:',
      choices: users.map((user) => ({
        name: `${user.name} • ${formatMoney(user.money)} • ${user.id}`,
        value: user.id
      }))
    }
  ]);

  const selected = users.find((item) => item.id === userId);
  const { confirmDelete } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmDelete',
      message: `Confirmar remoção de ${selected?.name}? Esta ação também remove dívidas e depósitos relacionados.`,
      default: false
    }
  ]);

  if (!confirmDelete) {
    printInfo('Remoção cancelada.');
    return;
  }

  await personRepo.delete(userId);
  if (activeUserId === userId) {
    activeUserId = null;
  }
  printSuccess('Usuário removido com sucesso.');
}

type MainAction =
  | 'create-user'
  | 'select-user'
  | 'list-users'
  | 'summary'
  | 'add-deposit'
  | 'add-debt'
  | 'list-deposits'
  | 'list-debts'
  | 'pay-debt'
  | 'delete-user'
  | 'exit';

const MAIN_ACTION_OPTIONS: Array<{
  shortcut: string;
  name: string;
  value: MainAction;
}> = [
  { shortcut: '1', name: '👤 Criar usuário', value: 'create-user' },
  { shortcut: '2', name: '🎯 Selecionar usuário ativo', value: 'select-user' },
  { shortcut: '3', name: '👥 Listar usuários', value: 'list-users' },
  { shortcut: '4', name: '📊 Ver resumo do usuário ativo', value: 'summary' },
  { shortcut: '5', name: '💰 Registrar depósito', value: 'add-deposit' },
  { shortcut: '6', name: '🧾 Registrar dívida', value: 'add-debt' },
  { shortcut: '7', name: '📥 Listar depósitos', value: 'list-deposits' },
  { shortcut: '8', name: '📋 Listar dívidas', value: 'list-debts' },
  { shortcut: '9', name: '💳 Pagar parcelas de dívida', value: 'pay-debt' },
  { shortcut: '10', name: '🗑️  Remover usuário', value: 'delete-user' },
  { shortcut: '11', name: '🚪 Sair', value: 'exit' }
];

async function askMainAction(): Promise<string> {
  const { shortcut } = await inquirer.prompt([
    {
      type: 'input',
      name: 'shortcut',
      message: 'Atalho rápido (1-11) ou ENTER para abrir o menu:',
      filter: (value: string) => value.trim()
    }
  ]);

  if (shortcut.length > 0) {
    const selectedByShortcut = MAIN_ACTION_OPTIONS.find(
      (option) => option.shortcut === shortcut
    );

    if (selectedByShortcut) {
      return selectedByShortcut.value;
    }

    printInfo('Atalho inválido. Abrindo menu completo...');
  }

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Escolha uma ação:',
      pageSize: 12,
      choices: MAIN_ACTION_OPTIONS.map((option) => ({
        name: `[${option.shortcut}] ${option.name}`,
        value: option.value
      }))
    }
  ]);

  return action;
}

async function runAction(action: string): Promise<boolean> {
  try {
    switch (action) {
      case 'create-user':
        await createUser();
        break;
      case 'select-user':
        await selectActiveUser();
        break;
      case 'list-users':
        await listUsers();
        break;
      case 'summary':
        await showActiveUserSummary();
        break;
      case 'add-deposit':
        await registerDeposit();
        break;
      case 'add-debt':
        await registerDebt();
        break;
      case 'list-deposits':
        await listDeposits();
        break;
      case 'list-debts':
        await listDebts();
        break;
      case 'pay-debt':
        await payDebt();
        break;
      case 'delete-user':
        await deleteUser();
        break;
      case 'exit':
        return false;
      default:
        printInfo('Ação inválida.');
        break;
    }
  } catch (error) {
    printError(error);
  }

  return true;
}

async function pause(): Promise<void> {
  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: 'Pressione ENTER para continuar...'
    }
  ]);
}

async function boot(): Promise<void> {
  Neo4jService.connect();

  try {
    let running = true;

    while (running) {
      printHeader();
      const currentUser = activeUserId ? await personRepo.findById(activeUserId) : null;
      console.log(
        chalk.white(
          `Usuário ativo: ${
            currentUser
              ? `${currentUser.name} (${formatMoney(currentUser.money)})`
              : 'nenhum'
          }\n`
        )
      );

      const action = await askMainAction();
      running = await runAction(action);

      if (running) {
        console.log('');
        await pause();
      }
    }

    printSuccess('Sessão finalizada. Até logo!');
  } finally {
    await Neo4jService.close();
  }
}

boot().catch((error) => {
  printError(error);
  process.exit(1);
});
