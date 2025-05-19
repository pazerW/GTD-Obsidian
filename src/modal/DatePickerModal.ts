// 假设你已经有 Modal, App, Notice 的相关类型和实现

import { App,  Modal, Notice, } from 'obsidian';


export class DatePickerModal extends Modal {
    private onDateSelected: (date: Date) => void;

    constructor(app: App, onDateSelected: (date: Date) => void) {
        super(app);
        this.onDateSelected = onDateSelected;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        // 标题
        const title = contentEl.createEl('h2', { text: '获取OmniFocus任务的日期' });
        title.style.textAlign = 'center';
        title.style.marginBottom = '1em';
        // 日期输入框
        const input = contentEl.createEl('input', { type: 'text', placeholder: 'yyyy-mm-dd' });
        input.style.width = '100%';
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        input.value = `${yyyy}-${mm}-${dd}`;
        const descption = contentEl.createEl('p', { text: '请输入日期，格式为 yyyy-mm-dd' });
        descption.style.fontSize = '0.9em';
        descption.style.textAlign = 'left';
        descption.style.marginTop = '1em';
        descption.style.marginBottom = '1em';

        input.focus();

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.marginTop = '1em';
        // 确定按钮
        const confirmButton = buttonContainer.createEl('button', { text: '同步' });
        confirmButton.style.marginRight = '1em';
        confirmButton.addEventListener('click', () => {
            const value = input.value.trim();
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (dateRegex.test(value)) {
            const date = new Date(value);
                if (!isNaN(date.getTime())) {
                this.onDateSelected(date); // 选择的日期通过回调返回
                this.close();
            } else {
                new Notice('无效日期');
            }
            } else {
            new Notice('请输入正确格式: yyyy-mm-dd');
            }
        });
        
        // 支持回车提交
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
            confirmButton.click();
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
