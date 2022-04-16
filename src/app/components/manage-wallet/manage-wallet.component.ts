import { Component, OnInit } from '@angular/core';
import {WalletService} from "../../services/wallet.service";
import {NotificationService} from "../../services/notification.service";
import * as QRCode from 'qrcode';
import {AddressBookService} from "../../services/address-book.service";
import {Router} from "@angular/router";
import * as bip from 'bip39';

@Component({
  selector: 'app-manage-wallet',
  templateUrl: './manage-wallet.component.html',
  styleUrls: ['./manage-wallet.component.css']
})
export class ManageWalletComponent implements OnInit {

  wallet = this.walletService.wallet;

  newPassword = '';
  confirmPassword = '';

  showQRExport = false;
  QRExportUrl = '';
  QRExportImg = '';
  addressBookShowQRExport = false;
  addressBookQRExportUrl = '';
  addressBookQRExportImg = '';

  constructor(
    public walletService: WalletService,
    private addressBookService: AddressBookService,
    public notifications: NotificationService,
    private router: Router) { }

  async ngOnInit() {
    this.wallet = this.walletService.wallet;
  }

  async changePassword() {
    if (this.newPassword !== this.confirmPassword) return this.notifications.sendError(`密码不匹配`);
    if (this.newPassword.length < 1) return this.notifications.sendError(`密码不能为空`);
    if (this.walletService.walletIsLocked()) return this.notifications.sendWarning(`钱包必须解锁`);

    this.walletService.wallet.password = this.newPassword;
    this.walletService.saveWalletExport();

    this.newPassword = '';
    this.confirmPassword = '';
    this.notifications.sendSuccess(`钱包密码更新成功`);
  }

  async exportWallet() {
    if (this.walletService.walletIsLocked()) return this.notifications.sendWarning(`钱包必须解锁`);

    const exportUrl = this.walletService.generateExportUrl();
    this.QRExportUrl = exportUrl;
    this.QRExportImg = await QRCode.toDataURL(exportUrl);
    this.showQRExport = true;
  }

  copied() {
    this.notifications.sendSuccess(`钱包种子复制到剪贴板!`);
  }

  seedMnemonic() {
    return bip.entropyToMnemonic(this.wallet.seed);
  }

  async exportAddressBook() {
    const exportData = this.addressBookService.addressBook;
    if (exportData.length >= 25) {
      return this.notifications.sendError(`25个或更多条目的通讯录需要使用文件导出方式.`);
    }
    const base64Data = btoa(JSON.stringify(exportData));
    const exportUrl = `https://nanovault.io/import-address-book#${base64Data}`;

    this.addressBookQRExportUrl = exportUrl;
    this.addressBookQRExportImg = await QRCode.toDataURL(exportUrl);
    this.addressBookShowQRExport = true;
  }

  exportAddressBookToFile() {
    if (this.walletService.walletIsLocked()) return this.notifications.sendWarning(`钱包必须解锁`);
    const fileName = `FFD-wallet-AddressBook.json`;

    const exportData = this.addressBookService.addressBook;
    this.triggerFileDownload(fileName, exportData);

    this.notifications.sendSuccess(`下载地址簿导出!`);
  }

  triggerFileDownload(fileName, exportData) {
    const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });

    // Check for iOS, which is weird with saving files
    const iOS = !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);

    if (window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveBlob(blob, fileName);
    } else {
      const elem = window.document.createElement('a');
      const objUrl = window.URL.createObjectURL(blob);
      if (iOS) {
        elem.href = `data:attachment/file,${JSON.stringify(exportData)}`;
      } else {
        elem.href = objUrl;
      }
      elem.download = fileName;
      document.body.appendChild(elem);
      elem.click();
      setTimeout(function(){
        document.body.removeChild(elem);
        window.URL.revokeObjectURL(objUrl);
      }, 200);
    }
  }

  exportToFile() {
    if (this.walletService.walletIsLocked()) return this.notifications.sendWarning(`钱包必须解锁`);

    const fileName = `FFD-Wallet.json`;
    const exportData = this.walletService.generateExportData();
    this.triggerFileDownload(fileName, exportData);

    this.notifications.sendSuccess(`已下载钱包导出!`);
  }

  importFromFile(files) {
    if (!files.length) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const fileData = event.target['result'];
      try {
        const importData = JSON.parse(fileData);
        if (!importData.length || !importData[0].account) {
          return this.notifications.sendError(`错误的导入数据，确保您选择了 FFD 通讯簿导出`)
        }

        const walletEncrypted = btoa(JSON.stringify(importData));
        this.router.navigate(['导入地址簿'], { fragment: walletEncrypted });
      } catch (err) {
        this.notifications.sendError(`无法解析导入数据，请确保您选择了正确的文件!`);
      }
    };

    reader.readAsText(file);
  }

}
