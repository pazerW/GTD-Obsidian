/**
 * 任务时间信息接口
 */
export interface TaskTimeInfo {
    startTime?: Date;      // 开始时间
    endTime?: Date;        // 结束时间  
    duration?: number;     // 持续时间（分钟）
    dueTime?: Date;        // 截止时间
}

/**
 * 时间解析工具类
 * 支持多种时间格式的解析，30分钟间隔，持续时间解析
 */
export class TimeParser {
    // 30分钟间隔常量
    static readonly INTERVAL_MINUTES = 30;

    /**
     * 解析任务时间字符串，支持开始时间、持续时间、截止时间
     * 支持格式:
     * - @14:30 (开始时间)
     * - @14:30-16:00 (开始时间到结束时间)
     * - @14:30+2h (开始时间+持续时间)
     * - @14:30+90min (开始时间+持续时间分钟)
     * - due:16:00 (截止时间)
     */
    static parseTaskTime(timeStr: string): TaskTimeInfo | null {
        if (!timeStr) return null;

        const trimmed = timeStr.trim();
        
        // 解析截止时间格式: due:HH:mm
        const dueMatch = trimmed.match(/^due:(.+)$/i);
        if (dueMatch) {
            const dueTime = this.parseTime(dueMatch[1]);
            return dueTime ? { dueTime } : null;
        }

        // 解析时间范围格式: @HH:mm-HH:mm
        const rangeMatch = trimmed.match(/^@(.+?)-(.+)$/);
        if (rangeMatch) {
            const startTime = this.parseTime(rangeMatch[1]);
            const endTime = this.parseTime(rangeMatch[2]);
            if (startTime && endTime) {
                // 处理跨夜情况：如果结束时间小于开始时间，说明跨夜了
                let adjustedEndTime = endTime;
                if (endTime.getTime() < startTime.getTime()) {
                    adjustedEndTime = new Date(endTime);
                    adjustedEndTime.setDate(adjustedEndTime.getDate() + 1);
                }
                const duration = Math.round((adjustedEndTime.getTime() - startTime.getTime()) / (1000 * 60));
                return { startTime, duration, endTime: adjustedEndTime };
            }
        }

        // 解析开始时间+持续时间格式: @HH:mm+Xh 或 @HH:mm+Xmin
        const durationMatch = trimmed.match(/^@(.+?)\+(\d+)(h|min|小时|分钟)$/i);
        if (durationMatch) {
            const startTime = this.parseTime(durationMatch[1]);
            if (startTime) {
                let duration = parseInt(durationMatch[2], 10);
                const unit = durationMatch[3].toLowerCase();
                
                if (unit === 'h' || unit === '小时') {
                    duration *= 60; // 转换为分钟
                }
                
                const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
                return { startTime, duration, endTime };
            }
        }

        // 解析简单开始时间格式: @HH:mm
        const simpleMatch = trimmed.match(/^@(.+)$/);
        if (simpleMatch) {
            const startTime = this.parseTime(simpleMatch[1]);
            return startTime ? { startTime } : null;
        }

        return null;
    }

    /**
     * 解析各种时间格式
     * 支持格式:
     * - HH:mm (24小时制，如 14:30)
     * - H:mm (单数字小时，如 9:30)
     * - HH:mm AM/PM (12小时制，如 2:30 PM)
     * - H:mm AM/PM (单数字小时12小时制，如 9:30 AM)
     * - 中文时间 (如 下午2点30分, 上午9点)
     */
    static parseTime(timeStr: string): Date | null {
        if (!timeStr) return null;

        const trimmed = timeStr.trim();
        
        // 尝试24小时制格式 (HH:mm 或 H:mm)
        const time24Match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
        if (time24Match) {
            return this.createTimeFromHourMinute(
                parseInt(time24Match[1], 10),
                parseInt(time24Match[2], 10)
            );
        }

        // 尝试12小时制格式 (H:mm AM/PM)
        const time12Match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/i);
        if (time12Match) {
            let hours = parseInt(time12Match[1], 10);
            const minutes = parseInt(time12Match[2], 10);
            const period = time12Match[3].toUpperCase();

            if (period === 'PM' && hours !== 12) {
                hours += 12;
            } else if (period === 'AM' && hours === 12) {
                hours = 0;
            }

            return this.createTimeFromHourMinute(hours, minutes);
        }

        // 尝试中文时间格式
        const chineseTime = this.parseChineseTime(trimmed);
        if (chineseTime) return chineseTime;

        // 尝试相对时间格式 (如 "in 30 minutes", "30分钟后")
        const relativeTime = this.parseRelativeTime(trimmed);
        if (relativeTime) return relativeTime;

        return null;
    }

    /**
     * 解析中文时间格式
     */
    private static parseChineseTime(timeStr: string): Date | null {
        // 匹配格式: 上午/下午 + 数字 + 点/时 + (可选)数字 + 分
        const chineseMatch = timeStr.match(/^(上午|下午|凌晨|中午|晚上)?(\d{1,2})(点|时)(\d{1,2})?(分)?$/);
        if (chineseMatch) {
            const period = chineseMatch[1];
            let hours = parseInt(chineseMatch[2], 10);
            const minutes = chineseMatch[4] ? parseInt(chineseMatch[4], 10) : 0;

            // 根据时间段调整小时数
            if (period === '下午' && hours < 12) {
                hours += 12;
            } else if (period === '晚上' && hours < 12) {
                hours += 12;
            } else if (period === '上午' && hours === 12) {
                hours = 0;
            } else if (period === '凌晨' && hours === 12) {
                hours = 0;
            }

            return this.createTimeFromHourMinute(hours, minutes);
        }

        // 简化格式: 数字 + 点
        const simpleChineseMatch = timeStr.match(/^(\d{1,2})(点|时)$/);
        if (simpleChineseMatch) {
            const hours = parseInt(simpleChineseMatch[1], 10);
            return this.createTimeFromHourMinute(hours, 0);
        }

        return null;
    }

    /**
     * 解析相对时间格式
     */
    private static parseRelativeTime(timeStr: string): Date | null {
        const now = new Date();

        // 英文相对时间
        const relativeMatch = timeStr.match(/^in\s+(\d+)\s+(minutes?|hours?)$/i);
        if (relativeMatch) {
            const amount = parseInt(relativeMatch[1], 10);
            const unit = relativeMatch[2].toLowerCase();
            
            if (unit.startsWith('minute')) {
                return new Date(now.getTime() + amount * 60 * 1000);
            } else if (unit.startsWith('hour')) {
                return new Date(now.getTime() + amount * 60 * 60 * 1000);
            }
        }

        // 中文相对时间
        const chineseRelativeMatch = timeStr.match(/^(\d+)(分钟|小时)后$/);
        if (chineseRelativeMatch) {
            const amount = parseInt(chineseRelativeMatch[1], 10);
            const unit = chineseRelativeMatch[2];
            
            if (unit === '分钟') {
                return new Date(now.getTime() + amount * 60 * 1000);
            } else if (unit === '小时') {
                return new Date(now.getTime() + amount * 60 * 60 * 1000);
            }
        }

        return null;
    }

    /**
     * 从小时和分钟创建今天的时间
     */
    private static createTimeFromHourMinute(hours: number, minutes: number): Date | null {
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return null;
        }

        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    }

    /**
     * 格式化时间为显示字符串
     */
    static formatTime(date: Date): string {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    /**
     * 检查时间是否已过
     */
    static isPastTime(date: Date): boolean {
        return date.getTime() < Date.now();
    }

    /**
     * 获取时间状态 (即将到来、当前、已过)
     */
    static getTimeStatus(date: Date): 'upcoming' | 'current' | 'past' {
        const now = new Date();
        const diffMinutes = (date.getTime() - now.getTime()) / (1000 * 60);
        
        if (diffMinutes < -5) return 'past';
        if (diffMinutes > 5) return 'upcoming';
        return 'current';
    }

    /**
     * 将时间调整到最近的30分钟间隔
     */
    static roundToInterval(date: Date, intervalMinutes: number = this.INTERVAL_MINUTES): Date {
        const minutes = date.getMinutes();
        const roundedMinutes = Math.round(minutes / intervalMinutes) * intervalMinutes;
        const newDate = new Date(date);
        newDate.setMinutes(roundedMinutes, 0, 0);
        return newDate;
    }

    /**
     * 生成时间间隔数组（用于时间轴显示）
     */
    static generateTimeSlots(startHour: number, endHour: number, intervalMinutes: number = this.INTERVAL_MINUTES): Date[] {
        const slots: Date[] = [];
        const today = new Date();
        
        // 支持跨日期的时间槽生成，endHour可能超过24（如25表示第二天凌晨1点）
        const crossDate = endHour > 24;
        const totalIntervals = crossDate 
            ? Math.ceil(((24 - startHour) * 60 + (endHour - 24) * 60) / intervalMinutes) + 1
            : Math.ceil((endHour - startHour) * 60 / intervalMinutes) + 1;
        
        for (let i = 0; i < totalIntervals; i++) {
            const totalMinutes = i * intervalMinutes;
            const hour = startHour + Math.floor(totalMinutes / 60);
            const minute = totalMinutes % 60;
            
            if (hour < 24) {
                // 当天的时间槽
                slots.push(new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute));
            } else {
                // 第二天的时间槽
                const nextDayHour = hour - 24;
                const nextDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
                slots.push(new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate(), nextDayHour, minute));
                
                // 如果已经超过了目标结束时间，停止生成
                if (nextDayHour >= endHour - 24) {
                    break;
                }
            }
        }
        
        return slots;
    }

    /**
     * 格式化持续时间
     */
    static formatDuration(minutes: number): string {
        if (minutes < 60) {
            return `${minutes}分钟`;
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        if (remainingMinutes === 0) {
            return `${hours}小时`;
        }
        return `${hours}小时${remainingMinutes}分钟`;
    }

    /**
     * 计算时间跨度（用于时间轴渲染中的任务宽度计算）
     */
    static calculateTimeSpan(startTime: Date, endTime: Date, intervalMinutes: number = this.INTERVAL_MINUTES): number {
        const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
        return Math.max(1, Math.round(durationMinutes / intervalMinutes));
    }
}