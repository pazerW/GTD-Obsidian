import { App, Modal, Setting } from 'obsidian';
import { Task } from './Task';
import { TimeParser } from '../utils/TimeParser';

export interface TaskEditData {
    name: string;
    startTime?: Date;
    duration?: number;
    dueTime?: Date;
}

export class TaskEditModal extends Modal {
    private task: Task;
    private onSave: (editedData: TaskEditData) => void;
    private editData: TaskEditData;

    constructor(app: App, task: Task, onSave: (editedData: TaskEditData) => void) {
        super(app);
        this.task = task;
        this.onSave = onSave;
        
        // 初始化编辑数据，处理类型转换
        this.editData = {
            name: task.name,
            startTime: task.startTime ? TimeParser.parseTime(task.startTime) || undefined : undefined,
            duration: task.duration || undefined,
            dueTime: task.dueTime ? TimeParser.parseTime(task.dueTime) || undefined : undefined
        };
    }
    
    /**
     * 解析持续时间字符串
     * 支持格式: 2h, 30min, 1h30min, 90min, 2小时, 30分钟, 1小时30分钟
     */
    private parseDuration(durationStr: string): number | undefined {
        if (!durationStr || !durationStr.trim()) return undefined;
        
        const trimmed = durationStr.trim();
        
        // 匹配 1h30min 格式
        const hourMinMatch = trimmed.match(/^(\d+)h\s*(\d+)min$/i);
        if (hourMinMatch) {
            const hours = parseInt(hourMinMatch[1], 10);
            const minutes = parseInt(hourMinMatch[2], 10);
            return hours * 60 + minutes;
        }
        
        // 匹配 2h 格式
        const hourMatch = trimmed.match(/^(\d+)h$/i);
        if (hourMatch) {
            return parseInt(hourMatch[1], 10) * 60;
        }
        
        // 匹配 30min 格式
        const minMatch = trimmed.match(/^(\d+)min$/i);
        if (minMatch) {
            return parseInt(minMatch[1], 10);
        }
        
        // 匹配中文格式: 2小时30分钟
        const chineseHourMinMatch = trimmed.match(/^(\d+)小时(\d+)分钟$/);
        if (chineseHourMinMatch) {
            const hours = parseInt(chineseHourMinMatch[1], 10);
            const minutes = parseInt(chineseHourMinMatch[2], 10);
            return hours * 60 + minutes;
        }
        
        // 匹配中文格式: 2小时
        const chineseHourMatch = trimmed.match(/^(\d+)小时$/);
        if (chineseHourMatch) {
            return parseInt(chineseHourMatch[1], 10) * 60;
        }
        
        // 匹配中文格式: 30分钟
        const chineseMinMatch = trimmed.match(/^(\d+)分钟$/);
        if (chineseMinMatch) {
            return parseInt(chineseMinMatch[1], 10);
        }
        
        // 尝试纯数字，假设为分钟
        const numMatch = trimmed.match(/^(\d+)$/);
        if (numMatch) {
            return parseInt(numMatch[1], 10);
        }
        
        return undefined;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 设置标题
        contentEl.createEl('h2', { text: '编辑任务' });

        // 任务名称设置
        new Setting(contentEl)
            .setName('任务名称')
            .setDesc('修改任务的名称')
            .addText(text => {
                text.setPlaceholder('输入任务名称')
                    .setValue(this.editData.name)
                    .onChange(value => {
                        this.editData.name = value;
                    });
                // 自动聚焦到名称输入框
                text.inputEl.focus();
                text.inputEl.select();
            });

        // 开始时间设置
        new Setting(contentEl)
            .setName('开始时间')
            .setDesc('设置任务的开始时间 (格式: HH:MM)')
            .addText(text => {
                const currentTime = this.editData.startTime ? 
                    TimeParser.formatTime(this.editData.startTime) : '';
                text.setPlaceholder('09:00')
                    .setValue(currentTime)
                    .onChange(value => {
                        if (value.trim() === '') {
                            this.editData.startTime = undefined;
                        } else {
                            try {
                                const parsedTime = TimeParser.parseTime(value);
                                this.editData.startTime = parsedTime || undefined;
                            } catch (error) {
                                console.warn('Invalid time format:', value);
                            }
                        }
                    });
            });

        // 持续时间设置
        new Setting(contentEl)
            .setName('持续时间')
            .setDesc('设置任务的持续时间 (格式: 2h, 30min, 1h30min)')
            .addText(text => {
                const currentDuration = this.editData.duration ? 
                    TimeParser.formatDuration(this.editData.duration) : '';
                text.setPlaceholder('1h30min')
                    .setValue(currentDuration)
                    .onChange(value => {
                        if (value.trim() === '') {
                            this.editData.duration = undefined;
                        } else {
                            try {
                                this.editData.duration = this.parseDuration(value);
                            } catch (error) {
                                console.warn('Invalid duration format:', value);
                            }
                        }
                    });
            });

        // 截止时间设置
        new Setting(contentEl)
            .setName('截止时间')
            .setDesc('设置任务的截止时间 (格式: HH:MM)')
            .addText(text => {
                const currentDueTime = this.editData.dueTime ? 
                    TimeParser.formatTime(this.editData.dueTime) : '';
                text.setPlaceholder('17:00')
                    .setValue(currentDueTime)
                    .onChange(value => {
                        if (value.trim() === '') {
                            this.editData.dueTime = undefined;
                        } else {
                            try {
                                const parsedTime = TimeParser.parseTime(value);
                                this.editData.dueTime = parsedTime || undefined;
                            } catch (error) {
                                console.warn('Invalid time format:', value);
                            }
                        }
                    });
            });

        // 计算的结束时间显示
        const endTimeInfo = contentEl.createDiv('task-edit-info');
        this.updateEndTimeInfo(endTimeInfo);

        // 按钮容器
        const buttonContainer = contentEl.createDiv('task-edit-buttons');
        
        // 保存按钮
        const saveButton = buttonContainer.createEl('button', {
            text: '保存',
            cls: 'mod-cta'
        });
        saveButton.addEventListener('click', () => {
            this.handleSave();
        });

        // 取消按钮
        const cancelButton = buttonContainer.createEl('button', {
            text: '取消'
        });
        cancelButton.addEventListener('click', () => {
            this.close();
        });

        // 键盘事件处理
        contentEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                this.handleSave();
            } else if (event.key === 'Escape') {
                this.close();
            }
        });

        // 监听输入变化以更新结束时间显示
        const inputs = contentEl.querySelectorAll('input[type="text"]');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                setTimeout(() => this.updateEndTimeInfo(endTimeInfo), 100);
            });
        });
    }

    private updateEndTimeInfo(container: HTMLElement) {
        container.empty();
        
        if (this.editData.startTime && this.editData.duration) {
            const endTime = new Date(this.editData.startTime.getTime() + this.editData.duration * 60 * 1000);
            const infoEl = container.createDiv('end-time-info');
            infoEl.innerHTML = `
                <strong>计算的结束时间:</strong> ${TimeParser.formatTime(endTime)}
                <br><small>基于开始时间 + 持续时间计算</small>
            `;
        }
    }

    private handleSave() {
        // 验证必填字段
        if (!this.editData.name.trim()) {
            // 显示错误提示
            const errorEl = this.contentEl.createDiv('task-edit-error');
            errorEl.setText('任务名称不能为空');
            errorEl.style.color = 'var(--text-error)';
            errorEl.style.marginTop = '10px';
            
            setTimeout(() => {
                errorEl.remove();
            }, 3000);
            return;
        }

        // 调用保存回调
        this.onSave(this.editData);
        this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}