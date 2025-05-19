// Task 类型定义
export type Task = {
	name: string;
	id: string;
	note?: string;
	dueDate?: string | null;
	deferDate?: string | null;
	dropDate?: string | null;
	flagged?: boolean;
	completed?: boolean;
	completionDate?: string | null;
	estimatedMinutes?: number | null;
	repetitionRule?: string | null;
	added?: string;
	modified?: string;
	inInbox?: boolean;
	tags?: string[];
	hasChildren?: boolean;
	assignedContainer?: string | null;
	project?: string;
	parent?: string;
	folder?: string;
	parentFolders?: string[];
};
