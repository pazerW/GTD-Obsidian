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

	static format(task: Task,weekGoals=false): string {
		const parts: string[] = [];
		if (task.flagged) parts.push('🚩');
		if (weekGoals) {
			parts.push(` [${task.name}](omnifocus:///task/${task.id})`);

		}else if (task.dropDate) {
			const date = new Date(task.dropDate);
			parts.push(`❌ ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} [${task.name}](omnifocus:///task/${task.id})`);
		} else {
			parts.push(`- [${task.completed ? 'x' : ' '}] [${task.name}](omnifocus:///task/${task.id})`);
		}
		if (task.project && !weekGoals) parts.push(`🗄️ ${task.project}`);
		if (task.tags?.length) parts.push(`🏷️ ${task.tags.join(', ')}`);
		if (task.repetitionRule) parts.push(`🔁 ${this.parseRRULE(task.repetitionRule)}`);
		if (task.dueDate && !weekGoals) {
			const date = new Date(task.dueDate);
			parts.push(`📅 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`);
		}
		if (task.estimatedMinutes && !weekGoals) parts.push(`⌛ ${task.estimatedMinutes}分钟`);
		if (task.deferDate) {
			const date = new Date(task.deferDate);
			parts.push(`🧊 ${(date.getMonth() + 1).toString().padStart(2, '0')}月${date.getDate().toString().padStart(2, '0')}日`);
		}
		if (task.completionDate) {
			const date = new Date(task.completionDate);
			parts.push(`✅ ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`);
		}
		if (task.note && !weekGoals) parts.push(`📔 ${task.note.replace(/\r?\n/g, ' ')}`);
		return parts.join(' ');
	}

	static parseLineToTask(line: string): any {
		// - [ ] [「回归」2.声音是人的第二名片](omnifocus:///task/mRkb257lHbX) 🗄️ 配音学习 🏷️ Today 你好 🔁 每天 📅 13:30 ⌛ 30分钟 🧊 23:59 ✅ 23:59 📔 你好
		const regex = /- \[(x| )\] \[([^\]]+)\]\(omnifocus:\/\/\/task\/([^\)]+)\)(.*)/;
		const match = line.match(regex);
		if (!match) return null;

		const [, completed, name, id, rest] = match;
		const task: any = {
			id,
			name,
			completed: completed === 'x',
			project: '',
			tags: [],
			repetitionRule: null,
			dueDate: null,
			estimatedMinutes: null,
			deferDate: null,
			completionDate: null,
			note: '',
			flagged: false,
			dropDate: null
		};

		let remain = rest;

		// 🚩
		if (remain.includes('🚩')) {
			task.flagged = true;
			remain = remain.replace('🚩', '');
		}

		// 🗄️ 项目
		const projectMatch = remain.match(/🗄️ ([^🏷️🔁📅⌛🧊✅📔]+)/);
		if (projectMatch) {
			task.project = projectMatch[1].trim();
			remain = remain.replace(projectMatch[0], '');
		}

		// 🏷️ 标签
		const tagsMatch = remain.match(/🏷️ ([^🔁📅⌛🧊✅📔]+)/);
		if (tagsMatch) {
			task.tags = tagsMatch[1].split(' ').map(t => t.trim()).filter(Boolean);
			remain = remain.replace(tagsMatch[0], '');
		}

		// 🔁 重复规则
		const repeatMatch = remain.match(/🔁 ([^📅⌛🧊✅📔]+)/);
		if (repeatMatch) {
			task.repetitionRule = repeatMatch[1].trim();
			remain = remain.replace(repeatMatch[0], '');
		}

		// 📅 截止时间
		const dueMatch = remain.match(/📅 (\d{2}):(\d{2})/);
		if (dueMatch) {
			const now = new Date();
			now.setHours(Number(dueMatch[1]), Number(dueMatch[2]), 0, 0);
			task.dueDate = now.toISOString();
			remain = remain.replace(dueMatch[0], '');
		}

		// ⌛ 预计时间
		const estMatch = remain.match(/⌛ (\d+)分钟/);
		if (estMatch) {
			task.estimatedMinutes = Number(estMatch[1]);
			remain = remain.replace(estMatch[0], '');
		}

		// 🧊 推迟日期
		const deferMatch = remain.match(/🧊 (\d{2})月(\d{2})日/);
		if (deferMatch) {
			const now = new Date();
			now.setMonth(Number(deferMatch[1]) - 1, Number(deferMatch[2]));
			task.deferDate = now.toISOString();
			remain = remain.replace(deferMatch[0], '');
		}

		// ✅ 完成时间
		const compMatch = remain.match(/✅ (\d{2}):(\d{2})/);
		if (compMatch) {
			const now = new Date();
			now.setHours(Number(compMatch[1]), Number(compMatch[2]), 0, 0);
			task.completionDate = now.toISOString();
			remain = remain.replace(compMatch[0], '');
		}

		// ❌ 丢弃时间
		const dropMatch = remain.match(/❌ (\d{2}):(\d{2})/);
		if (dropMatch) {
			const now = new Date();
			now.setHours(Number(dropMatch[1]), Number(dropMatch[2]), 0, 0);
			task.dropDate = now.toISOString();
			remain = remain.replace(dropMatch[0], '');
		}

		// 📔 备注
		const noteMatch = remain.match(/📔 (.+)$/);
		if (noteMatch) {
			task.note = noteMatch[1].trim();
			remain = remain.replace(noteMatch[0], '');
		}

		return task;
	}
}
