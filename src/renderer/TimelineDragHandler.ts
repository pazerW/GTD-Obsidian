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
            const el = slot as HTMLElement;
            // 防止重复初始化同一元素
            if (el.getAttribute('data-dropzone-initialized') === 'true') return;
            this.addDropZoneEvents(el);
            el.setAttribute('data-dropzone-initialized', 'true');
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
     * 更新容器引用（当 renderer 复用 handler 时调用）
     */
    setContainer(container: HTMLElement) {
        this.container = container;
    }

    /**
     * 更新时间间隔
     */
    setIntervalMinutes(minutes: number) {
        this.intervalMinutes = minutes;
    }

    /**
     * 清理高亮（以及在 renderer 卸载时可调用以确保 UI 清理）
     */
    dispose(): void {
        this.clearDropZoneHighlights();
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
        console.log('TimelineDragHandler.handleTaskDrop called:', { originalLine: data.originalLine, newTime });
        
        // 调整到最近的间隔时间
        const adjustedTime = TimeParser.roundToInterval(newTime, this.intervalMinutes);
        console.log('Adjusted time:', adjustedTime);
        
        // 生成新的任务行
        const newLine = this.generateUpdatedTaskLine(data, adjustedTime);
        console.log('Generated new line:', newLine);
        
        // 触发更新回调
        if (this.onTaskUpdate) {
            console.log('Calling onTaskUpdate callback');
            this.onTaskUpdate(data.originalLine, newLine);
        } else {
            console.warn('No onTaskUpdate callback available');
        }
    }

    /**
     * 生成更新后的任务行
     */
    private generateUpdatedTaskLine(data: DragEventData, newStartTime: Date): string {
        const { originalLine, duration } = data;
        
        // 生成新的时间字符串
        let newTimeStr = `@${TimeParser.formatTime(newStartTime)}`;
        
        if (duration && duration > 0) {
            if (duration >= 60 && duration % 60 === 0) {
                // 整小时
                newTimeStr += `+${duration / 60}h`;
            } else {
                // 分钟
                newTimeStr += `+${duration}min`;
            }
        }
        
        // 使用正则表达式替换原始行中最后一个时间标记（通常是拖拽的那个）
        // 匹配模式：@时间 或 @时间+持续时间 或 @时间-时间
        const timeMarkers = originalLine.match(/@\d{1,2}:\d{2}(?:[-+]\d{1,2}:\d{2}|[+-]\d+(?:h|min))?/g);
        
        let updatedLine = originalLine;
        if (timeMarkers && timeMarkers.length > 0) {
            // 获取最后一个时间标记（这通常是我们拖拽的那个）
            const lastTimeMarker = timeMarkers[timeMarkers.length - 1];
            const lastIndex = originalLine.lastIndexOf(lastTimeMarker);
            
            // 只替换最后一个时间标记
            updatedLine = originalLine.substring(0, lastIndex) + 
                         newTimeStr + 
                         originalLine.substring(lastIndex + lastTimeMarker.length);
        }
        
        // 如果没有找到可替换的时间标记，就在行末添加新的时间
        if (!updatedLine.includes(newTimeStr) && updatedLine === originalLine) {
            updatedLine = `${originalLine} ${newTimeStr}`;
        }
        
        return updatedLine;
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