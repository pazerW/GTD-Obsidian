import { MarkdownRenderChild, App } from 'obsidian';
import { TimeParser } from '../utils/TimeParser';
import { TimelineDragHandler, DragEventData } from './TimelineDragHandler';
import { TaskEditModal, TaskEditData } from '../modal/TaskEditModal';
import { Task } from '../modal/Task';

/**
 * 解析后的任务信息
 */
interface ParsedTask {
    name: string;
    completed: boolean;
    startTime?: Date;
    endTime?: Date;
    duration?: number;
    dueTime?: Date;
    originalLine: string;
    id: string; // 唯一标识符
}

/**
 * 时间轴布局选项
 */
export type TimelineLayout = 'vertical';

/**
 * 时间轴渲染选项
 */
export interface TimelineOptions {
    layout: TimelineLayout;
    intervalMinutes: number;
    showTimeSlots: boolean;
    enableDragging: boolean;
    dynamicTimeSlots: boolean; // 是否启用动态时间段（隐藏空白时间）
}

export class TimelineRenderer extends MarkdownRenderChild {
    private app: App;
    private options: TimelineOptions;
    private dragHandler?: TimelineDragHandler;
    private currentContent?: string;
    private updateTimer?: number;
    private currentTimeIndicator?: HTMLElement;

    constructor(container: HTMLElement, app: App, options?: Partial<TimelineOptions>) {
        super(container);
        this.app = app;
        this.options = {
            layout: 'vertical',
            intervalMinutes: 60,
            showTimeSlots: true,
            enableDragging: false,
            dynamicTimeSlots: true, // 默认启用动态时间段
            ...options
        };
    }

    /**
     * 更新选项并重新渲染
     */
    updateOptions(newOptions: Partial<TimelineOptions>): void {
        this.options = { ...this.options, ...newOptions };
        if (this.currentContent) {
            this.render(this.currentContent);
        }
    }

    /**
     * 渲染时间轴
     * @param content timeline代码块的内容
     */
    async render(content: string): Promise<void> {
        try {
            // 保存当前内容以便重新渲染
            this.currentContent = content;
            
            // 清空容器
            this.containerEl.empty();

            // 解析内容中的任务
            const tasks = this.parseTasksFromContent(content);
            
            // 按时间排序任务
            const sortedTasks = this.sortTasksByTime(tasks);

            // 创建时间轴容器
            const timelineContainer = this.containerEl.createDiv('timeline-container');
            timelineContainer.addClass(`timeline-${this.options.layout}`);
            
            if (sortedTasks.length === 0) {
                timelineContainer.createDiv('timeline-empty').setText('没有找到任务');
                return;
            }


            // 根据布局创建时间轴
            await this.createVerticalTimeline(timelineContainer, sortedTasks);
            
            // 初始化拖拽功能
            // 初始化或复用拖拽功能（避免重复 new + 重复注册事件）
            if (this.options.enableDragging) {
                if (!this.dragHandler) {
                    this.dragHandler = new TimelineDragHandler(
                        timelineContainer,
                        this.options.intervalMinutes,
                        (oldLine, newLine) => this.handleTaskUpdate(oldLine, newLine)
                    );
                } else {
                    // 复用已有 handler，更新容器引用和间隔设置
                    this.dragHandler.setContainer(timelineContainer);
                    this.dragHandler.setIntervalMinutes(this.options.intervalMinutes);
                }
                // idempotent：只会在未初始化的元素上绑定事件
                this.dragHandler.setupDropZones();
            } else {
                // 未启用拖拽时，若已有 handler 可做简单清理
                if (this.dragHandler) {
                    this.dragHandler.dispose();
                }
            }
            
            // 确保容器有正确的类名
            this.containerEl.addClass('timeline-renderer');
            
        } catch (error) {
            console.error('Timeline render error:', error);
            this.containerEl.createDiv('timeline-error').setText(`渲染错误: ${error.message}`);
        }
    }

    /**
     * 从内容中解析任务
     */
    private parseTasksFromContent(content: string): ParsedTask[] {
        const lines = content.split('\n');
        const tasks: ParsedTask[] = [];

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) {
                continue; // 跳过空行和注释
            }

            // 解析任务格式: - [ ] 任务名 @时间 due:时间
            // 支持格式:
            // - [ ] 任务名 @14:30
            // - [ ] 任务名 @14:30-16:00
            // - [ ] 任务名 @14:30+2h
            // - [ ] 任务名 due:16:00
            // - [ ] 任务名 @14:30 due:16:00
            const taskMatch = trimmedLine.match(/^-\s*\[([ x])\]\s*(.+?)(?:\s+([@][\w:\-+]+|due:[\w:]+))*$/);
            if (taskMatch) {
                const [, completed, taskName] = taskMatch;
                
                // 提取所有时间相关的字符串
                const timeMatches = trimmedLine.match(/([@][\w:\-+]+|due:[\w:]+)/g) || [];
                
                let startTime: Date | undefined;
                let endTime: Date | undefined;
                let duration: number | undefined;
                let dueTime: Date | undefined;

                for (const timeStr of timeMatches) {
                    const timeInfo = TimeParser.parseTaskTime(timeStr.trim());
                    if (timeInfo) {
                        if (timeInfo.startTime) startTime = timeInfo.startTime;
                        if (timeInfo.endTime) endTime = timeInfo.endTime;
                        if (timeInfo.duration) duration = timeInfo.duration;
                        if (timeInfo.dueTime) dueTime = timeInfo.dueTime;
                    }
                }
                
                tasks.push({
                    name: taskName.trim(),
                    completed: completed === 'x',
                    startTime,
                    endTime,
                    duration,
                    dueTime,
                    originalLine: trimmedLine,
                    id: trimmedLine.match(/#([a-zA-Z0-9]+)/)?.[1] || `task-${tasks.length}-${Date.now()}`
                });
            }
        }

        return tasks;
    }

    /**
     * 按时间排序任务
     */
    private sortTasksByTime(tasks: ParsedTask[]): ParsedTask[] {
        return tasks.sort((a, b) => {
            const aTime = a.startTime || a.dueTime;
            const bTime = b.startTime || b.dueTime;
            
            // 没有时间的任务排在最后
            if (!aTime && !bTime) return 0;
            if (!aTime) return 1;
            if (!bTime) return -1;
            
            return aTime.getTime() - bTime.getTime();
        });
    }

    /**
     * 创建时间轴HTML
     */


    /**
     * 创建竖向时间轴
     */
    private async createVerticalTimeline(container: HTMLElement, tasks: ParsedTask[]): Promise<void> {
        const timeline = container.createDiv('timeline-vertical');
        
        const tasksWithTime = tasks.filter(task => task.startTime || task.dueTime);
        const tasksWithoutTime = tasks.filter(task => !task.startTime && !task.dueTime);
        
        if (tasksWithTime.length > 0) {
            // 根据配置选择时间段生成策略
            const timeSlots = this.options.dynamicTimeSlots 
                ? this.generateDynamicTimeSlots(tasksWithTime)
                : this.generateTraditionalTimeSlots(tasksWithTime);
            if (timeSlots.length > 0) {
                // 创建时间槽结构
                const timelineGrid = timeline.createDiv('timeline-grid');
                for (const slot of timeSlots) {
                    const slotDiv = timelineGrid.createDiv('timeline-slot');
                    const timeLabel = slotDiv.createDiv('timeline-time-label');
                    timeLabel.setText(TimeParser.formatTime(slot));
                    
                    // 为拖拽功能设置时间数据
                    if (this.dragHandler) {
                        this.dragHandler.setTimeSlotData(slotDiv, slot);
                    }
                    
                    // 创建空的任务容器用于布局
                    slotDiv.createDiv('timeline-slot-tasks');
                }
                
                // 添加当前时间指示器
                this.addCurrentTimeIndicator(timelineGrid, timeSlots);
                
                // 创建任务覆盖层，让任务可以跨越时间槽
                const tasksOverlay = timeline.createDiv('timeline-tasks-overlay');
                
                // 设置时间轴容器的最小高度，确保能包含所有时间槽
                const totalHeight = timeSlots.length * 60; // 每个时间槽60px高度
                timeline.style.minHeight = `${totalHeight}px`;

                // 计算任务重叠布局
                const taskLayout = this.calculateOverlapLayout(tasksWithTime);
                
                // 延迟创建任务元素，确保容器已完全渲染
                requestAnimationFrame(() => {
                    // 为每个任务创建完整的元素
                    for (const taskInfo of taskLayout) {
                        this.createVerticalTaskWhole(tasksOverlay, taskInfo.task, timeSlots, taskInfo.offset, taskInfo.width, taskInfo.groupSize);
                    }
                });
                

            }
        }
        
        // 添加没有时间的任务
        if (tasksWithoutTime.length > 0) {
            const noTimeSection = timeline.createDiv('timeline-no-time-section');
            const sectionTitle = noTimeSection.createDiv('timeline-section-title');
            sectionTitle.setText('无时间任务');
            
            for (const task of tasksWithoutTime) {
                this.createNoTimeTask(noTimeSection, task);
            }
        }
    }

    /**
     * 创建横向时间轴轨道
     */


    /**
     * 缓存的基础左边距值，避免重复计算
     */
    private cachedBaseLeft: number | null = null;
    
    /**
     * 缓存的时间槽偏移值，避免重复计算
     */
    private cachedSlotOffsets: number[] | null = null;

    /**
     * 获取时间标签的基础左边距
     */
    private getBaseLeft(container: HTMLElement): number {
        if (this.cachedBaseLeft !== null) {
            return this.cachedBaseLeft;
        }

        // 根据调试信息，时间标签宽度为80px，且与覆盖层左对齐
        // 所以任务应该从80px位置开始（时间标签宽度）
        // 但还需要考虑padding-right和border的空间
        this.cachedBaseLeft = 97; // 80px (width) + 15px (padding-right) + 2px (border-right)
        
        return this.cachedBaseLeft;
    }

    /**
     * 创建跨越时间段的完整竖向任务元素
     */
    private createVerticalTaskWhole(
        container: HTMLElement, 
        task: ParsedTask, 
        timeSlots: Date[], 
        offsetPercentage = 0, 
        widthPercentage = 100,
        groupSize = 1
    ): void {
        const taskStartTime = task.startTime || task.dueTime;
        if (!taskStartTime) return;
        
        // 计算任务的结束时间
        let taskEndTime: Date;
        if (task.endTime) {
            taskEndTime = task.endTime;
        } else if (task.duration && task.duration > 0) {
            taskEndTime = new Date(taskStartTime.getTime() + task.duration * 60 * 1000);
        } else {
            // 没有持续时间的任务，使用默认30分钟
            taskEndTime = new Date(taskStartTime.getTime() + 30 * 60 * 1000);
        }
        
        // 计算任务在时间轴中的位置和高度
        const taskPosition = this.calculateVerticalTaskPosition(taskStartTime, taskEndTime, timeSlots, container);
        if (!taskPosition) return;
        
        // 创建任务元素
        const taskElement = container.createDiv('timeline-task-vertical-whole');
        taskElement.addClass(task.completed ? 'completed' : 'pending');
        
        // 使用缓存的基础左边距计算
        const baseLeft = this.getBaseLeft(container);
        
        // 获取容器宽度，使用多种方法确保准确性
        let totalContainerWidth = container.clientWidth;
        if (!totalContainerWidth || totalContainerWidth < 200) {
            // 如果clientWidth不可用，尝试其他方法
            totalContainerWidth = container.offsetWidth || 
                                container.getBoundingClientRect().width ||
                                this.containerEl.clientWidth ||
                                600; // 最后的回退值
        }
        
        const availableWidth = totalContainerWidth - baseLeft - 20; // 可用宽度（减去右边距）
        
        // 重叠任务向右偏移，而不是向左
        const offsetPixels = (availableWidth * offsetPercentage) / 100;
        const widthPixels = (availableWidth * widthPercentage) / 100;
        
        // 设置任务的位置和尺寸
        taskElement.style.position = 'absolute';
        taskElement.style.top = `${taskPosition.top}px`;
        taskElement.style.height = `${taskPosition.height}px`;
        taskElement.style.left = `${baseLeft + offsetPixels}px`; // 向右偏移
        taskElement.style.width = `${widthPixels}px`;
        taskElement.style.zIndex = `${10 + Math.floor(offsetPercentage / 10)}`; // 重叠任务层级更高
        
        // 创建任务点
        const taskDot = taskElement.createDiv('timeline-task-dot');
        
        // 为所有任务添加点击切换完成状态功能
        taskDot.addClass('clickable-toggle');
        taskDot.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleTaskCompletion(task);
        });
        
        // 根据任务状态设置不同的提示文本
        if (task.completed) {
            taskDot.title = '点击标记为未完成';
        } else {
            taskDot.title = '点击标记为完成';
        }
        
        // 创建任务内容
        const taskContent = taskElement.createDiv('timeline-task-content');
        
        const taskName = taskContent.createDiv('timeline-task-name');
        // 当重叠任务超过3个时，限制任务名称显示为两行
        if (groupSize > 2 || (typeof task.duration === 'number' && task.duration <= 25)) {
            taskName.addClass('two-line-limit');
        }
        taskName.setText(task.name);
        if (groupSize < 4 && typeof task.duration === 'number' && task.duration > 25) {
            // 时间范围显示（包含持续时间）
            if (task.startTime && task.endTime) {
                const timeRange = taskContent.createDiv('timeline-task-time-range');
                const timeRangeText = `${TimeParser.formatTime(task.startTime)}-${TimeParser.formatTime(task.endTime)}`;
                // 如果有持续时间，添加到时间范围后面
                if (task.duration) {
                    if (groupSize > 2) {
                        timeRange.setText(`${timeRangeText}`);
                    } else {
                        timeRange.setText(`${timeRangeText} (${TimeParser.formatDuration(task.duration)})`);
                    }
                } else {
                    timeRange.setText(timeRangeText);
                }
            } else if (task.startTime && task.duration) {
                const endTime = new Date(task.startTime.getTime() + task.duration * 60 * 1000);
                const timeRange = taskContent.createDiv('timeline-task-time-range');
                const timeRangeText = `${TimeParser.formatTime(task.startTime)}-${TimeParser.formatTime(endTime)}`;
                if (groupSize > 2) {
                    timeRange.setText(`${timeRangeText}`);
                } else {
                    timeRange.setText(`${timeRangeText} (${TimeParser.formatDuration(task.duration)})`);
                }
            }
        }


        
        // 截止时间标签
        if (task.dueTime && task.startTime && task.dueTime !== task.startTime) {
            const dueLabel = taskContent.createDiv('timeline-task-due');
            dueLabel.setText(`截止: ${TimeParser.formatTime(task.dueTime)}`);
        }
        
        // 添加时间状态样式
        const taskTime = task.startTime || task.dueTime;
        if (taskTime) {
            const timeStatus = TimeParser.getTimeStatus(taskTime);
            taskElement.addClass(`time-${timeStatus}`);
        }
        
        // 添加拖拽功能
        if (this.options.enableDragging) {
            this.addDragFunctionality(taskElement, task);
        }
        
        // 添加点击编辑功能
        this.addTaskEditFunctionality(taskElement, task);
    }

    /**
     * 创建无时间任务
     */
    private createNoTimeTask(container: HTMLElement, task: ParsedTask): void {
        const taskElement = container.createDiv('timeline-task no-time');
        taskElement.addClass(task.completed ? 'completed' : 'pending');
        
        const taskContent = taskElement.createDiv('timeline-task-content');
        const taskName = taskContent.createDiv('timeline-task-name');
        taskName.setText(task.name);
        
        if (task.completed) {
            const completedIcon = taskContent.createDiv('timeline-task-status');
            completedIcon.setText('✓');
        }
    }

    /**
     * 获取任务的时间范围
     */
    private getTimeRange(tasks: ParsedTask[]): { startHour: number, endHour: number } | null {
        const tasksWithTime = tasks.filter(task => task.startTime || task.dueTime);
        if (tasksWithTime.length === 0) return null;

        // 收集所有相关时间点（开始时间、结束时间、截止时间）
        const allTimes: Date[] = [];
        for (const task of tasksWithTime) {
            if (task.startTime) allTimes.push(task.startTime);
            if (task.endTime) allTimes.push(task.endTime);
            if (task.dueTime) allTimes.push(task.dueTime);
        }
        
        if (allTimes.length === 0) return null;
        
        const hours = allTimes.map(time => time.getHours());
        
        // 找到最早的任务时间
        const minHour = Math.min(...hours);
        const minTime = allTimes.find(time => time.getHours() === minHour);
        
        // 开始时间：最早任务前1小时，但不早于0点
        let startHour = Math.max(0, minHour - 1);
        
        // 如果最早任务在0点或1点之间，且分钟数较小，可能需要调整
        if (minHour === 0 || (minHour === 1 && minTime && minTime.getMinutes() < 30)) {
            startHour = 0; // 从0点开始
        }
        
        // 找到最晚的任务时间
        const maxHour = Math.max(...hours);
        const maxTime = allTimes.find(time => time.getHours() === maxHour);
        
        // 结束时间：最晚任务后1小时，为了支持23点任务，延伸到凌晨1点
        let endHour = Math.min(25, maxHour + 2); // 使用25表示第二天凌晨1点
        
        // 如果最晚任务在22点或之后，扩展到凌晨1点以确保23点任务能完整显示
        if (maxHour >= 22) {
            endHour = 25; // 25表示第二天凌晨1点（即24+1）
        }
        // 如果最晚任务在21点后半段，也扩展到凌晨1点
        else if (maxHour === 21 && maxTime && maxTime.getMinutes() > 30) {
            endHour = 25;
        }
        // 否则至少延伸到24点
        else if (maxHour >= 20) {
            endHour = 24; // 24表示当日24点（即第二天0点）
        }
        
        return { startHour, endHour };
    }

    /**
     * 生成传统时间段（完整时间范围）
     */
    private generateTraditionalTimeSlots(tasks: ParsedTask[]): Date[] {
        const timeRange = this.getTimeRange(tasks);
        if (!timeRange) return [];
        
        return TimeParser.generateTimeSlots(
            timeRange.startHour,
            timeRange.endHour,
            this.options.intervalMinutes
        );
    }

    /**
     * 生成动态时间段，只包含有任务的时间段及其相邻时间段
     */
    private generateDynamicTimeSlots(tasks: ParsedTask[]): Date[] {
        const tasksWithTime = tasks.filter(task => task.startTime || task.dueTime);

        if (tasksWithTime.length === 0) return [];

        // 获取所有任务的时间范围
        const taskTimeRanges: { start: Date, end: Date }[] = [];
        
        for (const task of tasksWithTime) {
            const startTime = task.startTime || task.dueTime;
            if (!startTime) continue;
            
            let endTime: Date;
            if (task.endTime) {
                endTime = task.endTime;
            } else if (task.duration && task.duration > 0) {
                endTime = new Date(startTime.getTime() + task.duration * 60 * 1000);
            } else {
                // 默认30分钟
                endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
            }
            
            taskTimeRanges.push({ start: startTime, end: endTime });
        }

        // 合并重叠的时间范围
        const mergedRanges = this.mergeTimeRanges(taskTimeRanges);
        
        // 暂时禁用智能分组，显示所有任务时间段
        // 这样确保所有任务都能在正确的时间轴位置显示  
        const rangesForSlots = mergedRanges;
        
        // 为每个选定的时间范围生成时间槽，并添加缓冲时间
        const allSlots: Date[] = [];
        const intervalMs = this.options.intervalMinutes * 60 * 1000;
        
        for (const range of rangesForSlots) {
            // 简化逻辑：直接使用任务的实际时间范围，只添加最小缓冲
            const bufferStart = new Date(range.start.getTime() - intervalMs);
            const bufferEnd = new Date(range.end.getTime() + intervalMs);
            
            
            // 生成这个范围内的时间槽
            const rangeSlots = this.generateTimeSlotsForRange(bufferStart, bufferEnd);
            
            
            // 合并到总的时间槽列表中（避免重复）
            for (const slot of rangeSlots) {
                if (!allSlots.some(existing => existing.getTime() === slot.getTime())) {
                    allSlots.push(slot);
                }
            }
        }
        
        // 按时间排序
        allSlots.sort((a, b) => a.getTime() - b.getTime());
        return allSlots;
    }

    /**
     * 合并重叠的时间范围
     */
    private mergeTimeRanges(ranges: { start: Date, end: Date }[]): { start: Date, end: Date }[] {
        if (ranges.length === 0) return [];
        
        // 按开始时间排序
        const sortedRanges = ranges.sort((a, b) => a.start.getTime() - b.start.getTime());
        const merged: { start: Date, end: Date }[] = [sortedRanges[0]];
        
        for (let i = 1; i < sortedRanges.length; i++) {
            const current = sortedRanges[i];
            const lastMerged = merged[merged.length - 1];
            
            // 如果当前范围与最后一个合并范围重叠或相邻（考虑2小时的缓冲间隔）
            const bufferTime = 2 * 60 * 60 * 1000; // 2小时的缓冲时间，避免过度分割
            if (current.start.getTime() <= lastMerged.end.getTime() + bufferTime) {
                // 合并范围，扩展结束时间
                lastMerged.end = new Date(Math.max(lastMerged.end.getTime(), current.end.getTime()));
            } else {
                // 不重叠，添加新的范围
                merged.push(current);
            }
        }
        
        return merged;
    }

    /**
     * 为指定时间范围生成时间槽
     */
    private generateTimeSlotsForRange(startTime: Date, endTime: Date): Date[] {
        const slots: Date[] = [];
        const intervalMs = this.options.intervalMinutes * 60 * 1000;
     // 检查是否跨夜：如果结束时间小于开始时间，说明跨夜了
        if (endTime.getTime() < startTime.getTime()) {
            // 将结束时间调整到第二天
            const adjustedEndTime = new Date(endTime);
            adjustedEndTime.setDate(adjustedEndTime.getDate() + 1);
            return this.generateTimeSlotsForRange(startTime, adjustedEndTime);
        }
        
        // 将开始时间对齐到时间间隔边界
        const alignedStart = this.alignTimeToInterval(startTime);
        
        let currentTime = new Date(alignedStart);
        
        while (currentTime <= endTime) {
            slots.push(new Date(currentTime));
            currentTime = new Date(currentTime.getTime() + intervalMs);
        }
        
        return slots;
    }

    /**
     * 将时间对齐到时间间隔边界
     */
    private alignTimeToInterval(time: Date): Date {
        const intervalMinutes = this.options.intervalMinutes;
        const minutes = time.getMinutes();
        const alignedMinutes = Math.floor(minutes / intervalMinutes) * intervalMinutes;
        
        return new Date(
            time.getFullYear(),
            time.getMonth(),
            time.getDate(),
            time.getHours(),
            alignedMinutes,
            0,
            0
        );
    }

    /**
     * 计算竖向任务在时间轴中的位置和高度，基于实际可见的时间槽
     */
    private calculateVerticalTaskPosition(startTime: Date, endTime: Date, timeSlots: Date[], container?: HTMLElement): { top: number, height: number } | null {
        if (timeSlots.length === 0) return null;
        
        const firstSlot = timeSlots[0];
        const slotDuration = this.options.intervalMinutes * 60 * 1000; // 转换为毫秒
        const slotHeight = 60; // 每个时间槽的高度（像素）
        
        // 尝试获取实际可见的时间槽来进行更精确的位置计算
        let visibleSlotOffsets: number[] = [];
        const slotDetails: Array<{time: string, height: number, offset: number}> = [];
        
        if (container && !this.cachedSlotOffsets) {
            const timelineContainer = container.closest('.timeline-vertical');
            const visibleSlots = timelineContainer?.querySelectorAll('.timeline-slot');
            
            if (visibleSlots && visibleSlots.length > 0) {
                // 计算每个可见时间槽的累计偏移
                let cumulativeOffset = 0;
                visibleSlotOffsets = [];
                
                for (let i = 0; i < visibleSlots.length; i++) {
                    const slot = visibleSlots[i] as HTMLElement;
                    const timeLabel = slot.querySelector('.timeline-time-label');
                    const timeText = timeLabel?.textContent || `Slot ${i}`;
                    
                    visibleSlotOffsets.push(cumulativeOffset);
                    
                    // 检查时间槽是否被隐藏或高度为0
                    const rect = slot.getBoundingClientRect();
                    const computedStyle = window.getComputedStyle(slot);
                    const actualHeight = rect.height || parseInt(computedStyle.height) || slotHeight;
                    
                    slotDetails.push({
                        time: timeText,
                        height: actualHeight,
                        offset: cumulativeOffset
                    });
                    
                    cumulativeOffset += actualHeight;
                }
                
                // 缓存计算结果
                this.cachedSlotOffsets = visibleSlotOffsets;
            }
        } else if (this.cachedSlotOffsets) {
            visibleSlotOffsets = this.cachedSlotOffsets;
        }
        
        // 计算任务开始位置（相对于第一个时间槽）
        const startOffset = startTime.getTime() - firstSlot.getTime();
        const startSlotIndex = Math.floor(startOffset / slotDuration);
        const startPositionInSlot = (startOffset % slotDuration) / slotDuration;
        
        // 计算任务结束位置
        const endOffset = endTime.getTime() - firstSlot.getTime();
        const endSlotIndex = Math.floor(endOffset / slotDuration);
        const endPositionInSlot = (endOffset % slotDuration) / slotDuration;
        
        // 修复：使用实际时间槽序列而不是假设的连续索引
        let top: number;
        let height: number;
        
        if (visibleSlotOffsets.length > 0) {
            // 在实际时间槽中查找最接近的时间槽
            let actualStartSlotIndex = -1;
            let actualEndSlotIndex = -1;
            
            // 查找任务开始时间对应的实际时间槽索引
            for (let i = 0; i < timeSlots.length; i++) {
                const slotTime = timeSlots[i].getTime();
                const nextSlotTime = i < timeSlots.length - 1 ? timeSlots[i + 1].getTime() : slotTime + slotDuration;
                
                if (startTime.getTime() >= slotTime && startTime.getTime() < nextSlotTime) {
                    actualStartSlotIndex = i;
                    break;
                }
            }
            
            // 查找任务结束时间对应的实际时间槽索引
            for (let i = 0; i < timeSlots.length; i++) {
                const slotTime = timeSlots[i].getTime();
                const nextSlotTime = i < timeSlots.length - 1 ? timeSlots[i + 1].getTime() : slotTime + slotDuration;
                
                if (endTime.getTime() >= slotTime && endTime.getTime() < nextSlotTime) {
                    actualEndSlotIndex = i;
                    break;
                }
            }
            
            if (actualStartSlotIndex >= 0 && actualStartSlotIndex < visibleSlotOffsets.length) {
                const slotStartTime = timeSlots[actualStartSlotIndex].getTime();
                const positionInSlot = (startTime.getTime() - slotStartTime) / slotDuration;
                top = visibleSlotOffsets[actualStartSlotIndex] + positionInSlot * slotHeight;
                
                if (actualEndSlotIndex >= 0 && actualEndSlotIndex < visibleSlotOffsets.length) {
                    const endSlotStartTime = timeSlots[actualEndSlotIndex].getTime();
                    const endPositionInSlot = (endTime.getTime() - endSlotStartTime) / slotDuration;
                    const endTop = visibleSlotOffsets[actualEndSlotIndex] + endPositionInSlot * slotHeight;
                    height = Math.max(20, endTop - top);
                } else {
                    height = slotHeight; // 默认一个时间槽的高度
                }
            } else {
                // 回退到原始计算
                top = startSlotIndex * slotHeight + startPositionInSlot * slotHeight;
                const totalSlots = endSlotIndex - startSlotIndex;
                height = totalSlots * slotHeight + (endPositionInSlot - startPositionInSlot) * slotHeight;
            }
        } else {
            // 回退到原始计算方法
            top = startSlotIndex * slotHeight + startPositionInSlot * slotHeight;
            const totalSlots = endSlotIndex - startSlotIndex;
            height = totalSlots * slotHeight + (endPositionInSlot - startPositionInSlot) * slotHeight;
        }

        
        return {
            top: Math.max(0, top),
            height: Math.max(20, height) // 最小高度20px
        };
    }


    /**
     * 添加拖拽功能
     */
    private addDragFunctionality(element: HTMLElement, task: ParsedTask): void {
        if (!this.dragHandler) return;
        
        const dragData: DragEventData = {
            taskName: task.name,
            originalLine: task.originalLine,
            startTime: task.startTime,
            duration: task.duration
        };
        
        this.dragHandler.addDragToTask(element, dragData);
    }


    /**
     * 计算重叠任务的布局
     */
    private calculateOverlapLayout(tasks: ParsedTask[]): { task: ParsedTask, offset: number, width: number, groupSize: number }[] {
        // 使用分组+扫描线（列分配）算法以降低复杂度
        const taskRanges = tasks
            .map(task => {
                const startTime = task.startTime || task.dueTime;
                if (!startTime) return null;

                let endTime: Date;
                if (task.endTime) {
                    endTime = task.endTime;
                } else if (task.duration && task.duration > 0) {
                    endTime = new Date(startTime.getTime() + task.duration * 60 * 1000);
                } else {
                    endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
                }

                return {
                    task,
                    startTime,
                    endTime,
                    startMs: startTime.getTime(),
                    endMs: endTime.getTime(),
                };
            })
            .filter(Boolean) as Array<{
                task: ParsedTask;
                startTime: Date;
                endTime: Date;
                startMs: number;
                endMs: number;
            }>;

        if (taskRanges.length === 0) return [];

        // 按开始时间排序
        taskRanges.sort((a, b) => a.startMs - b.startMs);

        const result: { task: ParsedTask; offset: number; width: number; groupSize: number }[] = [];

        // 将重叠的任务划分为若干组（相互重叠或相邻视为一组）
        const groups: Array<typeof taskRanges> = [];
        let currentGroup: typeof taskRanges = [];
        let currentGroupEnd = -Infinity;

        for (const tr of taskRanges) {
            if (tr.startMs <= currentGroupEnd) {
                currentGroup.push(tr);
                currentGroupEnd = Math.max(currentGroupEnd, tr.endMs);
            } else {
                if (currentGroup.length > 0) groups.push(currentGroup);
                currentGroup = [tr];
                currentGroupEnd = tr.endMs;
            }
        }
        if (currentGroup.length > 0) groups.push(currentGroup);

        const baseWidth = 100;

        // 对每个组使用贪心列分配（first-fit）为每个任务分配列
        for (const group of groups) {
            // 按开始时间排序（组内已近似排序，但确保稳定）
            group.sort((a, b) => a.startMs - b.startMs);

            const columnEndTimes: number[] = []; // 每列的当前结束时间
            const assignments: Map<ParsedTask, number> = new Map();

            for (const tr of group) {
                // 找到第一个可复用的列
                let assignedCol = -1;
                for (let c = 0; c < columnEndTimes.length; c++) {
                    if (tr.startMs >= columnEndTimes[c]) {
                        assignedCol = c;
                        columnEndTimes[c] = tr.endMs;
                        break;
                    }
                }

                if (assignedCol === -1) {
                    assignedCol = columnEndTimes.length;
                    columnEndTimes.push(tr.endMs);
                }

                assignments.set(tr.task, assignedCol);
            }

            const groupSize = Math.max(1, columnEndTimes.length);
            let taskWidth = Math.max(baseWidth / groupSize, 50);
            if (groupSize === 3) taskWidth = taskWidth * 0.68;
            else if (groupSize > 3) taskWidth = taskWidth * 0.5;

            // 生成结果（offset 为百分比）
            for (const tr of group) {
                const col = assignments.get(tr.task) ?? 0;
                const offsetPercentage = (baseWidth / groupSize) * col;
                result.push({
                    task: tr.task,
                    offset: offsetPercentage,
                    width: taskWidth,
                    groupSize,
                });
            }
        }

        return result;
    }

    /**
     * 处理任务更新
     */
    private handleTaskUpdate(oldLine: string, newLine: string): void {
        if (!this.currentContent) {
            console.warn('No current content available');
            return;
        }
        
        // 保存原始内容
        const oldContent = this.currentContent;
        
        // 更新内容中的任务行
        const updatedContent = this.currentContent.replace(oldLine, newLine);

        
        // 保存更新后的内容
        this.currentContent = updatedContent;
        
        // 强制清空容器以确保完全重新渲染
        this.containerEl.empty();
        
        // 重新渲染以反映更改
        this.render(updatedContent);
        
        
        // 触发内容更新事件（如果需要保存到文件）
        this.containerEl.dispatchEvent(new CustomEvent('timeline-content-updated', {
            detail: { oldContent, newContent: updatedContent, oldLine, newLine }
        }));
    }

    /**
     * 为任务内容区域添加点击编辑功能
     */
    private addTaskEditFunctionality(taskElement: HTMLElement, task: ParsedTask): void {
        // 查找任务内容区域
        const taskContent = taskElement.querySelector('.timeline-task-content') as HTMLElement;
        if (!taskContent) return;
        
        taskContent.addEventListener('click', (event) => {
            // 防止拖拽时触发编辑
            if (taskElement.classList.contains('dragging')) {
                return;
            }
            
            // 检查点击的是否是任务点（避免冲突）
            const target = event.target as HTMLElement;
            if (target.classList.contains('timeline-task-dot') || target.classList.contains('clickable-toggle')) {
                return; // 如果点击的是任务点，不触发编辑
            }
            
            event.preventDefault();
            event.stopPropagation();
            
            this.openTaskEditModal(task);
        });
        
        // 添加视觉提示
        taskContent.style.cursor = 'pointer';
        taskContent.title = '点击编辑任务';
    }

    /**
     * 切换任务完成状态
     */
    private toggleTaskCompletion(task: ParsedTask): void {
        // 构建新的任务行，切换完成状态
        let newTaskLine = task.originalLine;
        
        if (task.completed) {
            // 从完成变为未完成: [x] -> [ ]
            newTaskLine = newTaskLine.replace(/^(\s*)-\s*\[x\]/i, '$1- [ ]');
        } else {
            // 从未完成变为完成: [ ] -> [x]
            newTaskLine = newTaskLine.replace(/^(\s*)-\s*\[\s*\]/i, '$1- [x]');
        }
        
        // 更新任务状态
        task.completed = !task.completed;
        
        // 更新内容
        this.handleTaskUpdate(task.originalLine, newTaskLine);
        
        // 更新任务的原始行引用
        task.originalLine = newTaskLine;
    }

    /**
     * 打开任务编辑模态框
     */
    private openTaskEditModal(task: ParsedTask): void {
        // 转换ParsedTask到Task类型
        const taskForEdit: Task = {
            name: task.name,
            id: `task-${Date.now()}`, // 临时ID
            completed: task.completed,
            startTime: task.startTime ? TimeParser.formatTime(task.startTime) : null,
            dueTime: task.dueTime ? TimeParser.formatTime(task.dueTime) : null,
            duration: task.duration || null
        };

        const modal = new TaskEditModal(this.app, taskForEdit, (editedData: TaskEditData) => {
            this.updateTaskFromEditData(task, editedData);
        });
        
        modal.open();
    }

    /**
     * 根据编辑数据更新任务
     */
    private updateTaskFromEditData(originalTask: ParsedTask, editedData: TaskEditData): void {
        // 构建新的任务行
        let newTaskLine = `- [${originalTask.completed ? 'x' : ' '}] ${editedData.name}`;
        
        // 添加时间信息
        if (editedData.startTime && editedData.duration) {
            const startTimeStr = TimeParser.formatTime(editedData.startTime);
            newTaskLine += ` @${startTimeStr}+${this.formatDurationForTaskLine(editedData.duration)}`;
        } else if (editedData.startTime) {
            const startTimeStr = TimeParser.formatTime(editedData.startTime);
            newTaskLine += ` @${startTimeStr}`;
        }
        
        // 添加截止时间
        if (editedData.dueTime && editedData.dueTime !== editedData.startTime) {
            const dueTimeStr = TimeParser.formatTime(editedData.dueTime);
            newTaskLine += ` due:${dueTimeStr}`;
        }
        
        // 更新任务数据
        originalTask.name = editedData.name;
        originalTask.startTime = editedData.startTime;
        originalTask.duration = editedData.duration;
        originalTask.dueTime = editedData.dueTime;
        
        // 如果有持续时间和开始时间，计算结束时间
        if (editedData.startTime && editedData.duration) {
            originalTask.endTime = new Date(editedData.startTime.getTime() + editedData.duration * 60 * 1000);
        }
        
        // 更新内容
        this.handleTaskUpdate(originalTask.originalLine, newTaskLine);
        
        // 更新任务的原始行引用
        originalTask.originalLine = newTaskLine;
    }

    /**
     * 格式化持续时间为任务行格式
     */
    private formatDurationForTaskLine(minutes: number): string {
        if (minutes < 60) {
            return `${minutes}min`;
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        if (remainingMinutes === 0) {
            return `${hours}h`;
        }
        return `${hours}h${remainingMinutes}min`;
    }

    /**
     * 添加当前时间指示器
     */
    private addCurrentTimeIndicator(timelineGrid: HTMLElement, timeSlots: Date[]): void {
        const now = new Date();
        
        // 找到当前时间应该在哪个位置
        const position = this.calculateTimePosition(now, timeSlots);
        if (position < 0) return; // 当前时间不在显示范围内
        
        // 创建当前时间指示器
        this.currentTimeIndicator = timelineGrid.createDiv('timeline-current-time');
        this.currentTimeIndicator.style.position = 'absolute';
        this.currentTimeIndicator.style.top = `${position}px`;
        this.currentTimeIndicator.style.left = '0';
        this.currentTimeIndicator.style.right = '0';
        this.currentTimeIndicator.style.height = '3px';
        this.currentTimeIndicator.style.backgroundColor = '#ff4444';
        this.currentTimeIndicator.style.boxShadow = '0 0 8px rgba(255, 68, 68, 0.6)';
        this.currentTimeIndicator.style.zIndex = '9999';
        this.currentTimeIndicator.style.pointerEvents = 'none';
        this.currentTimeIndicator.style.borderRadius = '1px';
        this.currentTimeIndicator.style.transition = 'top 0.5s ease-in-out';
        
        // 添加时间标签（显示在左侧）
        const timeLabel = this.currentTimeIndicator.createSpan('current-time-label');
        timeLabel.setText(`现在 ${TimeParser.formatTime(now)}`);
        timeLabel.style.position = 'absolute';
        timeLabel.style.left = '15px';
        timeLabel.style.top = '-12px';
        timeLabel.style.fontSize = '11px';
        timeLabel.style.fontWeight = 'bold';
        timeLabel.style.color = '#ff4444';
        timeLabel.style.backgroundColor = 'var(--background-primary)';
        timeLabel.style.padding = '3px 8px';
        timeLabel.style.borderRadius = '12px';
        timeLabel.style.border = '1px solid #ff4444';
        timeLabel.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
        timeLabel.style.whiteSpace = 'nowrap';
        timeLabel.style.zIndex = '10000';
        
        // 启动定时更新
        this.startTimelineUpdates();
    }

    /**
     * 计算时间在时间轴上的位置
     */
    private calculateTimePosition(time: Date, timeSlots: Date[]): number {
        if (timeSlots.length === 0) return -1;
        
        const startTime = timeSlots[0];
        const endTime = timeSlots[timeSlots.length - 1];
        
        // 扩展显示范围，允许当前时间在开始时间之前30分钟或结束时间之后30分钟内显示
        const extendedStartTime = new Date(startTime.getTime() - 30 * 60 * 1000);
        const extendedEndTime = new Date(endTime.getTime() + 30 * 60 * 1000);
        
        // 如果时间不在扩展范围内，返回-1
        if (time < extendedStartTime || time > extendedEndTime) return -1;
        
        // 计算当前时间相对于开始时间的分钟数
        const currentMinutes = (time.getTime() - startTime.getTime()) / (1000 * 60);
        
        // 每个时间槽高度为60px
        const slotHeight = 60;
        const intervalMinutes = this.options.intervalMinutes;
        const pixelsPerMinute = slotHeight / intervalMinutes;
        
        // 更精确的位置计算
        return currentMinutes * pixelsPerMinute;
    }

    /**
     * 启动时间轴定时更新
     */
    private startTimelineUpdates(): void {
        // 清除现有定时器
        if (this.updateTimer) {
            window.clearInterval(this.updateTimer);
        }
        
        // 每30秒更新一次，让红线移动更加平滑
        this.updateTimer = window.setInterval(() => {
            this.updateCurrentTimeIndicator();
        }, 60000); // 60秒
        
        // 立即执行一次更新
        this.updateCurrentTimeIndicator();
    }

    /**
     * 更新当前时间指示器位置
     */
    private updateCurrentTimeIndicator(): void {
        if (!this.currentTimeIndicator) return;
        
        const now = new Date();
        const timelineGrid = this.currentTimeIndicator.parentElement;
        if (!timelineGrid) return;
        
        // 获取当前时间槽
        const timeSlots = this.getCurrentTimeSlots();
        const position = this.calculateTimePosition(now, timeSlots);
        
        if (position >= 0) {
            this.currentTimeIndicator.style.top = `${position}px`;
            const timeLabel = this.currentTimeIndicator.querySelector('.current-time-label') as HTMLElement;
            if (timeLabel) {
                timeLabel.setText(`现在 ${TimeParser.formatTime(now)}`);
            }
            this.currentTimeIndicator.style.display = 'block';
        } else {
            // 当前时间不在显示范围内，隐藏指示器
            this.currentTimeIndicator.style.display = 'none';
        }
    }

    /**
     * 获取当前显示的时间槽
     */
    private getCurrentTimeSlots(): Date[] {
        // 这里需要根据当前显示的时间轴重新计算时间槽
        // 简化实现：从当前内容重新解析任务并生成时间槽
        if (!this.currentContent) return [];
        
        const tasks = this.parseTasksFromContent(this.currentContent);
        const tasksWithTime = tasks.filter(task => task.startTime || task.dueTime);
        
        return this.options.dynamicTimeSlots 
            ? this.generateDynamicTimeSlots(tasksWithTime)
            : this.generateTraditionalTimeSlots(tasksWithTime);
    }

    /**
     * 清理定时器
     */
    onunload(): void {
        if (this.updateTimer) {
            window.clearInterval(this.updateTimer);
            this.updateTimer = undefined;
        }
        super.onunload();
    }
}