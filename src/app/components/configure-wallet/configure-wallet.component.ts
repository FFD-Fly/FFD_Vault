import { Component, OnInit } from '@angular/core';
import {WalletService} from "../../services/wallet.service";
import {NotificationService} from "../../services/notification.service";
import {ActivatedRoute, Router} from "@angular/router";
import * as bip from 'bip39';
import {LedgerService, LedgerStatus} from "../../services/ledger.service";

@Component({
  selector: 'app-configure-wallet',
  templateUrl: './configure-wallet.component.html',
  styleUrls: ['./configure-wallet.component.css']
})
export class ConfigureWalletComponent implements OnInit {
  wallet = this.walletService.wallet;
  isConfigured = this.walletService.isConfigured;
  activePanel = 0;

  newWalletSeed = '';
  newWalletMnemonic = '';
  newWalletMnemonicLines = [];
  importSeedModel = '';
  importSeedMnemonicModel = '';
  walletPasswordModel = '';
  walletPasswordConfirmModel = '';

  selectedImportOption = 'seed';
  importOptions = [
    { name: 'FFD 种子', value: 'seed' },
    { name: 'FFD 助记词', value: 'mnemonic' },
    { name: 'FFD 钱包 钱包文件', value: 'file' },
    { name: 'Ledger FFD S', value: 'ledger' },
  ];

  ledgerStatus = LedgerStatus;
  ledger = this.ledgerService.ledger;

  constructor(private router: ActivatedRoute, public walletService: WalletService, private notifications: NotificationService, private route: Router, private ledgerService: LedgerService) { }

  async ngOnInit() {
    const toggleImport = this.router.snapshot.queryParams.import;
    if (toggleImport) {
      this.activePanel = 1;
    }

    this.ledgerService.loadLedger(true);
    this.ledgerService.ledgerStatus$.subscribe(newStatus => {
      // this.updateLedgerStatus();
    })
  }

  async importExistingWallet() {
    let importSeed = '';
    if (this.selectedImportOption === 'seed') {
      const existingSeed = this.importSeedModel.trim();
      if (existingSeed.length !== 64) return this.notifications.sendError(`种子无效，请仔细检查!`);
      importSeed = existingSeed;
    } else if (this.selectedImportOption === 'mnemonic') {
      // Clean the value by trimming it and removing newlines
      const mnemonic = this.importSeedMnemonicModel.toLowerCase().trim().replace(/\n/g, ``);

      const words = mnemonic.split(' ');
      if (words.length < 20) return this.notifications.sendError(`助记词太短，请仔细检查!`);

      // Try and decode the mnemonic
      try {
        const newSeed = bip.mnemonicToEntropy(mnemonic);
        if (!newSeed || newSeed.length !== 64) return this.notifications.sendError(`助记符无效，请仔细检查!`);
        importSeed = newSeed.toUpperCase(); // Force uppercase, for consistency
      } catch (err) {
        return this.notifications.sendError(`无法解码助记符，请仔细检查!`);
      }
    } else {
      return this.notifications.sendError(`无效的导入选项`);
    }

    // Now, if a wallet is configured, make sure they confirm an overwrite first
    const confirmed = await this.confirmWalletOverwrite();
    if (!confirmed) return;

    this.notifications.sendInfo(`正在导入现有帐户...`, { identifier: 'importing-loading' });
    await this.walletService.createWalletFromSeed(importSeed);

    this.notifications.removeNotification('importing-loading');

    this.activePanel = 4;
    this.notifications.sendSuccess(`成功导入钱包!`);
  }

  async importLedgerWallet(refreshOnly = false) {
    // Determine status of ledger device using ledger service
    this.notifications.sendInfo(`正在检查 Ledger 设备...`, { identifier: '账本状态', length: 0 });
    await this.ledgerService.loadLedger(true);
    this.notifications.removeNotification('ledger-status');

    if (this.ledger.status === LedgerStatus.NOT_CONNECTED) {
      return this.notifications.sendWarning(`未检测到账本设备，请确保它已连接并且您正在使用 Chrome/Opera`);
    }

    if (this.ledger.status === LedgerStatus.LOCKED) {
      return this.notifications.sendWarning(`解锁您的账本设备并打开 FFD 应用程序以继续`);
    }

    if (refreshOnly) {
      return;
    }

    // If a wallet exists already, make sure they know they are overwriting it
    const confirmed = await this.confirmWalletOverwrite();
    if (!confirmed) {
      return;
    }

    // Create new ledger wallet
    const newWallet = await this.walletService.createLedgerWallet();

    // We skip the password panel
    this.activePanel = 5;
    this.notifications.sendSuccess(`成功加载账本设备!`);

    // If they are using Chrome, warn them.
    if (this.ledgerService.isBrokenBrowser()) {
      this.notifications.sendLedgerChromeWarning();
    }
  }

  // Send a confirmation dialog to the user if they already have a wallet configured
  async confirmWalletOverwrite() {
    if (!this.isConfigured()) return true;

    const UIkit = window['UIkit'];
    try {
      await UIkit.modal.confirm('<p style="text-align: center;"><span style="font-size: 18px;">您即将创建一个新钱包<br>这将 <b>覆盖你现有的钱包</b></span><br><br><b style="font-size: 18px;">在继续之前，请确保您已保存当前的 FFD 种子</b><br><br>没有它 - <b>所有资金将无法收回</b></p>');
      return true;
    } catch (err) {
      this.notifications.sendInfo(`在继续之前使用“管理钱包”页面备份您的 FFD 种子!`);
      return false;
    }
  }

  async createNewWallet() {
    // If a wallet already exists, confirm that the seed is saved
    const confirmed = await this.confirmWalletOverwrite();
    if (!confirmed) return;

    const newSeed = this.walletService.createNewWallet();
    this.newWalletSeed = newSeed;
    this.newWalletMnemonic = bip.entropyToMnemonic(newSeed);

    // Split the seed up so we can show 4 per line
    const words = this.newWalletMnemonic.split(' ');
    const lines = [
      words.slice(0, 4),
      words.slice(4, 8),
      words.slice(8, 12),
      words.slice(12, 16),
      words.slice(16, 20),
      words.slice(20, 24),
    ];
    this.newWalletMnemonicLines = lines;

    this.activePanel = 3;
    this.notifications.sendSuccess(`成功创建新钱包！ 确保写下你的种子!`);
  }

  confirmNewSeed() {
    this.newWalletSeed = '';
    this.newWalletMnemonicLines = [];

    this.activePanel = 4;
  }

  saveWalletPassword() {
    if (this.walletPasswordConfirmModel !== this.walletPasswordModel) {
      return this.notifications.sendError(`密码确认不符，重试!`);
    }
    if (this.walletPasswordModel.length < 1) {
      return this.notifications.sendWarning(`密码不能为空!`);
    }
    const newPassword = this.walletPasswordModel;
    this.walletService.wallet.password = newPassword;

    this.walletService.saveWalletExport();

    this.walletPasswordModel = '';
    this.walletPasswordConfirmModel = '';

    this.activePanel = 5;
    this.notifications.sendSuccess(`成功设置钱包密码!`);
  }

  setPanel(panel) {
    this.activePanel = panel;
  }

  copied() {
    this.notifications.sendSuccess(`钱包种子复制到剪贴板!`);
  }

  importFromFile(files) {
    if (!files.length) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const fileData = event.target['result'];
      try {
        const importData = JSON.parse(fileData);
        if (!importData.seed || !importData.hasOwnProperty('账户索引')) {
          return this.notifications.sendError(`错误的导入数据 `)
        }

        const walletEncrypted = btoa(JSON.stringify(importData));
        this.route.navigate(['import-wallet'], { fragment: walletEncrypted });
      } catch (err) {
        this.notifications.sendError(`无法解析导入数据，请确保您选择了正确的文件!`);
      }
    };

    reader.readAsText(file);
  }

}
