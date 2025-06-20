import { Injectable } from '@nestjs/common';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';

@Injectable()
export class ReportsService {
  private states = {
    accounts: 'idle',
    yearly: 'idle',
    fs: 'idle',
  };
  private files: Promise<string[]> = readdir('tmp')

  state(scope: string) {
    return this.states[scope];
  }

  async accounts() {
    this.states.accounts = 'starting';
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/accounts.csv';
    const accountBalances: Record<string, number> = {};

    try {
      const files = await this.files;
      const fileContents =await Promise.all(files.map(file => readFile(path.join(tmpDir, file), 'utf-8')));
      
      for (const fileContent of fileContents) {
        const lines = fileContent.trim().split('\n');
        const numOfLines = lines.length;
        
        for (let i = 0; i < numOfLines; i++) {
          const [, account, , debit, credit] = lines[i].split(',');
          if (!accountBalances[account]) {
            accountBalances[account] = 0;
          }
          let floatDebit = 0;
          let floatCredit = 0;
          if (debit) floatDebit = parseFloat(debit);
          if (credit) floatCredit = parseFloat(credit);

          accountBalances[account] += (floatDebit - floatCredit);
        }
      }
      const entries = Object.entries(accountBalances)
      const numOfEntries = entries.length;
      let output: string[] = Array(numOfEntries + 1);
      output[0] = 'Account,Balance';

      for (let i = 1; i < numOfEntries; i++) {
        const [account, balance] = entries[i];
        output[i] = `${account},${balance.toFixed(2)}`;
      }
      await writeFile(outputFile, output.join('\n'));
      this.states.accounts = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
    } catch (error) {
      this.states.accounts = 'error';
    }
  }

  async yearly() {
    this.states.yearly = 'starting';
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/yearly.csv';
    const cashByYear: Record<string, number> = {};

    try {
      const files = await this.files;
      const fileContents = await Promise.all(files.map(file => readFile(path.join(tmpDir, file), 'utf-8')));

      for (const content of fileContents) {
        const lines = content.trim().split('\n');
        const numOfLines = lines.length;

        for (let i = 0; i < numOfLines; i++) {
          const [date, account, , debit, credit] = lines[i].split(',');
          if (account === 'Cash') {
            const year = new Date(date).getFullYear();
            if (!cashByYear[year]) {
              cashByYear[year] = 0;
            }
            let floatDebit = 0;
            let floatCredit = 0;
            if (debit) floatDebit = parseFloat(debit);
            if (credit) floatCredit = parseFloat(credit);

            cashByYear[year] += floatDebit - floatCredit;
          }
        }
      }
      const output = ['Financial Year,Cash Balance'];
      Object.keys(cashByYear)
        .sort()
        .forEach((year) => {
          output.push(`${year},${cashByYear[year].toFixed(2)}`);
        });
      await writeFile(outputFile, output.join('\n'));
      this.states.yearly = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
    } catch (error) {
      this.states.yearly = 'error';
    }
  }

  async fs() {
    this.states.fs = 'starting';
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/fs.csv';
    const categories = {
      'Income Statement': {
        Revenues: ['Sales Revenue'],
        Expenses: [
          'Cost of Goods Sold',
          'Salaries Expense',
          'Rent Expense',
          'Utilities Expense',
          'Interest Expense',
          'Tax Expense',
        ],
      },
      'Balance Sheet': {
        Assets: [
          'Cash',
          'Accounts Receivable',
          'Inventory',
          'Fixed Assets',
          'Prepaid Expenses',
        ],
        Liabilities: [
          'Accounts Payable',
          'Loan Payable',
          'Sales Tax Payable',
          'Accrued Liabilities',
          'Unearned Revenue',
          'Dividends Payable',
        ],
        Equity: ['Common Stock', 'Retained Earnings'],
      },
    };
    const balances: Record<string, number> = {};
    
    try {
      for (const section of Object.values(categories)) {
        for (const group of Object.values(section)) {
          for (const account of group) {
            balances[account] = 0;
          }
        }
      }
      const files = (await this.files).filter(file => file.endsWith('.csv') && file !== 'yearly.csv');
      const fileContents = await Promise.all(files.map(file => readFile(path.join(tmpDir, file), 'utf-8')));
      
      fileContents.forEach(content => {
        const lines = content.trim().split('\n');
        const len = lines.length;
  
        for (let i = 0; i < len; i++) {
          const [, account, , debit, credit] = lines[i].split(',');

          if (balances.hasOwnProperty(account)) {
            let floatDebit = 0;
            let floatCredit = 0;
            if (debit) floatDebit = parseFloat(debit);
            if (credit) floatCredit = parseFloat(credit);
            balances[account] += floatDebit - floatCredit;
          }
        }
      });
  
      const output: string[] = [];
      output.push('Basic Financial Statement');
      output.push('');
      output.push('Income Statement');
      let totalRevenue = 0;
      let totalExpenses = 0;
      for (const account of categories['Income Statement']['Revenues']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalRevenue += value;
      }
      for (const account of categories['Income Statement']['Expenses']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalExpenses += value;
      }
      output.push(`Net Income,${(totalRevenue - totalExpenses).toFixed(2)}`);
      output.push('');
      output.push('Balance Sheet');
      let totalAssets = 0;
      let totalLiabilities = 0;
      let totalEquity = 0;
      output.push('Assets');
      for (const account of categories['Balance Sheet']['Assets']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalAssets += value;
      }
      output.push(`Total Assets,${totalAssets.toFixed(2)}`);
      output.push('');
      output.push('Liabilities');
      for (const account of categories['Balance Sheet']['Liabilities']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalLiabilities += value;
      }
      output.push(`Total Liabilities,${totalLiabilities.toFixed(2)}`);
      output.push('');
      output.push('Equity');
      for (const account of categories['Balance Sheet']['Equity']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalEquity += value;
      }
      output.push(
        `Retained Earnings (Net Income),${(totalRevenue - totalExpenses).toFixed(2)}`,
      );
      totalEquity += totalRevenue - totalExpenses;
      output.push(`Total Equity,${totalEquity.toFixed(2)}`);
      output.push('');
      output.push(
        `Assets = Liabilities + Equity, ${totalAssets.toFixed(2)} = ${(totalLiabilities + totalEquity).toFixed(2)}`,
      );
      await writeFile(outputFile, output.join('\n'));
      this.states.fs = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
    } catch (error) {
      this.states.fs = 'error';
    }
  }
}
