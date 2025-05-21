import { App, Notice, Plugin, PluginSettingTab, Setting, TFolder } from 'obsidian';

import { DatePickerModal } from './modal/DatePickerModal';
import { generateSecureKey,verifySecureKey } from './tools/secureKey';
import { Task } from './model/Task';
import { TaskFormatter } from './model/TaskFormatter';
import * as url from 'url';
import * as http from 'http';
// Remember to rename these classes and interfaces!

interface GTDPluginSettings {
	savePath: string;
}

const DEFAULT_SETTINGS: GTDPluginSettings = {
	savePath: 'GTDPluginSettings_savePath',
}

export default class GTDPlugin extends Plugin {
	settings: GTDPluginSettings;
	_lastToken?: string;

	async onload() {
		await this.loadSettings();
		// ...existing onload code...
		this.startHttpServer(3001);
		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('ship-wheel', '同步今日任务', (evt: MouseEvent) => {
			this.handleRibbonClick();
		});

		this.registerObsidianProtocolHandler("obsidian_gtd_sync_task", async (e) => {
			new Notice('开始同步任务');
			console.log('Received protocol date :', e.date);
			if (!e || !e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
				console.error('Invalid date format or missing data');
				return;
			}
			console.log('Received data:', e.date);
			this.handleDateSelected(new Date(e.date));
		});


		// Perform additional things with the ribbon
		ribbonIconEl.addClass('obsidian-gtd-plugin-class');

		this.addSettingTab(new SettingTab(this.app, this));

	}

	onunload() {

	}

	

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	handleRibbonClick() {
		new DatePickerModal(this.app, (date: Date) => {
			this.handleDateSelected(date);
		}).open();
	}

	// 这里是一个简单的函数，用于处理日期选择器的回调
	// 你可以根据需要修改这个函数
	handleDateSelected(date: Date) {
		new Notice(`你选择的日期是: ${date.toLocaleDateString()}`);
		const { expires,token} = generateSecureKey();
		// 保存 token 和密钥到插件实例，供 HTTP Server 验证
		this._lastToken = token;
		const pad = (n: number) => n.toString().padStart(2, '0');
		const formatDateWithPad = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		const arg = encodeURIComponent(JSON.stringify({
			date: formatDateWithPad(date),
			token: token,
			expires: expires,
		}));
		const openPerspective = `omnifocus://localhost/omnijs-run?script=PlugIn.find(%22com.pazer.omnifocus.gtdplugin%22).action(%22openPerspective%22).perform(argument)&arg=${arg}`;
		window.open(openPerspective, '_blank');
		setTimeout(() => {
			// 这里可以放置需要延迟1秒执行的代码
			console.log('等待1秒中');
			const setPerspective = `omnifocus://localhost/omnijs-run?script=PlugIn.find(%22com.pazer.omnifocus.gtdplugin%22).action(%22setPerspective%22).perform(argument)&arg=${arg}`;
			window.open(setPerspective, '_blank');


		}, 1000);
		setTimeout(() => {
			// 这里可以放置需要延迟1秒执行的代码
			const urlString = `omnifocus://localhost/omnijs-run?script=PlugIn.find(%22com.pazer.omnifocus.gtdplugin%22).action(%22syncTodayTasks%22).perform(argument)&arg=${arg}`;
			window.open(urlString, '_blank');		
			console.log('继续 等待1秒中');
		}, 2000);

	}

	async startHttpServer(port = 3001) {
		const server = http.createServer((req, res) => {
			// 验证URL
			const urlString = req.url;
			if (urlString && urlString.startsWith('/api')) {
				this.handleApiRequest(req, res);
				return;
			}
			// 验证 Token
			const token = req.headers['token'] as string | undefined;
			const expiresHeader = req.headers['expires'] as string | undefined;
			const expires = expiresHeader ? parseInt(expiresHeader, 10) : Math.floor(Date.now() / 1000);
			if (token) {
				const isValid = verifySecureKey(expires, token);
				if (!isValid) {
					res.writeHead(401, { 'Content-Type': 'text/plain' });
					res.end('Invalid token.\n');
					return;
				}
			}
			let body = '';
			req.on('data', chunk => {
				body += chunk;
			});
			req.on('end', () => {
				res.writeHead(200, { 'Content-Type': 'text/plain' });
				if (body) {
					try {
						const jsonData = JSON.parse(body);
						this.syncTodayTasks(jsonData.data, jsonData.week, jsonData.date);
					} catch (e) {
						console.error('Failed to parse JSON:', e);
					}
				}
				res.end('GTDPlugin HTTP Server is running.\n');
			});
		});
		server.listen(port, () => {
			console.log(`HTTP server listening on port ${port}`);
		});
		this.register(() => server.close());
	}

	async syncTodayTasks(tasks: Task[], week: Task[],date: string) {
		if (date === undefined || date === null || date === ''|| !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			console.error('Invalid date');
			return;
		}
		// 按 dueDate 时间正序排序（无 dueDate 的排在最后）
		tasks.sort((a, b) => {
			if (!a.dueDate && !b.dueDate) return 0;
			if (!a.dueDate) return 1;
			if (!b.dueDate) return -1;
			return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
		});
		// 按属性区分任务
		const completedTasks = tasks.filter(task => task.completed);
		const ongoingTasks = tasks.filter(task => !task.completed && !task.dropDate);
		const droppedTasks = tasks.filter(task => task.dropDate);

		// 只保留 dueDate 与 date 在同一周的 week 任务
		const isSameWeek = (d1: string, d2: string) => {
			const date1 = new Date(d1);
			const date2 = new Date(d2);
			const getWeek = (d: Date) => {
				const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
				const dayOfYear = Math.floor((d.getTime() - firstDayOfYear.getTime()) / 86400000) + 1;
				return Math.ceil((dayOfYear + firstDayOfYear.getDay()) / 7);
			};
			console.log(date1.getFullYear(), date2.getFullYear(), getWeek(date1), getWeek(date2));
			return date1.getFullYear() === date2.getFullYear() && getWeek(date1) === getWeek(date2);
		};
		const weekGoals = week
			.filter(task => task.dueDate && isSameWeek(task.dueDate, date))
			.map(task => TaskFormatter.format(task,true));
		const ongoingLines = ongoingTasks.map(task => TaskFormatter.format(task));
		const completedLines = completedTasks.map(task => TaskFormatter.format(task));
		const droppedLines = droppedTasks.map(task => TaskFormatter.format(task));

		const lines: string[] = [];
		const yesterdayLines: string[] = [];

		// 查找 date 上一日的md文件，读取当中今日任务中，没有完成的任务
		const yesterday = new Date(date);
		yesterday.setDate(yesterday.getDate() - 1);
		const pad = (n: number) => n.toString().padStart(2, '0');
		const formatDateWithPad = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		const yesterdayFileName = `${formatDateWithPad(yesterday)}.md`;
		const yesterdayFilePath = this.settings.savePath + '/' + yesterdayFileName;
		try {
			const data = await this.app.vault.adapter.read(yesterdayFilePath);
			const yesterdayTask = data.split('\n').filter(line => line.startsWith('- [ ]'));
			if (yesterdayTask.length > 0) {
				yesterdayLines.push(...yesterdayTask);
			}
		} catch (err) {
			console.warn(`Failed to read yesterday's file: ${yesterdayFilePath}`, err);
		}
		if (weekGoals.length > 0) {
			const weekNumber = (() => {
				const d = new Date(date);
				const oneJan = new Date(d.getFullYear(), 0, 1);
				const days = Math.floor((d.getTime() - oneJan.getTime()) / 86400000);
				return Math.ceil((days + oneJan.getDay() + 1) / 7);
			})();
			lines.push(`## ${new Date(date).getFullYear()}年${weekNumber}周目标 - ${weekGoals.length} 个\n`);
			lines.push(...weekGoals);
		}
		
		if (yesterdayLines.length > 0) {
			lines.push(`## 昨日任务 - ${yesterdayLines.length} 个\n`);
			lines.push(...yesterdayLines);
		}
		if (ongoingLines.length > 0) {
			// 去重：如果 yesterdayLines 中的任务（按开头内容）和 ongoingLines 有重复，则 ongoingLines 只保留不重复的
			const yesterdayTaskSet = new Set(
				yesterdayLines.map(line => line.replace(/\(omnifocus:\/\/\/task\/[^\)]*\).*/, '').trim())
			);
			const filteredOngoingLines = ongoingLines.filter(line => {
				const key = line.replace(/\(omnifocus:\/\/\/task\/[^\)]*\).*/, '').trim();
				return !yesterdayTaskSet.has(key);
			});
			lines.push(`\n## 今日任务 - ${filteredOngoingLines.length} 个\n`);
			lines.push(...filteredOngoingLines);
		}
		if (completedLines.length > 0) {
			lines.push(`\n## 已完成任务 - ${completedLines.length} 个\n`);
			lines.push(...completedLines);
		}
		lines.push(`\n## 已丢弃任务 - ${droppedLines.length} 个\n`);
		if (droppedLines.length > 0) lines.push(...droppedLines);
		lines.push('\n');
		// 将tasks 换分为三类，已完成，进行中，已丢弃

		const content = lines.join('\n');

		// 生成文件名
		console.log('date:', date);
		const fileName = `${date.replace(/\//g, '-').replace(/-/g, '-').replace(/^\s+|\s+$/g, '')}.md`;
		// settings 当中path路径加入fileName 
		const filePath = this.settings.savePath + '/' + fileName;
		// 写入 Obsidian 笔记
		this.app.vault.adapter.write(filePath, content)
			.then(() => {
				console.log(`Tasks synced to ${fileName}`);
				new Notice(`任务已同步到 ${fileName}`);
				this.app.workspace.openLinkText(filePath, '', false);
			})
			.catch((err: unknown) => {
				console.error('Failed to write tasks to file:', err);
			});
	}

	// 处理API 请求
	async handleApiRequest(req: http.IncomingMessage, res: http.ServerResponse) {
		const parsedUrl = url.parse(req.url ?? '', true);
		const pathname = parsedUrl.pathname ?? '';
		const pathSegments = pathname.split('/').filter(Boolean);
		// 获取路径参数
		const pathParam = pathSegments.length > 2 ? pathSegments[1] : undefined; // 提取路径参数
		// 获取GTD 当中的任务
		if (pathParam === 'getTasks') {
			const date = pathSegments.length > 2 ? pathSegments[2] : undefined;
			const type = pathSegments.length > 2 ? pathSegments[3] : undefined;
			const dataFormatter = pathSegments.length > 2 ? pathSegments[4] : null;
			const dateFileName = date
				? `${date.replace(/\//g, '-').replace(/-/g, '-').replace(/^\s+|\s+$/g, '')}.md`
				: '';
			const dateFilePath = this.settings.savePath + '/' + dateFileName;
			try {
				const data = await this.app.vault.adapter.read(dateFilePath);
				switch (type) {
					case 'completed': {
						let completedTasks;
						if (!dataFormatter) {
							completedTasks = await this.getTasksFromMarkdown(data.split('\n').filter(line => line.startsWith('- [x]')));
						} else {
							completedTasks = data.split('\n').filter(line => line.startsWith('- [x]'));
						}
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ ok: true, data: completedTasks }));
						break;
					}
					case 'ongoing': {
						let ongoingTasks;
						if (!dataFormatter) {
							ongoingTasks = await this.getTasksFromMarkdown(data.split('\n').filter(line => line.startsWith('- [ ]')));
						} else {
							ongoingTasks = data.split('\n').filter(line => line.startsWith('- [ ]'));
						}
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ ok: true, data: ongoingTasks }));
						break;
					}
					case 'dropped': {
						let droppedTasks;
						if (!dataFormatter) {
							droppedTasks = await this.getTasksFromMarkdown(data.split('\n').filter(line => line.startsWith('❌')));
						} else {
							droppedTasks = data.split('\n').filter(line => line.startsWith('❌'));
						}
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ ok: true, data: droppedTasks }));
						break;
					}
					case 'all': {
						let allTasks;
						if (!dataFormatter) {
							allTasks = await this.getTasksFromMarkdown(
								data.split('\n').filter(line => 
									line.trim() !== '' && // 排除空行
									!line.startsWith('#') && // 排除标题行
									!/^\s/.test(line) // 排除缩进行
								)
							);
						} else {
							allTasks = data.split('\n').filter(line => 
								line.trim() !== '' && // 排除空行
								!line.startsWith('#') && // 排除标题行
								!/^\s/.test(line) // 排除缩进行
							);
						}
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ ok: true, data: allTasks }));
						break;
					}
					default: {
						res.writeHead(400, { 'Content-Type': 'text/plain' });
						res.end('Invalid type parameter.\n');
					}
				}
			}
			catch (err) {
				console.error(`Failed to read file: ${dateFilePath}`, err);
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				res.end('Failed to read file.\n');
			}
		}
		if (!res.headersSent) {
			res.writeHead(200, { 'Content-Type': 'application/json' });
		}
		res.end(JSON.stringify({ pathParam }));
	}

	async getTasksFromMarkdown(lines: string[]) {
		const tasks: Task[] = [];

		for (const line of lines) {
			const task = TaskFormatter.parseLineToTask(line);
			if (task) {
				tasks.push(task);
			}
		}
		return tasks;
	}


}


class SettingTab extends PluginSettingTab {
	plugin: GTDPlugin;

	constructor(app: App, plugin: GTDPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// 获取库内所有文件夹路径
		const folders = this.app.vault.getAllLoadedFiles()
			.filter(f => f instanceof TFolder)
			.map(f => f.path);

		new Setting(containerEl)
			.setName('文件路径')
			.setDesc('选择用于保存的文件夹路径')
			.addDropdown(dropdown => {
				folders.forEach(folder => {
					dropdown.addOption(folder, folder);
				});
				// 默认值
				// 如果当前设置的路径不存在于文件夹列表，则添加
				if (this.plugin.settings.savePath && !folders.includes(this.plugin.settings.savePath)) {
					dropdown.addOption(this.plugin.settings.savePath, this.plugin.settings.savePath);
				}
				dropdown.setValue(this.plugin.settings.savePath);
				dropdown.onChange(async (value) => {
					this.plugin.settings.savePath = value;
					await this.plugin.saveSettings();
				});
			});
	}
}


