import { Task } from './Task';

export class TaskFormatter {
	private static WEEKDAY_MAP: Record<string, string> = {
		'MO': '周一', 'TU': '周二', 'WE': '周三', 'TH': '周四',
		'FR': '周五', 'SA': '周六', 'SU': '周日'
	};
	private static FREQ_EMOJI: Record<string, string> = {
		'MINUTELY': '⏱️', 'HOURLY': '🕒', 'DAILY': '🌞',
		'WEEKLY': '📅', 'MONTHLY': '🌙', 'YEARLY': '🎆'
	};

	static parseRRULE(rrule: string): string {
		const params = new URLSearchParams(rrule.replace(/;/g, '&'));
		let freq = params.get('FREQ');
		switch (freq) {
			case 'MINUTELY':
			case 'minutely': freq = '分钟'; break;
			case 'HOURLY':
			case 'hourly': freq = '小时'; break;
			case 'DAILY':
			case 'daily': freq = '天'; break;
			case 'WEEKLY':
			case 'weekly': freq = '周'; break;
			case 'MONTHLY':
			case 'monthly': freq = '月'; break;
			case 'YEARLY':
			case 'yearly': freq = '年'; break;
			case 'SECONDLY':
			case 'secondly': freq = '秒'; break;
		}
		const interval = params.get('INTERVAL') || '';
		let display = '';
		if (freq && this.FREQ_EMOJI[freq]) {
			display = `${this.FREQ_EMOJI[freq]} 每${interval}${freq.toLowerCase()}`;
		} else if (freq) {
			display = `每${interval}${freq.toLowerCase()}`;
		}
		if (params.has('BYDAY')) {
			const byday = params.get('BYDAY');
			if (byday) {
				const days = byday.split(',').map(d => this.WEEKDAY_MAP[d] || d);
				display += `（${days.join('、')}）`;
			}
		}
		if (params.has('COUNT')) display += ` [共${params.get('COUNT')}次]`;
		return display;
	}

	static extractAllKeysAndValues(obj: any, prefix = ''): Record<string, any> {
		const result: Record<string, any> = {};
		for (const key in obj) {
			if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
			const value = obj[key];
			const fullKey = prefix ? `${prefix}.${key}` : key;
			if (value && typeof value === 'object' && !Array.isArray(value)) {
				Object.assign(result, this.extractAllKeysAndValues(value, fullKey));
			} else {
				result[fullKey] = value;
			}
		}
		return result;
	}


	static format(task: Task,weekGoals=false): string {
		const parts: string[] = [];
				// 将task 所有的key 和value 格式化为json字符串，组成一个URL的参数；
		const allTaskProps = this.extractAllKeysAndValues(task);
		const taskParams = encodeURIComponent(JSON.stringify(allTaskProps));
		// let taskName = `task.projectask.name`;
		const nameParts = [
			// Array.isArray(task.parentFolders) ? task.parentFolders.join('/') : task.parentFolders,
			`【${task.project}】`,
			task.name,
		].filter(Boolean);
		let taskName = nameParts.join('');
		taskName = taskName.replace(/[\r\n]/g, '').slice(0, 100);
		if (weekGoals) {
			parts.push(` [${taskName}](omnifocus:///task/${task.id}?params=${taskParams})`);

		}else if (task.dropDate) {
			const date = new Date(task.dropDate);
			parts.push(`❌ ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} [${taskName}](omnifocus:///task/${task.id}?params=${taskParams})`);
		} else {
			parts.push(`- [${task.completed ? 'x' : ' '}] [${taskName}](omnifocus:///task/${task.id}?params=${taskParams})`);
		}
		if (task.flagged) parts.push('🚩');
		if (task.tags?.length) parts.push(`🏷️ ${task.tags.join(', ')}`);
		if (task.dueDate) {
			const date = new Date(task.dueDate);
			parts.push(`📅 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`);
		}

		if (task.completionDate) {
			const date = new Date(task.completionDate);
			parts.push(`✅ ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`);
		}
		// if (task.note && !weekGoals) parts.push(`📔 ${task.note.replace(/\r?\n/g, ' ')}`);
		return parts.join(' ');
	}

	static formatTimeline(task: Task): string {
		const parts: string[] = [];
				// 将task 所有的key 和value 格式化为json字符串，组成一个URL的参数；
		// let taskName = `task.projectask.name`;
		const nameParts = [
			// Array.isArray(task.parentFolders) ? task.parentFolders.join('/') : task.parentFolders,
			`【${task.project}】`,
			task.name,
		].filter(Boolean);
		let taskName = nameParts.join('');
		taskName = taskName.replace(/[\r\n]/g, '').slice(0, 100);
		if (task.dropDate) {
			const date = new Date(task.dropDate);
			parts.push(`❌ ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} ${taskName}	`);
		} else {
			parts.push(`- [ ]${task.completed ? 'x' : ' '} ${taskName}`);
		}
		if (task.flagged) parts.push('🚩');
		if (task.tags?.length) parts.push(`🏷️ ${task.tags.join(', ')}`);
		if (task.dueDate) {
			const date = new Date(task.dueDate);
			const estimatedMinutes = task.estimatedMinutes ? task.estimatedMinutes : 25;

			// 结束时间是，date，开始时间是 结束时间 - 预计时间
			const startDate = new Date(date.getTime() - estimatedMinutes * 60000);
			parts.push(`@${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}-${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`);
	
		}

		// if (task.note && !weekGoals) parts.push(`📔 ${task.note.replace(/\r?\n/g, ' ')}`);
		return parts.join(' ');
	}

	static parseLineToTask(line: string): any {
		// - [ ] [「回归」2.声音是人的第二名片](omnifocus:///task/mRkb257lHbX) 🗄️ 配音学习 🏷️ Today 你好 🔁 每天 📅 13:30 ⌛ 30分钟 🧊 23:59 ✅ 23:59 📔 你好
		//  [跑步30km](omnifocus:///task/fIM-Mu_UUkV?params=%7B%22name%22%3A%22%E8%B7%91%E6%AD%A530km%22%2C%22id%22%3A%22fIM-Mu_UUkV%22%2C%22note%22%3A%22%22%2C%22dueDate%22%3A%222025-05-24T01%3A00%3A00.000Z%22%2C%22deferDate%22%3Anull%2C%22dropDate%22%3Anull%2C%22flagged%22%3Atrue%2C%22completed%22%3Afalse%2C%22completionDate%22%3Anull%2C%22estimatedMinutes%22%3Anull%2C%22added%22%3A%222025-05-17T10%3A22%3A01.466Z%22%2C%22repetitionRule%22%3A%22%22%2C%22modified%22%3A%222025-05-17T10%3A26%3A24.274Z%22%2C%22inInbox%22%3Afalse%2C%22tags%22%3A%5B%22Week%22%5D%2C%22hasChildren%22%3Afalse%2C%22assignedContainer%22%3Anull%2C%22project%22%3A%22%E7%9B%AE%E6%A0%87%22%2C%22parent%22%3A%22%E7%9B%AE%E6%A0%87%22%2C%22folder%22%3A%22%E8%AE%A1%E5%88%92%E4%B8%8E%E7%9B%AE%E6%A0%87%22%2C%22parentFolders%22%3A%5B%22%E8%AE%A1%E5%88%92%E4%B8%8E%E7%9B%AE%E6%A0%87%22%5D%7D) 🚩 🏷️ Week
		const paramsMatch = line.match(/\?params=([^)\]]+)/);
		if (paramsMatch) {
			try {
				const jsonStr = decodeURIComponent(paramsMatch[1]);
				const obj = JSON.parse(jsonStr);
				return obj;
			} catch (e) {
				return null;
			}
		}
	}
}
