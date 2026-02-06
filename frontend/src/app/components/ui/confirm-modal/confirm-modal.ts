import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-confirm-modal',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './confirm-modal.html',
})
export class ConfirmModal {
    @Input() isOpen = false;
    @Input() title = 'Xác nhận';
    @Input() message = 'Bạn có chắc chắn muốn thực hiện hành động này?';
    @Input() type: 'danger' | 'info' = 'danger';
    @Input() confirmText = 'Xóa';
    @Input() cancelText = 'Hủy';

    @Output() confirm = new EventEmitter<void>();
    @Output() cancel = new EventEmitter<void>();

    onConfirm() {
        this.confirm.emit();
    }

    onCancel() {
        this.cancel.emit();
    }
}
