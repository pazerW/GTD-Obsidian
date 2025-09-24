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
	// 新增字段：支持更丰富的时间信息
	startTime?: string | null;        // 开始时间 (HH:mm 格式)
	dueTime?: string | null;          // 截止时间 (HH:mm 格式)
	duration?: number | null;         // 持续时间（分钟）
	actualStartTime?: string | null;  // 实际开始时间（支持拖拽修改）
	actualDuration?: number | null;   // 实际持续时间（支持拖拽修改）
};
