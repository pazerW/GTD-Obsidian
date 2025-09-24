import { TimeParser } from '../utils/TimeParser';

/**
 * 拖拽事件数据
 */
export interface DragEventData {
    taskName: string;
    originalLine: string;
    startTime?: Date;
    duration?: number;
}

/**
 * 时间轴拖拽处理器
 */
export class TimelineDragHandler {
    private container: HTMLElement;
    private intervalMinutes: number;
    private onTaskUpdate?: (oldLine: string, newLine: string) => void;

    constructor(
        container: HTMLElement, 
        intervalMinutes = 30,
        onTaskUpdate?: (oldLine: string, newLine: string) => void
    ) {
        this.container = container;
        this.intervalMinutes = intervalMinutes;
        this.onTaskUpdate = onTaskUpdate;
        this.setupDropZones();
    }

    /**
     * 为任务元素添加拖拽功能
     */
    addDragToTask(element: HTMLElement, taskData: DragEventData): void {
        element.setAttribute('draggable', 'true');
        element.classList.add('timeline-draggable');
        
        element.addEventListener('dragstart', (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData('application/json', JSON.stringify(taskData));
                e.dataTransfer.effectAllowed = 'move';
            }
            element.classList.add('dragging');
            this.highlightDropZones();
        });
        
        element.addEventListener('dragend', () => {
            element.classList.remove('dragging');
            this.clearDropZoneHighlights();
        });
    }

    /**
     * 设置拖拽目标区域
     */
    setupDropZones(): void {
        // 为时间槽添加拖拽目标功能
        const timeSlots = this.container.querySelectorAll('.timeline-time-slot, .timeline-slot');
        
        timeSlots.forEach(slot => {
            this.addDropZoneEvents(slot as HTMLElement);
        });
    }

    /**
     * 为时间槽设置时间数据
     */
    setTimeSlotData(element: HTMLElement, time: Date): void {
        element.setAttribute('data-time', time.toISOString());
    }

    /**
     * 为元素添加拖拽目标事件
     */
    private addDropZoneEvents(element: HTMLElement): void {
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
            element.classList.add('drag-over');
        });
        
        element.addEventListener('dragleave', () => {
            element.classList.remove('drag-over');
        });
        
        element.addEventListener('drop', (e) => {
            e.preventDefault();
            element.classList.remove('drag-over');
            
            if (!e.dataTransfer) return;
            
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json')) as DragEventData;
                const newTime = this.getTimeFromDropTarget(element);
                
                if (newTime) {
                    this.handleTaskDrop(data, newTime);
                }
            } catch (error) {
                console.error('Failed to handle task drop:', error);
            }
        });
    }

    /**
     * 从拖拽目标获取时间
     */
    private getTimeFromDropTarget(element: HTMLElement): Date | null {
        // 检查是否有时间数据属性
        const timeStr = element.getAttribute('data-time');
        if (timeStr) {
            return new Date(timeStr);
        }
        
        // 尝试从文本内容解析时间
        const textContent = element.textContent?.trim();
        if (textContent) {
            return TimeParser.parseTime(textContent);
        }
        
        return null;
    }

    /**
     * 处理任务拖拽
     */
    private handleTaskDrop(data: DragEventData, newTime: Date): void {
        
        // 调整到最近的间隔时间
        const adjustedTime = TimeParser.roundToInterval(newTime, this.intervalMinutes);
        
        // 生成新的任务行
        const newLine = this.generateUpdatedTaskLine(data, adjustedTime);
        
        // 触发更新回调
        if (this.onTaskUpdate) {
            this.onTaskUpdate(data.originalLine, newLine);
        }
    }

    /**
     * 生成更新后的任务行
     */
    private generateUpdatedTaskLine(data: DragEventData, newStartTime: Date): string {
        const { taskName, originalLine, duration } = data;
        
        // 提取任务状态
        const completedMatch = originalLine.match(/^-\s*\[([ x])\]/);
        const completed = completedMatch ? completedMatch[1] : ' ';
        
        // 生成新的时间字符串
        let timeStr = `@${TimeParser.formatTime(newStartTime)}`;
        
        if (duration && duration > 0) {
            if (duration >= 60 && duration % 60 === 0) {
                // 整小时
                timeStr += `+${duration / 60}h`;
            } else {
                // 分钟
                timeStr += `+${duration}min`;
            }
        }
        
        // 检查是否有截止时间
        const dueMatch = originalLine.match(/due:(\\S+)/);
        const dueStr = dueMatch ? ` ${dueMatch[0]}` : '';
        
        return `- [${completed}] ${taskName} ${timeStr}${dueStr}`;
    }

    /**
     * 高亮拖拽目标区域
     */
    private highlightDropZones(): void {
        const dropZones = this.container.querySelectorAll('.timeline-time-slot, .timeline-slot');
        dropZones.forEach(zone => {
            (zone as HTMLElement).classList.add('drop-zone-active');
        });
    }

    /**
     * 清除拖拽目标区域高亮
     */
    private clearDropZoneHighlights(): void {
        const dropZones = this.container.querySelectorAll('.timeline-time-slot, .timeline-slot, .drag-over');
        dropZones.forEach(zone => {
            (zone as HTMLElement).classList.remove('drop-zone-active');
            (zone as HTMLElement).classList.remove('drag-over');
        });
    }

    /**
     * 添加调整大小功能
     */
    addResizeToTask(element: HTMLElement, taskData: DragEventData): void {
        const resizeHandle = element.createDiv('timeline-resize-handle');
        resizeHandle.setAttribute('title', '拖拽调整持续时间');
        
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            startX = e.clientX;
            startWidth = element.offsetWidth;
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const newWidth = Math.max(50, startWidth + deltaX); // 最小宽度50px
            element.style.width = `${newWidth}px`;
        };
        
        const handleMouseUp = () => {
            if (!isResizing) return;
            
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            // 计算新的持续时间
            const newDuration = this.calculateDurationFromWidth(element);
            const newTaskData = { ...taskData, duration: newDuration };
            
            // 生成新的任务行
            if (taskData.startTime) {
                const newLine = this.generateUpdatedTaskLine(newTaskData, taskData.startTime);
                if (this.onTaskUpdate) {
                    this.onTaskUpdate(taskData.originalLine, newLine);
                }
            }
        };
    }

    /**
     * 从宽度计算持续时间
     */
    private calculateDurationFromWidth(element: HTMLElement): number {
        // 这是一个简化的计算，实际实现可能需要更复杂的逻辑
        const width = element.offsetWidth;
        const minWidth = 50; // 最小宽度对应的时间间隔
        const widthPerInterval = 60; // 每个间隔的像素宽度（可调整）
        
        const intervals = Math.max(1, Math.round((width - minWidth) / widthPerInterval) + 1);
        return intervals * this.intervalMinutes;
    }
}