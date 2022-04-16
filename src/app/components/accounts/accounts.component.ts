import { Component, OnInit } from '@angular/core';
import {Subject} from "rxjs/Subject";
import {BehaviorSubject} from "rxjs/BehaviorSubject";
import {Observable} from "rxjs/Observable";
import {timer} from "rxjs/observable/timer";
import {debounce} from "rxjs/operators";
import {
  AppSettingsService,
  LedgerService,
  LedgerStatus,
  ModalService,
  NotificationService,
  RepresentativeService,
  WalletService
} from "../../services";

@Component({
  selector: 'app-accounts',
  templateUrl: './accounts.component.html',
  styleUrls: ['./accounts.component.css']
})
export class AccountsComponent implements OnInit {
  accounts = this.walletService.wallet.accounts;
  isLedgerWallet = this.walletService.isLedgerWallet();
  viewAdvanced = false;
  newAccountIndex = null;

  // When we change the accounts, redetect changable reps (Debounce by 5 seconds)
  accountsChanged$ = new Subject();
  reloadRepWarning$ = this.accountsChanged$.pipe(debounce(() => timer(5000)));

  constructor(
    private walletService: WalletService,
    private notificationService: NotificationService,
    public modal: ModalService,
    public settings: AppSettingsService,
    private representatives: RepresentativeService,
    private ledger: LedgerService) { }

  async ngOnInit() {
    this.reloadRepWarning$.subscribe(a => {
      this.representatives.detectChangeableReps();
    })
  }

  async createAccount() {
    if (this.walletService.isLocked()) {
      return this.notificationService.sendError(`钱包被锁定.`);
    }
    if (!this.walletService.isConfigured()) return this.notificationService.sendError(`钱包未配置`);
    if (this.walletService.wallet.accounts.length >= 20) return this.notificationService.sendWarning(`您一次最多只能跟踪 20 个帐户.`);
    // Advanced view, manual account index?
    let accountIndex = null;
    if (this.viewAdvanced && this.newAccountIndex != null) {
      let index = parseInt(this.newAccountIndex);
      if (index < 0) return this.notificationService.sendWarning(`无效的帐户索引 - 必须是正数`);
      const existingAccount = this.walletService.wallet.accounts.find(a => a.index == index);
      if (existingAccount) {
        return this.notificationService.sendWarning(`此索引处的帐户已加载`);
      }
      accountIndex = index;
    }
    try {
      const newAccount = await this.walletService.addWalletAccount(accountIndex);
      this.notificationService.sendSuccess(`成功创建新账户 ${newAccount.id}`);
      this.newAccountIndex = null;
      this.accountsChanged$.next(newAccount.id);
    } catch (err) {
      this.notificationService.sendError(`无法添加新帐户: ${err.message}`);
    }
  }

  sortAccounts() {
    if (this.walletService.isLocked()) {
      return this.notificationService.sendError(`钱包被锁定.`);
    }
    if (!this.walletService.isConfigured()) return this.notificationService.sendError(`钱包未配置`);
    if (this.walletService.wallet.accounts.length <= 1) return this.notificationService.sendWarning(`您至少需要 2 个帐户才能对它们进行排序`);
    this.walletService.wallet.accounts = this.walletService.wallet.accounts.sort((a, b) => a.index - b.index);
    // this.accounts = this.walletService.wallet.accounts;
    this.walletService.saveWalletExport(); // Save new sorted accounts list
    this.notificationService.sendSuccess(`已成功按索引对帐户进行排序!`);
  }

  copied() {
    this.notificationService.sendSuccess(`已成功复制到剪贴板！`);
  }

  async deleteAccount(account) {
    if (this.walletService.walletIsLocked()) {
      return this.notificationService.sendWarning(`钱包必须解锁.`);
    }
    try {
      await this.walletService.removeWalletAccount(account.id);
      this.notificationService.sendSuccess(`已成功移除帐号 ${account.id}`);
      this.accountsChanged$.next(account.id);
    } catch (err) {
      this.notificationService.sendError(`无法删除帐户: ${err.message}`);
    }
  }

  async showLedgerAddress(account) {
    if (this.ledger.ledger.status !== LedgerStatus.READY) {
      return this.notificationService.sendWarning(`账本设备必须准备好`);
    }
    this.notificationService.sendInfo(`正在确认 Ledger 设备上的帐户地址...`, { identifier: '分类帐', length: 0 });
    try {
      await this.ledger.getLedgerAccount(account.index, true);
      this.notificationService.sendSuccess(`在 Ledger 上确认的帐户地址`);
    } catch (err) {
      this.notificationService.sendError(`帐户地址被拒绝 - 如果错误，请不要使用钱包!`);
    }
    this.notificationService.removeNotification('分类帐');
  }

}
