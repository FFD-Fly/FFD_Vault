import {Component, OnInit, ViewChild} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {ActivatedRoute} from "@angular/router";

import BigNumber from "bignumber.js";
import {BehaviorSubject} from "rxjs/BehaviorSubject";

import {
  ApiService,
  AppSettingsService,
  FullRepresentativeOverview,
  NanoBlockService,
  NotificationService,
  RepresentativeService,
  UtilService,
  WalletService
} from "../../services";

@Component({
  selector: 'app-representatives',
  templateUrl: './representatives.component.html',
  styleUrls: ['./representatives.component.css']
})
export class RepresentativesComponent implements OnInit {
  @ViewChild('repInput') repInput;

  changeAccountID: any = null;
  toRepresentativeID: string = '';

  representativeResults$ = new BehaviorSubject([]);
  showRepresentatives = false;
  representativeListMatch = '';

  representativeOverview = [];
  changingRepresentatives = false;

  selectedAccounts = [];
  fullAccounts = [];

  recommendedReps = [];
  recommendedRepsPaginated = [];
  recommendedRepsLoading = false;
  selectedRecommendedRep = null;
  showRecommendedReps = false;

  repsPerPage = 5;
  currentRepPage = 0;

  hideOverview = false;

  constructor(
    private router: ActivatedRoute,
    public wallet: WalletService,
    private api: ApiService,
    private notifications: NotificationService,
    private nanoBlock: NanoBlockService,
    private util: UtilService,
    private http: HttpClient,
    private representativeService: RepresentativeService,
    public settings: AppSettingsService) { }

  async ngOnInit() {
    this.representativeService.loadRepresentativeList();

    // Listen for query parameters that set defaults
    this.router.queryParams.subscribe(params => {
      this.hideOverview = params && params.hideOverview;
      this.showRecommendedReps = params && params.showRecommended;

      if (params && params.accounts) {
        this.selectedAccounts = []; // Reset the preselected accounts
        const accounts = params.accounts.split(',');
        for (let account of accounts) {
          this.newAccountID(account);
        }
      }
    });

    let repOverview = await this.representativeService.getRepresentativesOverview();
    // Sort by weight delegated
    repOverview = repOverview.sort((a: FullRepresentativeOverview, b: FullRepresentativeOverview) => b.delegatedWeight.toNumber() - a.delegatedWeight.toNumber());
    this.representativeOverview = repOverview;
    repOverview.forEach(o => this.fullAccounts.push(...o.accounts));

    await this.loadRecommendedReps();
  }

  addSelectedAccounts(accounts) {
    for (let account of accounts) {
      this.newAccountID(account.id);
    }

    // Scroll to the representative input
    setTimeout(() => this.repInput.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  newAccountID(accountID) {
    const newAccount = accountID || this.changeAccountID;
    if (!newAccount) return; // Didn't select anything

    const existingAccount = this.selectedAccounts.find(a => a.id === newAccount);
    if (existingAccount) return; // Already selected

    const allExists = this.selectedAccounts.find(a => a.id === 'All Accounts');
    if (newAccount === 'all' && !allExists) {
      this.selectedAccounts = []; // Reset the list before adding all
    }
    if (newAccount !== 'all' && allExists) {
      this.selectedAccounts.splice(this.selectedAccounts.indexOf(allExists), 1); // Remove all from the list
    }

    if (newAccount === 'all') {
      this.selectedAccounts.push({ id: 'All Accounts' });
    } else {
      const walletAccount = this.wallet.getWalletAccount(newAccount);
      this.selectedAccounts.push(walletAccount);
    }

    setTimeout(() => this.changeAccountID = null, 10);
  }

  removeSelectedAccount(account) {
    this.selectedAccounts.splice(this.selectedAccounts.indexOf(account), 1); // Remove all from the list
  }

  searchRepresentatives() {
    this.showRepresentatives = true;
    const search = this.toRepresentativeID || '';
    const representatives = this.representativeService.getSortedRepresentatives();

    const matches = representatives
      .filter(a => a.name.toLowerCase().indexOf(search.toLowerCase()) !== -1)
      .slice(0, 5);

    this.representativeResults$.next(matches);
  }

  selectRepresentative(rep) {
    this.showRepresentatives = false;
    this.toRepresentativeID = rep;
    this.searchRepresentatives();
    this.validateRepresentative();
  }

  validateRepresentative() {
    setTimeout(() => this.showRepresentatives = false, 400);
    this.toRepresentativeID = this.toRepresentativeID.replace(/ /g, '');
    const rep = this.representativeService.getRepresentative(this.toRepresentativeID);

    if (rep) {
      this.representativeListMatch = rep.name;
    } else {
      this.representativeListMatch = '';
    }
  }

  async loadRecommendedReps() {
    this.recommendedRepsLoading = true;
    try {
      const scores = await this.api.recommendedReps() as any[];
      const totalSupply = new BigNumber(133248289);

      const reps = scores.map(rep => {
        const nanoWeight = this.util.nano.rawToMnano(rep.votingweight.toString() || 0);
        const percent = nanoWeight.div(totalSupply).times(100);

        // rep.weight = nanoWeight.toString(10);
        rep.weight = this.util.nano.mnanoToRaw(nanoWeight);
        rep.percent = percent.toFixed(3);

        return rep;
      });

      this.recommendedReps = reps;

      this.calculatePage();
      this.recommendedRepsLoading = false;
    } catch (err) {
      this.recommendedRepsLoading = null;
    }

  }

  previousReps() {
    if (this.currentRepPage > 0) {
      this.currentRepPage--;
      this.calculatePage();
    }
  }
  nextReps() {
    if (this.currentRepPage < (this.recommendedReps.length / this.repsPerPage) - 1) {
      this.currentRepPage++;
    } else {
      this.currentRepPage = 0;
    }
    this.calculatePage();
  }

  calculatePage() {
    this.recommendedRepsPaginated = this.recommendedReps.slice((this.currentRepPage * this.repsPerPage), (this.currentRepPage * this.repsPerPage) + this.repsPerPage);
  }

  selectRecommendedRep(rep) {
    this.selectedRecommendedRep = rep;
    this.toRepresentativeID = rep.account;
    this.showRecommendedReps = false;
    this.representativeListMatch = rep.alias; // We will save if they use this, so this is a nice little helper
  }

  async changeRepresentatives() {
    const accounts = this.selectedAccounts;
    const newRep = this.toRepresentativeID;

    if (this.changingRepresentatives) return; // Already running
    if (this.wallet.walletIsLocked()) return this.notifications.sendWarning(`钱包必须解锁`);
    if (!accounts || !accounts.length) return this.notifications.sendWarning(`您必须至少选择一个帐户才能更改`);

    this.changingRepresentatives = true;

    const valid = await this.api.validateAccountNumber(newRep);
    if (!valid || valid.valid !== '1') {
      this.changingRepresentatives = false;
      return this.notifications.sendWarning(`代表不是有效帐户`);
    }

    const allAccounts = accounts.find(a => a.id === 'All Accounts');
    const accountsToChange = allAccounts ? this.wallet.wallet.accounts : accounts;

    // Remove any that don't need their represetatives to be changed
    const accountsNeedingChange = accountsToChange.filter(account => {
      const accountInfo = this.fullAccounts.find(a => a.id === account.id);
      if (!accountInfo || accountInfo.error) return false; // Cant find info, update the account

      if (accountInfo.representative.toLowerCase() === newRep.toLowerCase()) {
        return false; // This account already has this representative, reject it
      }

      return true;
    });

    if (!accountsNeedingChange.length) {
      this.changingRepresentatives = false;
      return this.notifications.sendInfo(`所选帐户均无需更新`);
    }

    // Now loop and change them
    for (let account of accountsNeedingChange) {
      const walletAccount = this.wallet.getWalletAccount(account.id);
      if (!walletAccount) continue; // Unable to find account in the wallet? wat?

      try {
        const changed = await this.nanoBlock.generateChange(walletAccount, newRep, this.wallet.isLedgerWallet());
        if (!changed) {
          this.notifications.sendError(`更改代表时出错 ${account.id}, 请再试一次`);
        }
      } catch (err) {
        this.notifications.sendError(err.message);
      }
    }

    // Determine if a recommended rep was selected, if so we save an entry in the rep list
    if (this.selectedRecommendedRep && this.selectedRecommendedRep.account && this.selectedRecommendedRep.account == newRep) {
      this.representativeService.saveRepresentative(newRep, this.selectedRecommendedRep.alias, false, false);
    }

    // Good to go!
    this.selectedAccounts = [];
    this.toRepresentativeID = '';
    this.representativeListMatch = '';
    this.changingRepresentatives = false;
    this.selectedRecommendedRep = null;

    this.notifications.sendSuccess(`已成功更新代表!`);

    // If the overview panel is displayed, reload its data now
    if (!this.hideOverview) {
      this.representativeOverview = await this.representativeService.getRepresentativesOverview();
    }

    // Detect if any new reps should be changed
    await this.representativeService.detectChangeableReps();
  }


}
