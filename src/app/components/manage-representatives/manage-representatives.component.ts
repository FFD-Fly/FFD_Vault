import {AfterViewInit, Component, OnInit} from '@angular/core';
import {AddressBookService} from "../../services/address-book.service";
import {WalletService} from "../../services/wallet.service";
import {NotificationService} from "../../services/notification.service";
import {ModalService} from "../../services/modal.service";
import {ApiService} from "../../services/api.service";
import {Router} from "@angular/router";
import {RepresentativeService} from "../../services/representative.service";

@Component({
  selector: 'app-manage-representatives',
  templateUrl: './manage-representatives.component.html',
  styleUrls: ['./manage-representatives.component.css']
})
export class ManageRepresentativesComponent implements OnInit, AfterViewInit {

  activePanel = 0;

  // Set the online status of each representative
  representatives$ = this.repService.representatives$.map(reps => {
    return reps.map(rep => {
      rep.online = this.onlineReps.indexOf(rep.id) !== -1;
      return rep;
    })
  });

  newRepAccount = '';
  newRepName = '';
  newRepTrusted = false;
  newRepWarn = false;

  onlineReps = [];

  constructor(
    private api: ApiService,
    private addressBookService: AddressBookService,
    private walletService: WalletService,
    private notificationService: NotificationService,
    public modal: ModalService,
    private repService: RepresentativeService,
    private router: Router,
    private nodeApi: ApiService) { }

  async ngOnInit() {
    this.repService.loadRepresentativeList();
    this.onlineReps = await this.getOnlineRepresentatives();
    this.repService.representatives$.next(this.repService.representatives); // Forcefully repush rep list once we have online status
  }

  ngAfterViewInit() {
  }

  editEntry(representative) {
    this.newRepAccount = representative.id;
    this.newRepName = representative.name;
    this.newRepTrusted = !!representative.trusted;
    this.newRepWarn = !!representative.warn;
    this.activePanel = 1;
    setTimeout(() => {
      document.getElementById('new-address-name').focus();
    }, 150);
  }

  async saveNewRepresentative() {
    if (!this.newRepAccount || !this.newRepName) return this.notificationService.sendError(`帐号和姓名为必填项`);

    this.newRepAccount = this.newRepAccount.replace(/ /g, ''); // Remove spaces

    // Make sure the address is valid
    const valid = await this.nodeApi.validateAccountNumber(this.newRepAccount);
    if (!valid || valid.valid !== '1') return this.notificationService.sendWarning(`Account ID is not a valid account`);

    try {
      await this.repService.saveRepresentative(this.newRepAccount, this.newRepName, this.newRepTrusted, this.newRepWarn);
      this.notificationService.sendSuccess(`Successfully saved new representative!`);

      this.cancelNewRep();
    } catch (err) {
      this.notificationService.sendError(`Unable to save entry: ${err.message}`)
    }
  }

  cancelNewRep() {
    this.newRepName = '';
    this.newRepAccount = '';
    this.newRepTrusted = false;
    this.newRepWarn = false;
    this.activePanel = 0;
  }

  copied() {
    this.notificationService.sendSuccess(`Account address copied to clipboard!`);
  }

  async getOnlineRepresentatives() {
    const representatives = [];
    try {
      const reps = await this.api.representativesOnline();
      for (let representative in reps.representatives) {
        if (!reps.representatives.hasOwnProperty(representative)) continue;
        representatives.push(reps.representatives[representative]);
      }
    } catch (err) {
      this.notificationService.sendWarning(`无法确定代表的在线状态`);
    }

    return representatives;
  }

  async deleteRepresentative(accountID) {
    try {
      this.repService.deleteRepresentative(accountID);
      this.notificationService.sendSuccess(`已成功删除代表`)
    } catch (err) {
      this.notificationService.sendError(`无法删除代表: ${err.message}`)
    }
  }

}
