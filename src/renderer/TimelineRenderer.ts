import { MarkdownRenderChild, App } from 'obsidian';
import { TimeParser } from '../utils/TimeParser';
import { TimelineDragHandler, DragEventData } from './TimelineDragHandler';
import { TaskEditModal, TaskEditData } from '../modal/TaskEditModal';
import { Task } from '../model/Task';

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

    constructor(container: HTMLElement, app: App, options?: Partial<TimelineOptions>) {
        super(container);
        this.app = app;
        this.options = {
            layout: 'vertical',
            intervalMinutes: 30,
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

            // 添加调试信息
            console.log('Timeline tasks:', sortedTasks);

            // 根据布局创建时间轴
            await this.createVerticalTimeline(timelineContainer, sortedTasks);
            
            // 初始化拖拽功能
            if (this.options.enableDragging) {
                this.dragHandler = new TimelineDragHandler(
                    timelineContainer,
                    this.options.intervalMinutes,
                    (oldLine, newLine) => this.handleTaskUpdate(oldLine, newLine)
                );
                // 设置拖拽目标区域
                this.dragHandler.setupDropZones();
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
                    originalLine: trimmedLine
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
                
                // 创建任务覆盖层，让任务可以跨越时间槽
                const tasksOverlay = timeline.createDiv('timeline-tasks-overlay');
                
                // 设置时间轴容器的最小高度，确保能包含所有时间槽
                const totalHeight = timeSlots.length * 60; // 每个时间槽60px高度
                timeline.style.minHeight = `${totalHeight}px`;
                
                console.log('Timeline debugging:');
                console.log('  Total time slots:', timeSlots.length);
                console.log('  First slot:', timeSlots[0]);
                console.log('  Last slot:', timeSlots[timeSlots.length - 1]);
                console.log('  Container height set to:', totalHeight, 'px');
                
                // 计算任务重叠布局
                const taskLayout = this.calculateOverlapLayout(tasksWithTime);
                
                // 为每个任务创建完整的元素
                for (const taskInfo of taskLayout) {
                    this.createVerticalTaskWhole(tasksOverlay, taskInfo.task, timeSlots, taskInfo.offset, taskInfo.width);
                }
                
                // 添加当前时间线
                this.createCurrentTimeLine(tasksOverlay, timeSlots);
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
     * 创建跨越时间段的完整竖向任务元素
     */
    private createVerticalTaskWhole(
        container: HTMLElement, 
        task: ParsedTask, 
        timeSlots: Date[], 
        offsetPercentage = 0, 
        widthPercentage = 100
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
        const taskPosition = this.calculateVerticalTaskPosition(taskStartTime, taskEndTime, timeSlots);
        if (!taskPosition) return;
        
        // 创建任务元素
        const taskElement = container.createDiv('timeline-task-vertical-whole');
        taskElement.addClass(task.completed ? 'completed' : 'pending');
        
        // 计算左边距和宽度（考虑重叠偏移）
        const baseLeft = 95; // 基础左边距（时间标签之后）
        const totalContainerWidth = container.clientWidth || 400; // 容器总宽度
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
        
        // 调试日志
        console.log(`Task: ${task.name}, offset: ${offsetPercentage}%, width: ${widthPercentage}%, left: ${baseLeft + offsetPixels}px, width: ${widthPixels}px`);
        
        // 创建任务点
        taskElement.createDiv('timeline-task-dot');
        
        // 创建任务内容
        const taskContent = taskElement.createDiv('timeline-task-content');
        
        const taskName = taskContent.createDiv('timeline-task-name');
        taskName.setText(task.name);
        
        // 时间范围显示（包含持续时间）
        if (task.startTime && task.endTime) {
            const timeRange = taskContent.createDiv('timeline-task-time-range');
            const timeRangeText = `${TimeParser.formatTime(task.startTime)} - ${TimeParser.formatTime(task.endTime)}`;
            // 如果有持续时间，添加到时间范围后面
            if (task.duration) {
                timeRange.setText(`${timeRangeText} (${TimeParser.formatDuration(task.duration)})`);
            } else {
                timeRange.setText(timeRangeText);
            }
        } else if (task.startTime && task.duration) {
            const endTime = new Date(task.startTime.getTime() + task.duration * 60 * 1000);
            const timeRange = taskContent.createDiv('timeline-task-time-range');
            const timeRangeText = `${TimeParser.formatTime(task.startTime)} - ${TimeParser.formatTime(endTime)}`;
            timeRange.setText(`${timeRangeText} (${TimeParser.formatDuration(task.duration)})`);
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
     * 创建竖向任务元素（保留用于兼容性）
     */
    private createVerticalTask(container: HTMLElement, task: ParsedTask, segment: 'start' | 'middle' | 'end' | 'single' = 'single'): void {
        const taskElement = container.createDiv('timeline-task-vertical');
        taskElement.addClass(task.completed ? 'completed' : 'pending');
        
        // 创建任务点
        taskElement.createDiv('timeline-task-dot');
        
        // 创建任务内容
        const taskContent = taskElement.createDiv('timeline-task-content');
        
        const taskName = taskContent.createDiv('timeline-task-name');
        taskName.setText(task.name);
        
        // 时间范围显示（包含持续时间）
        if (task.startTime && task.endTime) {
            const timeRange = taskContent.createDiv('timeline-task-time-range');
            const timeRangeText = `${TimeParser.formatTime(task.startTime)} - ${TimeParser.formatTime(task.endTime)}`;
            // 如果有持续时间，添加到时间范围后面
            if (task.duration) {
                timeRange.setText(`${timeRangeText} (${TimeParser.formatDuration(task.duration)})`);
            } else {
                timeRange.setText(timeRangeText);
            }
        } else if (task.startTime && task.duration) {
            const endTime = new Date(task.startTime.getTime() + task.duration * 60 * 1000);
            const timeRange = taskContent.createDiv('timeline-task-time-range');
            const timeRangeText = `${TimeParser.formatTime(task.startTime)} - ${TimeParser.formatTime(endTime)}`;
            timeRange.setText(`${timeRangeText} (${TimeParser.formatDuration(task.duration)})`);
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
        console.log('Dynamic time slots generation:');
        console.log('  Tasks with time:', tasksWithTime.length);
        console.log('  Task details:', tasksWithTime.map(t => ({
            name: t.name,
            startTime: t.startTime?.toLocaleTimeString(),
            endTime: t.endTime?.toLocaleTimeString(),
            dueTime: t.dueTime?.toLocaleTimeString()
        })));
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
        
        // 检查时间范围是否分散过大，如果跨度超过12小时则只显示主要时间段
        const allRangesStart = new Date(Math.min(...mergedRanges.map(r => r.start.getTime())));
        const allRangesEnd = new Date(Math.max(...mergedRanges.map(r => r.end.getTime())));
        const totalSpan = (allRangesEnd.getTime() - allRangesStart.getTime()) / (1000 * 60 * 60); // 小时
        
        console.log('  Total time span:', totalSpan.toFixed(1), 'hours');
        
        let rangesForSlots = mergedRanges;
        if (totalSpan > 12) {
            // 如果总跨度超过12小时，优先显示晚间和跨夜任务
            const eveningRanges = mergedRanges.filter(range => range.start.getHours() >= 18 || range.end.getHours() <= 6);
            if (eveningRanges.length > 0) {
                console.log('  Using evening/cross-day ranges only due to large time span');
                rangesForSlots = eveningRanges;
            }
        }
        
        // 为每个选定的时间范围生成时间槽，并添加缓冲时间
        const allSlots: Date[] = [];
        const intervalMs = this.options.intervalMinutes * 60 * 1000;
        
        for (const range of rangesForSlots) {
            // 向前扩展一个时间间隔作为缓冲，但要智能限制
            const bufferStart = new Date(range.start.getTime() - intervalMs);
            
            // 计算合理的最早开始时间：任务开始时间前2小时，但不早于6:00
            const taskStartHour = range.start.getHours();
            const reasonableEarliestHour = Math.max(6, taskStartHour - 2);
            
            console.log('  Range calculation for task:', {
                rangeStart: range.start.toLocaleTimeString(),
                taskStartHour,
                reasonableEarliestHour,
                bufferStart: bufferStart.toLocaleTimeString()
            });
            
            const reasonableStart = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate(), reasonableEarliestHour, 0, 0);
            // 使用更早的时间作为实际开始时间（reasonableStart vs bufferStart）
            const actualStart = new Date(Math.min(bufferStart.getTime(), reasonableStart.getTime()));
            
            console.log('  Actual time range:', {
                reasonableStart: reasonableStart.toLocaleTimeString(),
                actualStart: actualStart.toLocaleTimeString()
            });
            
            // 向后扩展一个时间间隔作为缓冲（可延伸到第二天凌晨1点）
            const bufferEnd = new Date(range.end.getTime() + intervalMs);
            const nextDayLimit = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate() + 1, 1, 0, 0);
            const actualEnd = new Date(Math.min(bufferEnd.getTime(), nextDayLimit.getTime()));
            
            console.log('  End time calculation:', {
                rangeEnd: range.end.toLocaleTimeString(),
                bufferEnd: bufferEnd.toLocaleTimeString(),
                actualEnd: actualEnd.toLocaleTimeString()
            });
            
            // 生成这个范围内的时间槽
            console.log('  Generating slots from', actualStart.toLocaleTimeString(), 'to', actualEnd.toLocaleTimeString());
            const rangeSlots = this.generateTimeSlotsForRange(actualStart, actualEnd);
            console.log('  Generated', rangeSlots.length, 'slots for this range');
            
            // 合并到总的时间槽列表中（避免重复）
            for (const slot of rangeSlots) {
                if (!allSlots.some(existing => existing.getTime() === slot.getTime())) {
                    allSlots.push(slot);
                }
            }
        }
        
        // 按时间排序
        allSlots.sort((a, b) => a.getTime() - b.getTime());
        
        console.log('Dynamic time slots generated:', allSlots.length, 'slots');
        console.log('First few slots:', allSlots.slice(0, 5).map(slot => TimeParser.formatTime(slot)));
        console.log('Last few slots:', allSlots.slice(-5).map(slot => TimeParser.formatTime(slot)));
        
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
        
        console.log('  generateTimeSlotsForRange called with:');
        console.log('    startTime:', startTime.toISOString());
        console.log('    endTime:', endTime.toISOString());
        console.log('    startTime timestamp:', startTime.getTime());
        console.log('    endTime timestamp:', endTime.getTime());
        console.log('    endTime > startTime?', endTime.getTime() > startTime.getTime());
        
        // 检查是否跨夜：如果结束时间小于开始时间，说明跨夜了
        if (endTime.getTime() < startTime.getTime()) {
            console.log('  Detected cross-day time range, adjusting endTime to next day');
            // 将结束时间调整到第二天
            const adjustedEndTime = new Date(endTime);
            adjustedEndTime.setDate(adjustedEndTime.getDate() + 1);
            console.log('    adjusted endTime:', adjustedEndTime.toISOString());
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
     * 获取指定时间段的任务（简化版，用于兼容性）
     */
    private getTasksForTimeSlot(tasks: ParsedTask[], slot: Date): ParsedTask[] {
        const nextSlotTime = new Date(slot.getTime() + this.options.intervalMinutes * 60 * 1000);
        
        return tasks.filter(task => {
            const taskTime = task.startTime || task.dueTime;
            if (!taskTime) return false;
            
            return taskTime >= slot && taskTime < nextSlotTime;
        });
    }

    /**
     * 计算任务在横向时间轴中的位置和宽度
     */
    private calculateTaskPositionAndWidth(task: ParsedTask, timeSlots: Date[]): { left: number, width: number } {
        const startSlot = timeSlots[0];
        const endSlot = timeSlots[timeSlots.length - 1];
        const totalDuration = endSlot.getTime() - startSlot.getTime();
        
        // 确定任务的开始时间
        const taskStartTime = task.startTime || task.dueTime;
        if (!taskStartTime) {
            return { left: 0, width: (1 / (timeSlots.length - 1)) * 100 };
        }
        
        // 计算任务开始位置
        const taskStartOffset = taskStartTime.getTime() - startSlot.getTime();
        const leftPosition = Math.max(0, Math.min(100, (taskStartOffset / totalDuration) * 100));
        
        // 计算任务宽度
        let taskWidth: number;
        
        if (task.endTime) {
            // 如果有结束时间，使用结束时间计算宽度
            const taskEndOffset = task.endTime.getTime() - startSlot.getTime();
            const rightPosition = Math.max(0, Math.min(100, (taskEndOffset / totalDuration) * 100));
            taskWidth = Math.max(1, rightPosition - leftPosition); // 最小宽度为1%
        } else if (task.duration) {
            // 如果有持续时间，使用持续时间计算宽度
            const taskDuration = task.duration * 60 * 1000; // 转换为毫秒
            taskWidth = Math.min(100 - leftPosition, (taskDuration / totalDuration) * 100);
        } else {
            // 默认宽度为一个时间间隔
            taskWidth = (1 / (timeSlots.length - 1)) * 100;
        }
        
        return { left: leftPosition, width: Math.max(1, taskWidth) };
    }

    /**
     * 计算竖向任务在时间轴中的位置和高度
     */
    private calculateVerticalTaskPosition(startTime: Date, endTime: Date, timeSlots: Date[]): { top: number, height: number } | null {
        if (timeSlots.length === 0) return null;
        
        const firstSlot = timeSlots[0];
        const slotDuration = this.options.intervalMinutes * 60 * 1000; // 转换为毫秒
        const slotHeight = 60; // 每个时间槽的高度（像素）
        
        // 计算任务开始位置（相对于第一个时间槽）
        const startOffset = startTime.getTime() - firstSlot.getTime();
        const startSlotIndex = Math.floor(startOffset / slotDuration);
        const startPositionInSlot = (startOffset % slotDuration) / slotDuration;
        
        // 计算任务结束位置
        const endOffset = endTime.getTime() - firstSlot.getTime();
        const endSlotIndex = Math.floor(endOffset / slotDuration);
        const endPositionInSlot = (endOffset % slotDuration) / slotDuration;
        
        // 计算顶部位置
        const top = startSlotIndex * slotHeight + startPositionInSlot * slotHeight;
        
        // 计算高度
        const totalSlots = endSlotIndex - startSlotIndex;
        const height = totalSlots * slotHeight + (endPositionInSlot - startPositionInSlot) * slotHeight;
        
        // 只在位置异常时输出调试信息
        if (top > 1000) {
            console.warn('Unusual task position detected:');
            console.warn('  Task time:', startTime.toLocaleTimeString(), '-', endTime.toLocaleTimeString());
            console.warn('  First slot:', firstSlot.toLocaleTimeString());
            console.warn('  Start slot index:', startSlotIndex, 'Calculated top:', top);
        }
        
        return {
            top: Math.max(0, top),
            height: Math.max(20, height) // 最小高度20px
        };
    }

    /**
     * 计算竖向任务的高度（根据持续时间和片段类型）
     */
    private calculateVerticalTaskHeight(task: ParsedTask, segment: 'start' | 'middle' | 'end' | 'single' = 'single'): number {
        // 基础高度
        const baseHeight = 40;
        
        // 对于跨时间段的任务，每个片段都应该填满当前时间段
        if (segment !== 'single') {
            // 跨时间段任务的每个片段填满整个时间槽（减去一些边距）
            const slotHeight = this.options.intervalMinutes * 1.5; // 每分钟1.5px
            return Math.max(baseHeight, Math.min(150, slotHeight));
        }
        
        // 对于单个时间段内的任务，按原有逻辑计算
        if (task.duration && task.duration > 0) {
            // 每分钟对应的像素高度
            const pixelsPerMinute = 1.5;
            const durationHeight = task.duration * pixelsPerMinute;
            
            // 最小高度40px，最大高度200px
            return Math.max(baseHeight, Math.min(200, durationHeight));
        }
        
        // 如果有开始和结束时间，计算时间差
        if (task.startTime && task.endTime) {
            const durationMinutes = (task.endTime.getTime() - task.startTime.getTime()) / (1000 * 60);
            const pixelsPerMinute = 1.5;
            const durationHeight = durationMinutes * pixelsPerMinute;
            
            return Math.max(baseHeight, Math.min(200, durationHeight));
        }
        
        // 默认返回0，使用CSS的默认高度
        return 0;
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
        
        // 垂直布局不支持调整大小功能
    }

    /**
     * 创建当前时间线
     */
    private createCurrentTimeLine(container: HTMLElement, timeSlots: Date[]): void {
        const now = new Date();
        
        const timelinePosition = this.calculateCurrentTimePosition(now, timeSlots);
        if (timelinePosition) {
            const currentTimeLine = container.createDiv('current-time-line-vertical');
            currentTimeLine.style.position = 'absolute';
            currentTimeLine.style.top = `${timelinePosition.position}px`;
            currentTimeLine.style.left = '0';
            currentTimeLine.style.right = '0';
            currentTimeLine.style.zIndex = '20';
            
            // 添加时间标签
            const timeLabel = currentTimeLine.createDiv('current-time-label');
            timeLabel.setText(`现在 ${TimeParser.formatTime(now)}`);
        }
    }

    /**
     * 计算当前时间在时间轴中的位置
     */
    private calculateCurrentTimePosition(currentTime: Date, timeSlots: Date[]): { position: number } | null {
        if (timeSlots.length === 0) return null;
        
        const firstSlot = timeSlots[0];
        const lastSlot = timeSlots[timeSlots.length - 1];
        
        // 检查当前时间是否在时间轴范围内
        const slotDuration = this.options.intervalMinutes * 60 * 1000; // 转换为毫秒
        const timelineEnd = new Date(lastSlot.getTime() + slotDuration);
        
        if (currentTime < firstSlot || currentTime > timelineEnd) {
            return null; // 当前时间不在时间轴范围内
        }
        
        // 竖向时间轴：计算从顶部的像素距离
        const slotHeight = 60; // 每个时间槽的高度（像素）
        const timeOffset = currentTime.getTime() - firstSlot.getTime();
        const totalDuration = timelineEnd.getTime() - firstSlot.getTime();
        const totalHeight = timeSlots.length * slotHeight;
        
        const position = (timeOffset / totalDuration) * totalHeight;
        return { position: Math.max(0, position) };
    }

    /**
     * 计算重叠任务的布局
     */
    private calculateOverlapLayout(tasks: ParsedTask[]): { task: ParsedTask, offset: number, width: number }[] {
        // 为每个任务计算时间范围
        const taskRanges = tasks.map(task => {
            const startTime = task.startTime || task.dueTime;
            if (!startTime) return null;
            
            let endTime: Date;
            if (task.endTime) {
                endTime = task.endTime;
            } else if (task.duration && task.duration > 0) {
                endTime = new Date(startTime.getTime() + task.duration * 60 * 1000);
            } else {
                endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 默认30分钟
            }
            
            return {
                task,
                startTime,
                endTime,
                startMs: startTime.getTime(),
                endMs: endTime.getTime()
            };
        }).filter(Boolean) as Array<{
            task: ParsedTask;
            startTime: Date;
            endTime: Date;
            startMs: number;
            endMs: number;
        }>;
        
        // 按开始时间排序
        taskRanges.sort((a, b) => a.startMs - b.startMs);
        
        // 计算重叠层级
        const result: { task: ParsedTask, offset: number, width: number }[] = [];
        
        for (let i = 0; i < taskRanges.length; i++) {
            const currentTask = taskRanges[i];
            let overlapLevel = 0;
            
            // 检查与之前任务的重叠情况
            for (let j = 0; j < i; j++) {
                const prevTask = taskRanges[j];
                
                // 检查时间是否重叠
                const isOverlapping = currentTask.startMs < prevTask.endMs && currentTask.endMs > prevTask.startMs;
                
                if (isOverlapping) {
                    overlapLevel++;
                }
            }
            
            // 计算偏移和宽度
            const offsetPercentage = Math.min(overlapLevel * 10, 50); // 最多50%偏移
            const widthPercentage = 100 - offsetPercentage; // 相应减少宽度
            
            result.push({
                task: currentTask.task,
                offset: offsetPercentage,
                width: widthPercentage
            });
        }
        
        return result;
    }

    /**
     * 处理任务更新
     */
    private handleTaskUpdate(oldLine: string, newLine: string): void {
        console.log('Task updated:', { oldLine, newLine });
        
        if (!this.currentContent) return;
        
        // 更新内容中的任务行
        const updatedContent = this.currentContent.replace(oldLine, newLine);
        
        // 保存更新后的内容
        this.currentContent = updatedContent;
        
        // 重新渲染以反映更改
        this.render(updatedContent);
        
        // 触发内容更新事件（如果需要保存到文件）
        this.containerEl.dispatchEvent(new CustomEvent('timeline-content-updated', {
            detail: { oldContent: this.currentContent, newContent: updatedContent, oldLine, newLine }
        }));
    }

    /**
     * 为任务元素添加点击编辑功能
     */
    private addTaskEditFunctionality(taskElement: HTMLElement, task: ParsedTask): void {
        taskElement.addEventListener('click', (event) => {
            // 防止拖拽时触发编辑
            if (taskElement.classList.contains('dragging')) {
                return;
            }
            
            event.preventDefault();
            event.stopPropagation();
            
            this.openTaskEditModal(task);
        });
        
        // 添加视觉提示
        taskElement.style.cursor = 'pointer';
        taskElement.title = '点击编辑任务';
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
}