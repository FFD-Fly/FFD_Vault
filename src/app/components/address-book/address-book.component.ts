import {AfterViewInit, Component, OnInit} from '@angular/core';
import {AddressBookService} from "../../services/address-book.service";
import {WalletService} from "../../services/wallet.service";
import {NotificationService} from "../../services/notification.service";
import {ModalService} from "../../services/modal.service";
import {ApiService} from "../../services/api.service";
import {Router} from "@angular/router";

@Component({
  selector: 'app-address-book',
  templateUrl: './address-book.component.html',
  styleUrls: ['./address-book.component.css']
})
export class AddressBookComponent implements OnInit, AfterViewInit {

  activePanel = 0;

  addressBook$ = this.addressBookService.addressBook$;
  newAddressAccount = '';
  newAddressName = '';

  constructor(
    private addressBookService: AddressBookService,
    private walletService: WalletService,
    private notificationService: NotificationService,
    public modal: ModalService,
    private router: Router,
    private nodeApi: ApiService) { }

  async ngOnInit() {
    this.addressBookService.loadAddressBook();
  }

  ngAfterViewInit() {
    // Listen for reordering events
    document.getElementById('地址簿可排序').addEventListener('moved', (e) => {
      const elements = e.srcElement.children;

      const result = [].slice.call(elements);
      const datas = result.map(e => e.dataset.account);

      this.addressBookService.setAddressBookOrder(datas);
      this.notificationService.sendSuccess(`更新地址簿顺序`);
    });
  }

  editEntry(addressBook) {
    this.newAddressAccount = addressBook.account;
    this.newAddressName = addressBook.name;
    this.activePanel = 1;
    setTimeout(() => {
      document.getElementById('新地址名称').focus();
    }, 150);
  }

  async saveNewAddress() {
    if (!this.newAddressAccount || !this.newAddressName) return this.notificationService.sendError(`帐号和姓名为必填项`);

    this.newAddressAccount = this.newAddressAccount.replace(/ /g, ''); // Remove spaces

    // Make sure name doesn't exist
    if (this.addressBookService.nameExists(this.newAddressName)) {
      return this.notificationService.sendError(`这个名字已被使用！ 请使用唯一的名称`);
    }

    // Make sure the address is valid
    const valid = await this.nodeApi.validateAccountNumber(this.newAddressAccount);
    if (!valid || valid.valid !== '1') return this.notificationService.sendWarning(`帐户 ID 不是有效帐户`);

    try {
      await this.addressBookService.saveAddress(this.newAddressAccount, this.newAddressName);
      this.notificationService.sendSuccess(`已成功为帐户创建新名称!`);
      // IF this is one of our accounts, set its name, and hope things update?
      const walletAccount = this.walletService.wallet.accounts.find(a => a.id.toLowerCase() === this.newAddressAccount.toLowerCase());
      if (walletAccount) {
        walletAccount.addressBookName = this.newAddressName;
      }
      this.cancelNewAddress();
    } catch (err) {
      this.notificationService.sendError(`无法保存条目: ${err.message}`)
    }
  }

  cancelNewAddress() {
    this.newAddressName = '';
    this.newAddressAccount = '';
    this.activePanel = 0;
  }

  copied() {
    this.notificationService.sendSuccess(`帐户地址已复制到剪贴板!`);
  }

  async deleteAddress(account) {
    try {
      this.addressBookService.deleteAddress(account);
      this.notificationService.sendSuccess(`已成功删除通讯录条目`)
    } catch (err) {
      this.notificationService.sendError(`无法删除条目 : ${err.message}`)
    }
  }

}
